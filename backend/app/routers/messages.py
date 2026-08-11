from datetime import datetime, timezone
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.security import get_current_user, require_csrf
from app.models import Message, MessageHidden, User
from app.services.realtime import manager

router = APIRouter(prefix="/messages", tags=["messages"])


class MessageIn(BaseModel):
    recipient_user_id: str | None = None
    body: str


def serialize(db: Session, m: Message):
    sender = db.get(User, m.sender_user_id); recipient = db.get(User, m.recipient_user_id) if m.recipient_user_id else None
    return {
        "id": m.id, "sender_user_id": m.sender_user_id, "sender_name": sender.full_name if sender else None,
        "recipient_user_id": m.recipient_user_id, "recipient_name": recipient.full_name if recipient else "Team",
        "body": m.body, "created_at": m.created_at, "read_at": m.read_at,
    }


@router.get("")
def list_messages(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = (
        select(Message)
        .where(
            or_(
                Message.sender_user_id == user.id,
                Message.recipient_user_id == user.id,
                Message.recipient_user_id.is_(None)
            )
        )
        .where(
            ~Message.id.in_(
                select(MessageHidden.message_id).where(
                    MessageHidden.user_id == user.id
                )
            )
        )
        .order_by(Message.created_at.desc())
        .limit(300)
    )
    return [serialize(db, m) for m in db.scalars(stmt).all()]


@router.post("", dependencies=[Depends(require_csrf)])
async def send_message(data: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    body = data.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Nachricht ist leer")
    if data.recipient_user_id and not db.get(User, data.recipient_user_id):
        raise HTTPException(status_code=404, detail="Empfänger nicht gefunden")
    m = Message(sender_user_id=user.id, recipient_user_id=data.recipient_user_id, body=body)
    db.add(m); db.flush(); audit(db, user, "message.sent", "message", m.id); db.commit()
    await manager.publish({"type":"message.new","message_id":m.id}, user_id=data.recipient_user_id)
    return serialize(db, m)


@router.patch("/{message_id}/read", dependencies=[Depends(require_csrf)])
def mark_read(message_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(Message, message_id)
    if not m or (m.recipient_user_id not in (None, user.id)):
        raise HTTPException(status_code=404, detail="Nachricht nicht gefunden")
    m.read_at = datetime.now(timezone.utc); db.commit(); return {"ok": True}


@router.delete("/clear", status_code=204, dependencies=[Depends(require_csrf)])
def clear_messages(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Message).where(
        or_(
            Message.sender_user_id == user.id,
            Message.recipient_user_id == user.id,
            Message.recipient_user_id.is_(None)
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

    for message in messages:
        if message.id not in existing:
            db.add(
                MessageHidden(
                    message_id=message.id,
                    user_id=user.id
                )
            )

    audit(
        db,
        user,
        "messages.cleared",
        "message",
        None,
        after={"hidden_count": len(messages)},
    )

    db.commit()
    return None
