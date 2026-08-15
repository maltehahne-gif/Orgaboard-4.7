from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4
import json
import mimetypes
import os
import re

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import get_settings
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.timeutils import local_today
from app.core.security import get_current_user, require_csrf
from app.models import (
    Message,
    MessageAttachment,
    MessageHidden,
    MessageRead,
    User,
)
from app.routers.buntewoche import make_payload, monday_of
from app.services.realtime import manager


router = APIRouter(prefix="/messages", tags=["messages"])
settings = get_settings()

MEDIA_ROOT = Path(
    os.getenv("CHAT_MEDIA_DIR", "/data/chat-media")
)

MAX_FILES = 5
MAX_TOTAL_BYTES = 50 * 1024 * 1024
MAX_FILE_BYTES = 25 * 1024 * 1024

BLOCKED_SUFFIXES = {
    ".html",
    ".htm",
    ".svg",
    ".js",
    ".mjs",
    ".exe",
    ".bat",
    ".cmd",
    ".sh",
    ".ps1",
}


# Eine Chatnachricht ist keine Datei. Ohne Grenze laesst sich ein
# Textdokument in den Verlauf kippen, das danach in jedem Client bei jedem
# Laden mitgerendert wird.
MAX_NACHRICHT_ZEICHEN = 5000


class MessageIn(BaseModel):
    recipient_user_id: str | None = None
    body: str = Field(max_length=MAX_NACHRICHT_ZEICHEN)


class ConversationReadIn(BaseModel):
    recipient_user_id: str | None = None
    team: bool = False


class ShareBunteWocheIn(BaseModel):
    recipient_user_id: str | None = None
    employee_id: str | None = None
    week_start: date | None = None


def access_condition(user_id: str):
    return or_(
        Message.sender_user_id == user_id,
        Message.recipient_user_id == user_id,
        Message.recipient_user_id.is_(None),
    )


def conversation_condition(
    user_id: str,
    recipient_user_id: str | None = None,
    team: bool = False,
):
    if team:
        return Message.recipient_user_id.is_(None)

    if recipient_user_id:
        return or_(
            and_(
                Message.sender_user_id == user_id,
                Message.recipient_user_id == recipient_user_id,
            ),
            and_(
                Message.sender_user_id == recipient_user_id,
                Message.recipient_user_id == user_id,
            ),
        )

    return access_condition(user_id)


def visible_stmt(user_id: str):
    return (
        select(Message)
        .where(access_condition(user_id))
        .where(
            ~Message.id.in_(
                select(MessageHidden.message_id).where(
                    MessageHidden.user_id == user_id
                )
            )
        )
    )


def is_hidden(
    db: Session,
    message_id: str,
    user_id: str,
) -> bool:
    return bool(
        db.scalar(
            select(MessageHidden.id).where(
                MessageHidden.message_id == message_id,
                MessageHidden.user_id == user_id,
            )
        )
    )


def can_access_message(
    db: Session,
    message: Message,
    user_id: str,
) -> bool:
    if is_hidden(db, message.id, user_id):
        return False

    if message.recipient_user_id is None:
        return True

    return user_id in {
        message.sender_user_id,
        message.recipient_user_id,
    }


def has_read(
    db: Session,
    message_id: str,
    user_id: str,
) -> bool:
    return bool(
        db.scalar(
            select(MessageRead.id).where(
                MessageRead.message_id == message_id,
                MessageRead.user_id == user_id,
            )
        )
    )


def ensure_read(
    db: Session,
    message: Message,
    user_id: str,
) -> bool:
    if message.sender_user_id == user_id:
        return False

    if has_read(db, message.id, user_id):
        return False

    db.add(
        MessageRead(
            message_id=message.id,
            user_id=user_id,
        )
    )

    if (
        message.recipient_user_id == user_id
        and message.read_at is None
    ):
        message.read_at = datetime.now(timezone.utc)

    return True


def safe_filename(name: str | None) -> str:
    value = Path(name or "datei").name
    value = re.sub(r"[\x00-\x1f\x7f]", "", value)
    value = value.strip() or "datei"

    if len(value) > 180:
        suffix = Path(value).suffix[:15]
        value = value[:160] + suffix

    return value


def attachment_metadata(
    attachment: MessageAttachment,
) -> dict:
    if not attachment.metadata_json:
        return {}

    try:
        value = json.loads(attachment.metadata_json)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def serialize_attachment(
    attachment: MessageAttachment,
) -> dict:
    has_file = bool(attachment.storage_name)

    return {
        "id": attachment.id,
        "kind": attachment.kind,
        "file_name": attachment.file_name,
        "content_type": attachment.content_type,
        "size_bytes": attachment.size_bytes,
        "metadata": attachment_metadata(attachment),
        "content_url": (
            f"{settings.api_prefix}/messages/"
            f"attachments/{attachment.id}/content"
            if has_file
            else None
        ),
        "download_url": (
            f"{settings.api_prefix}/messages/"
            f"attachments/{attachment.id}/content"
            f"?download=true"
            if has_file
            else None
        ),
    }


def read_counts_for(db: Session, message_ids: list[str]) -> dict[str, int]:
    """Wie viele Personen eine Nachricht gelesen haben.

    In einer Abfrage für die ganze Liste - einzeln je Nachricht waeren das
    bei 500 Eintraegen 500 Abfragen.
    """
    if not message_ids:
        return {}
    rows = db.execute(
        select(MessageRead.message_id, func.count(MessageRead.id))
        .where(MessageRead.message_id.in_(message_ids))
        .group_by(MessageRead.message_id)
    ).all()
    return {mid: int(anzahl) for mid, anzahl in rows}


def delivery_state(
    db: Session,
    message: Message,
    user_id: str,
    read_count: int | None = None,
) -> dict | None:
    """Zustellstatus - nur für eigene Nachrichten.

    Bei fremden Nachrichten ergibt die Angabe keinen Sinn: Der Leser weiss
    selbst, ob er sie gelesen hat.

    Wichtig: message.read_at wird nur bei privaten Nachrichten gesetzt, weil
    es dort genau einen Empfaenger gibt. Team-Nachrichten haben mehrere, ihr
    Stand steckt in message_reads.
    """
    if message.sender_user_id != user_id:
        return None

    if message.recipient_user_id is not None:
        return {
            "delivered": True,
            "read": message.read_at is not None,
            "read_at": message.read_at,
            "read_by": 1 if message.read_at else 0,
        }

    if read_count is None:
        read_count = read_counts_for(db, [message.id]).get(message.id, 0)

    return {
        "delivered": True,
        "read": read_count > 0,
        "read_at": None,
        "read_by": read_count,
    }


def serialize(
    db: Session,
    message: Message,
    user_id: str,
    read_count: int | None = None,
):
    sender = db.get(User, message.sender_user_id)
    recipient = (
        db.get(User, message.recipient_user_id)
        if message.recipient_user_id
        else None
    )

    attachments = db.scalars(
        select(MessageAttachment)
        .where(MessageAttachment.message_id == message.id)
        .order_by(MessageAttachment.created_at)
    ).all()

    is_read = (
        message.sender_user_id == user_id
        or has_read(db, message.id, user_id)
        or (
            message.recipient_user_id == user_id
            and message.read_at is not None
        )
    )

    deleted = message.deleted_at is not None

    return {
        "id": message.id,
        "sender_user_id": message.sender_user_id,
        "sender_name": sender.full_name if sender else None,
        "recipient_user_id": message.recipient_user_id,
        "recipient_name": (
            recipient.full_name
            if recipient
            else "Team"
        ),
        "body": "" if deleted else message.body,
        "created_at": message.created_at,
        "read_at": message.read_at,
        "is_read": is_read,
        "edited_at": message.edited_at,
        "deleted_at": message.deleted_at,
        "deleted": deleted,
        "delivery": delivery_state(db, message, user_id, read_count),
        "attachments": [] if deleted else [
            serialize_attachment(a)
            for a in attachments
        ],
    }


def unread_stmt(user_id: str):
    return (
        visible_stmt(user_id)
        .where(Message.sender_user_id != user_id)
        .where(
            or_(
                Message.recipient_user_id.is_(None),
                and_(
                    Message.recipient_user_id == user_id,
                    Message.read_at.is_(None),
                ),
            )
        )
        .where(
            ~Message.id.in_(
                select(MessageRead.message_id).where(
                    MessageRead.user_id == user_id
                )
            )
        )
    )


def validate_recipient(
    db: Session,
    user: User,
    recipient_user_id: str | None,
):
    if recipient_user_id == user.id:
        raise HTTPException(
            status_code=400,
            detail="Du kannst dir nicht selbst privat schreiben",
        )

    if (
        recipient_user_id
        and not db.get(User, recipient_user_id)
    ):
        raise HTTPException(
            status_code=404,
            detail="Empfänger nicht gefunden",
        )


@router.get("")
def list_messages(
    recipient_user_id: str | None = None,
    team: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if team and recipient_user_id:
        raise HTTPException(
            status_code=400,
            detail="Team und Privat können nicht gleichzeitig gewählt werden",
        )

    validate_recipient(
        db,
        user,
        recipient_user_id,
    )

    stmt = visible_stmt(user.id)

    if team or recipient_user_id:
        stmt = stmt.where(
            conversation_condition(
                user.id,
                recipient_user_id=recipient_user_id,
                team=team,
            )
        )

    stmt = (
        stmt
        .order_by(Message.created_at.desc())
        .limit(500)
    )

    nachrichten = db.scalars(stmt).all()
    zaehler = read_counts_for(db, [m.id for m in nachrichten])

    return [
        serialize(db, message, user.id, zaehler.get(message.id, 0))
        for message in nachrichten
    ]


@router.get("/unread")
def unread_messages(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        unread_stmt(user.id)
        .order_by(Message.created_at.desc())
    ).all()

    team = 0
    by_user: dict[str, int] = {}

    for message in rows:
        if message.recipient_user_id is None:
            team += 1
        else:
            by_user[message.sender_user_id] = (
                by_user.get(message.sender_user_id, 0) + 1
            )

    return {
        "total": len(rows),
        "team": team,
        "by_user": by_user,
    }


@router.post("", dependencies=[Depends(require_csrf)])
async def send_message(
    data: MessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    body = data.body.strip()

    if not body:
        raise HTTPException(
            status_code=400,
            detail="Nachricht ist leer",
        )

    validate_recipient(
        db,
        user,
        data.recipient_user_id,
    )

    message = Message(
        sender_user_id=user.id,
        recipient_user_id=data.recipient_user_id,
        body=body,
    )

    db.add(message)
    db.flush()

    audit(
        db,
        user,
        "message.sent",
        "message",
        message.id,
    )

    db.commit()

    await manager.publish(
        {
            "type": "message.new",
            "message_id": message.id,
        },
        user_id=data.recipient_user_id,
    )

    return serialize(db, message, user.id)


@router.post(
    "/with-files",
    dependencies=[Depends(require_csrf)],
)
async def send_message_with_files(
    recipient_user_id: str | None = Form(default=None),
    body: str = Form(default=""),
    kind: str = Form(default="file"),
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipient_user_id = recipient_user_id or None
    kind = kind.strip().lower()

    validate_recipient(
        db,
        user,
        recipient_user_id,
    )

    if kind not in {"image", "file", "audio"}:
        raise HTTPException(
            status_code=400,
            detail="Ungültiger Anhangstyp",
        )

    if not files:
        raise HTTPException(
            status_code=400,
            detail="Keine Datei ausgewählt",
        )

    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail="Maximal 5 Dateien gleichzeitig",
        )

    if kind == "audio" and len(files) != 1:
        raise HTTPException(
            status_code=400,
            detail="Eine Sprachnachricht pro Nachricht",
        )

    MEDIA_ROOT.mkdir(
        parents=True,
        exist_ok=True,
    )

    created_paths: list[Path] = []
    total_size = 0

    try:
        message = Message(
            sender_user_id=user.id,
            recipient_user_id=recipient_user_id,
            body=body.strip(),
        )

        db.add(message)
        db.flush()

        for upload in files:
            name = safe_filename(upload.filename)
            suffix = Path(name).suffix.lower()

            content_type = (
                upload.content_type
                or mimetypes.guess_type(name)[0]
                or "application/octet-stream"
            ).lower()

            if suffix in BLOCKED_SUFFIXES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Dateityp {suffix} ist nicht erlaubt",
                )

            if kind == "image":
                if (
                    not content_type.startswith("image/")
                    or content_type == "image/svg+xml"
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="Bitte nur Bilddateien auswählen",
                    )

            if kind == "audio":
                if not (
                    content_type.startswith("audio/")
                    or content_type in {
                        "video/mp4",
                        "application/octet-stream",
                    }
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="Ungültiges Audioformat",
                    )

            storage_name = (
                f"{uuid4().hex}"
                f"{suffix[:15]}"
            )

            target = MEDIA_ROOT / storage_name
            size = 0

            with target.open("wb") as handle:
                while True:
                    chunk = await upload.read(
                        1024 * 1024
                    )

                    if not chunk:
                        break

                    size += len(chunk)
                    total_size += len(chunk)

                    if size > MAX_FILE_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=(
                                "Eine einzelne Datei darf "
                                "maximal 25 MB groß sein"
                            ),
                        )

                    if total_size > MAX_TOTAL_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=(
                                "Die Nachricht darf insgesamt "
                                "maximal 50 MB enthalten"
                            ),
                        )

                    handle.write(chunk)

            created_paths.append(target)

            db.add(
                MessageAttachment(
                    message_id=message.id,
                    kind=kind,
                    file_name=name,
                    content_type=content_type,
                    size_bytes=size,
                    storage_name=storage_name,
                )
            )

            await upload.close()

        audit(
            db,
            user,
            "message.sent_with_files",
            "message",
            message.id,
            after={
                "kind": kind,
                "file_count": len(files),
                "total_size": total_size,
            },
        )

        db.commit()

    except Exception:
        db.rollback()

        for path in created_paths:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass

        raise

    await manager.publish(
        {
            "type": "message.new",
            "message_id": message.id,
        },
        user_id=recipient_user_id,
    )

    return serialize(
        db,
        message,
        user.id,
    )


@router.post(
    "/share-buntewoche",
    dependencies=[Depends(require_csrf)],
)
async def share_buntewoche(
    data: ShareBunteWocheIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validate_recipient(
        db,
        user,
        data.recipient_user_id,
    )

    employee_id = scoped_employee_id(
        db,
        user,
        data.employee_id,
    )

    if employee_id is None:
        raise HTTPException(
            status_code=400,
            detail="Mitarbeiter für Bunte Woche fehlt",
        )

    week = monday_of(
        data.week_start or local_today()
    )

    payload = make_payload(
        db,
        employee_id,
        week,
    )

    metadata = {
        "employee_name": payload["employee"]["name"],
        "calendar_week": payload["calendar_week"],
        "week_start": payload["week_start"],
        "week_end": payload["week_end"],
        "week_revenue_cents": payload[
            "week_revenue_cents"
        ],
        "week_units": payload["week_units"],
        "units_target": payload["units_target"],
        "appointments": [
            {
                "start_at": (
                    a["start_at"].isoformat()
                    if hasattr(a["start_at"], "isoformat")
                    else str(a["start_at"])
                ),
                "label": a["label"],
                "appointment_type": a[
                    "appointment_type"
                ],
                "status": a["status"],
            }
            for a in payload["appointments"]
        ],
    }

    message = Message(
        sender_user_id=user.id,
        recipient_user_id=data.recipient_user_id,
        body=(
            f"Bunte Woche · KW "
            f"{payload['calendar_week']} · "
            f"{payload['employee']['name']}"
        ),
    )

    db.add(message)
    db.flush()

    db.add(
        MessageAttachment(
            message_id=message.id,
            kind="buntewoche",
            metadata_json=json.dumps(
                metadata,
                ensure_ascii=False,
                default=str,
            ),
        )
    )

    audit(
        db,
        user,
        "message.shared_buntewoche",
        "message",
        message.id,
        after={
            "calendar_week": payload[
                "calendar_week"
            ],
            "employee_id": employee_id,
        },
    )

    db.commit()

    await manager.publish(
        {
            "type": "message.new",
            "message_id": message.id,
        },
        user_id=data.recipient_user_id,
    )

    return serialize(
        db,
        message,
        user.id,
    )


@router.get(
    "/attachments/{attachment_id}/content"
)
def attachment_content(
    attachment_id: str,
    download: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attachment = db.get(
        MessageAttachment,
        attachment_id,
    )

    if not attachment:
        raise HTTPException(
            status_code=404,
            detail="Anhang nicht gefunden",
        )

    message = db.get(
        Message,
        attachment.message_id,
    )

    if (
        not message
        or not can_access_message(
            db,
            message,
            user.id,
        )
    ):
        raise HTTPException(
            status_code=404,
            detail="Anhang nicht gefunden",
        )

    if not attachment.storage_name:
        raise HTTPException(
            status_code=404,
            detail="Keine Datei vorhanden",
        )

    root = MEDIA_ROOT.resolve()
    path = (
        MEDIA_ROOT / attachment.storage_name
    ).resolve()

    if (
        root != path.parent
        or not path.is_file()
    ):
        raise HTTPException(
            status_code=404,
            detail="Datei nicht gefunden",
        )

    safe_inline = (
        attachment.kind in {"image", "audio"}
        or attachment.content_type
        == "application/pdf"
    )

    disposition = (
        "attachment"
        if download or not safe_inline
        else "inline"
    )

    return FileResponse(
        path,
        media_type=(
            attachment.content_type
            or "application/octet-stream"
        ),
        filename=(
            attachment.file_name
            or "datei"
        ),
        content_disposition_type=disposition,
    )


@router.patch(
    "/read",
    dependencies=[Depends(require_csrf)],
)
async def mark_conversation_read(
    data: ConversationReadIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.team and data.recipient_user_id:
        raise HTTPException(
            status_code=400,
            detail="Ungültige Unterhaltung",
        )

    validate_recipient(
        db,
        user,
        data.recipient_user_id,
    )

    stmt = visible_stmt(user.id)

    if data.team or data.recipient_user_id:
        stmt = stmt.where(
            conversation_condition(
                user.id,
                recipient_user_id=data.recipient_user_id,
                team=data.team,
            )
        )

    rows = db.scalars(stmt).all()
    marked = 0

    for message in rows:
        if ensure_read(
            db,
            message,
            user.id,
        ):
            marked += 1

    db.commit()

    await manager.publish(
        {
            "type": "message.read",
            "count": marked,
        },
        user_id=user.id,
    )

    return {
        "ok": True,
        "marked": marked,
    }


@router.patch(
    "/{message_id}/read",
    dependencies=[Depends(require_csrf)],
)
async def mark_read(
    message_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = db.get(
        Message,
        message_id,
    )

    if (
        not message
        or not can_access_message(
            db,
            message,
            user.id,
        )
    ):
        raise HTTPException(
            status_code=404,
            detail="Nachricht nicht gefunden",
        )

    ensure_read(
        db,
        message,
        user.id,
    )

    db.commit()

    await manager.publish(
        {
            "type": "message.read",
            "message_id": message.id,
        },
        user_id=user.id,
    )

    return {"ok": True}


class MessageEditIn(BaseModel):
    body: str = Field(max_length=MAX_NACHRICHT_ZEICHEN)


async def notify_conversation(message: Message, event: dict):
    """Beide Seiten einer Unterhaltung informieren; bei Team-Nachrichten alle."""
    if message.recipient_user_id:
        await manager.publish(event, user_id=message.sender_user_id)
        await manager.publish(event, user_id=message.recipient_user_id)
    else:
        await manager.publish(event)


@router.patch(
    "/{message_id}",
    dependencies=[Depends(require_csrf)],
)
async def edit_message(
    message_id: str,
    data: MessageEditIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = db.get(Message, message_id)

    if not message or message.sender_user_id != user.id:
        raise HTTPException(status_code=404, detail="Nachricht nicht gefunden")

    if message.deleted_at:
        raise HTTPException(status_code=409, detail="Gelöschte Nachrichten können nicht bearbeitet werden")

    body = data.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Nachricht ist leer")

    before = {"body": message.body}
    message.body = body
    message.edited_at = datetime.now(timezone.utc)
    db.flush()

    audit(db, user, "message.edited", "message", message.id, before=before, after={"body": body})
    db.commit()

    await notify_conversation(message, {"type": "message.updated", "message_id": message.id})

    return serialize(db, message, user.id)


@router.delete(
    "/clear",
    status_code=204,
    dependencies=[Depends(require_csrf)],
)
async def clear_messages(
    recipient_user_id: str | None = None,
    team: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if team and recipient_user_id:
        raise HTTPException(
            status_code=400,
            detail="Ungültige Unterhaltung",
        )

    validate_recipient(
        db,
        user,
        recipient_user_id,
    )

    stmt = visible_stmt(user.id)

    if team or recipient_user_id:
        stmt = stmt.where(
            conversation_condition(
                user.id,
                recipient_user_id=recipient_user_id,
                team=team,
            )
        )

    messages = db.scalars(stmt).all()

    existing = set(
        db.scalars(
            select(MessageHidden.message_id).where(
                MessageHidden.user_id == user.id
            )
        ).all()
    )

    hidden_count = 0

    for message in messages:
        ensure_read(
            db,
            message,
            user.id,
        )

        if message.id not in existing:
            db.add(
                MessageHidden(
                    message_id=message.id,
                    user_id=user.id,
                )
            )
            hidden_count += 1

    audit(
        db,
        user,
        "messages.cleared",
        "message",
        None,
        after={
            "hidden_count": hidden_count,
            "team": team,
            "recipient_user_id": recipient_user_id,
        },
    )

    db.commit()

    await manager.publish(
        {
            "type": "message.cleared",
        },
        user_id=user.id,
    )

    return None


@router.delete(
    "/{message_id}",
    dependencies=[Depends(require_csrf)],
)
async def delete_message(
    message_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = db.get(Message, message_id)

    if not message or message.sender_user_id != user.id:
        raise HTTPException(status_code=404, detail="Nachricht nicht gefunden")

    if message.deleted_at:
        return serialize(db, message, user.id)

    message.deleted_at = datetime.now(timezone.utc)
    db.flush()

    audit(db, user, "message.deleted", "message", message.id)
    db.commit()

    await notify_conversation(message, {"type": "message.deleted", "message_id": message.id})

    return serialize(db, message, user.id)
