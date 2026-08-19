"""Feedback: angemeldete Benutzer schicken eine Rueckmeldung an den Betreiber.

Der Weg ist bewusst vollstaendig intern: Feedback wird gespeichert und im
selben Zug als private Nachricht an jeden aktiven Systemadministrator
zugestellt - ueber das vorhandene Nachrichtensystem, nicht ueber E-Mail.

Warum kein SMTP mehr: der Mailversand war der einzige Schritt, der scheitern
konnte, nachdem das Feedback bereits in der Datenbank stand. Der Benutzer sah
"gespeichert, aber Versand fehlgeschlagen", klickte erneut - und hinterliess
ein zweites Feedback. Innerhalb einer Transaktion gibt es diesen Zustand
nicht mehr: entweder Feedback und Nachrichten stehen zusammen, oder gar
nichts steht.

Empfaenger werden nie ueber Name, E-Mail-Adresse oder eine feste ID gesucht,
sondern ausschliesslich ueber Role.SYSTEM_ADMIN und is_active - eine Adresse
aendert sich, eine Rolle ist die Zusicherung.

Die Absenderidentitaet (Benutzer, Rolle) kommt ausschliesslich aus der
Sitzung - niemals aus Angaben im Request-Body, ein mitgeschicktes
user_id-Feld gibt es im Eingabemodell gar nicht erst.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.database import get_db
from app.core.ratelimit import feedback_limiter
from app.core.security import get_current_user, require_csrf
from app.core.timeutils import to_business_tz
from app.models import (
    Feedback,
    FeedbackCategory,
    Message,
    MessageHidden,
    ROLLEN_BEZEICHNUNG,
    Role,
    User,
)
from app.services.realtime import manager

router = APIRouter(prefix="/feedback", tags=["feedback"])
logger = logging.getLogger(__name__)

CATEGORY_LABELS: dict[str, str] = {
    "bug": "Fehler / Bug",
    "improvement": "Verbesserung",
    "feature_request": "Funktionswunsch",
    "design": "Design / Bedienung",
    "performance": "Performance",
    "other": "Sonstiges",
}

# Grenzen bewusst innerhalb der im Auftrag genannten Spannen (Betreff
# 150-200, Nachricht 5.000-10.000) - grosszuegig genug fuer eine echte
# Fehlerbeschreibung, eng genug gegen beliebig grosse Anfragen.
MAX_SUBJECT_LENGTH = 200
MIN_MESSAGE_LENGTH = 10
MAX_MESSAGE_LENGTH = 8000
MAX_PAGE_PATH_LENGTH = 300

# Eine Meldung fuer jeden Fehlschlag beim Zustellen. Der Benutzer soll
# wissen, dass nichts gespeichert wurde und ein zweiter Versuch sinnvoll ist -
# und nicht raten muessen, ob sein Feedback nun halb angekommen ist.
FEHLERMELDUNG = "Feedback konnte nicht gesendet werden. Bitte versuche es erneut."


class FeedbackIn(BaseModel):
    category: FeedbackCategory
    subject: str = Field(min_length=1, max_length=MAX_SUBJECT_LENGTH)
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    page_path: str | None = Field(default=None, max_length=MAX_PAGE_PATH_LENGTH)

    @field_validator("subject")
    @classmethod
    def betreff_pruefen(cls, wert: str) -> str:
        bereinigt = wert.strip()
        if not bereinigt:
            raise ValueError("Bitte einen Betreff angeben")
        # Der Betreff wird zur ersten Zeile der internen Nachricht. Ein
        # Zeilenumbruch darin verschoebe den ganzen Aufbau und liesse sich
        # nutzen, um eigene Kopfzeilen vorzutaeuschen.
        if "\n" in bereinigt or "\r" in bereinigt:
            raise ValueError("Der Betreff darf keine Zeilenumbrüche enthalten")
        return bereinigt

    @field_validator("message")
    @classmethod
    def nachricht_pruefen(cls, wert: str) -> str:
        bereinigt = wert.strip()
        if len(bereinigt) < MIN_MESSAGE_LENGTH:
            raise ValueError(f"Die Nachricht muss mindestens {MIN_MESSAGE_LENGTH} Zeichen lang sein")
        return bereinigt

    @field_validator("page_path")
    @classmethod
    def seite_pruefen(cls, wert: str | None) -> str | None:
        if wert is None:
            return None
        bereinigt = wert.strip()
        if not bereinigt:
            return None
        if "\n" in bereinigt or "\r" in bereinigt:
            raise ValueError("Ungültige Angabe für die aktuelle Seite")
        return bereinigt[:MAX_PAGE_PATH_LENGTH]


def _naechste_referenz(db: Session) -> str:
    jahr = datetime.now(timezone.utc).year
    prefix = f"FDB-{jahr}-"
    anzahl = db.scalar(
        select(func.count()).select_from(Feedback).where(Feedback.reference.like(f"{prefix}%"))
    ) or 0
    return f"{prefix}{anzahl + 1:06d}"


def _feedback_key(user: User) -> str:
    return f"user:{user.id}"


def aktive_systemadministratoren(db: Session) -> list[User]:
    """Alle Empfaenger des Feedbacks.

    Ausschliesslich ueber Rolle und Aktivstatus - kein Name, keine feste
    Adresse, keine fest eingetragene Benutzer-ID. Wer die Rolle abgibt oder
    deaktiviert wird, bekommt ab sofort kein Feedback mehr; wer sie erhaelt,
    bekommt es ohne weitere Pflege.
    """
    return list(db.scalars(
        select(User)
        .where(User.role == Role.SYSTEM_ADMIN, User.is_active.is_(True))
        .order_by(User.full_name, User.id)
    ).all())


def nachrichtentext(feedback: Feedback, user: User) -> str:
    """Der Text der internen Nachricht - lesbar, ohne technischen Ballast."""
    kategorie = CATEGORY_LABELS.get(feedback.category.value, feedback.category.value)
    rolle = ROLLEN_BEZEICHNUNG.get(user.role, user.role.value)
    zeitpunkt = to_business_tz(feedback.created_at).strftime("%d.%m.%Y %H:%M")

    return (
        # Erste Zeile ist der Betreff: das Nachrichtensystem kennt kein
        # eigenes Betrefffeld, und in der Liste ist der Anfang das, was man
        # sieht.
        f"Feedback: {kategorie} – {feedback.subject}\n"
        "\n"
        "Neues Feedback\n"
        "\n"
        "Von:\n"
        f"{user.full_name}\n"
        "\n"
        "Benutzer-E-Mail:\n"
        f"{user.email}\n"
        "\n"
        "Rolle:\n"
        f"{rolle}\n"
        "\n"
        "Kategorie:\n"
        f"{kategorie}\n"
        "\n"
        "Betreff:\n"
        f"{feedback.subject}\n"
        "\n"
        "Nachricht:\n"
        f"{feedback.message}\n"
        "\n"
        "Aktuelle Seite:\n"
        f"{feedback.page_path or '–'}\n"
        "\n"
        "Feedback-Referenz:\n"
        f"{feedback.reference}\n"
        "\n"
        "Gesendet am:\n"
        f"{zeitpunkt}"
    )


def _nachrichten_anlegen(db: Session, feedback: Feedback, user: User) -> list[Message]:
    """Je aktivem Systemadministrator eine eigene private Nachricht.

    Bewusst keine Teamnachricht (recipient_user_id is NULL) - die saehe jeder.
    Je Empfaenger ein eigener Datensatz, damit gelesen/ungelesen und Loeschen
    pro Person gelten, genau wie bei jeder anderen privaten Nachricht.

    Der Absender ist der Benutzer selbst, damit der Systemadministrator
    unmittelbar antworten kann. Seine eigene Kopie blendet der Absender
    allerdings aus (MessageHidden): fuer alle Rollen unterhalb existiert das
    Konto eines Systemadministrators nicht (core/benutzerscope.py), und eine
    sichtbare Nachricht "an X" wuerde genau das verraten. Seine Bestaetigung
    bekommt der Absender ueber die Referenznummer.
    """
    text = nachrichtentext(feedback, user)
    nachrichten: list[Message] = []

    for admin in aktive_systemadministratoren(db):
        nachricht = Message(
            sender_user_id=user.id,
            recipient_user_id=admin.id,
            body=text,
        )
        db.add(nachricht)
        db.flush()

        if admin.id != user.id:
            db.add(MessageHidden(message_id=nachricht.id, user_id=user.id))

        nachrichten.append(nachricht)

    return nachrichten


@router.post("")
async def create_feedback(
    data: FeedbackIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf=Depends(require_csrf),
):
    """Feedback speichern und intern zustellen - beides oder keines.

    Feedback, Nachrichten und Audit-Eintrag gehen in einer einzigen
    Transaktion zur Datenbank. Scheitert irgendetwas davon, wird alles
    zurueckgerollt: es entsteht kein gespeichertes Feedback ohne Empfaenger,
    und ein zweiter Anlauf des Benutzers erzeugt deshalb auch keine Dublette.
    """
    feedback_limiter.check(_feedback_key(user))
    feedback_limiter.register_attempt(_feedback_key(user))

    empfaenger_ids: list[str] = []

    try:
        feedback = Feedback(
            reference=_naechste_referenz(db),
            user_id=user.id,
            category=data.category,
            subject=data.subject,
            message=data.message,
            page_path=data.page_path,
            user_agent=(request.headers.get("user-agent") or "").strip()[:500] or None,
        )
        db.add(feedback)
        db.flush()

        nachrichten = _nachrichten_anlegen(db, feedback, user)
        if not nachrichten:
            # Ohne Empfaenger waere das Feedback ein Eintrag, den niemand
            # liest. Lieber ehrlich abbrechen, als stillen Erfolg melden.
            db.rollback()
            logger.error("Feedback: kein aktiver Systemadministrator vorhanden")
            raise HTTPException(
                status_code=503,
                detail=(
                    "Zurzeit ist kein Systemadministrator hinterlegt, der das "
                    "Feedback erhalten könnte. Bitte wende dich direkt an die Teamleitung."
                ),
            )

        feedback.delivered_at = datetime.now(timezone.utc)
        feedback.admin_message_count = len(nachrichten)

        audit(
            db,
            user,
            "feedback.created",
            "feedback",
            feedback.id,
            after={
                "reference": feedback.reference,
                "category": feedback.category.value,
                "empfaenger": len(nachrichten),
            },
        )

        empfaenger_ids = [n.recipient_user_id for n in nachrichten if n.recipient_user_id]
        referenz = feedback.reference
        db.commit()
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        # Niemals Zugangsdaten oder andere Interna in die Antwort - nur die
        # kurze Kurzfassung ins Log.
        logger.exception("Feedback konnte nicht gespeichert werden: %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail=FEHLERMELDUNG) from exc

    # Erst nach dem erfolgreichen Commit: der Live-Hinweis darf nichts
    # ankuendigen, was in der Datenbank nicht steht. Ein Fehler hier ist
    # kein Grund, dem Benutzer einen Fehlschlag zu melden - das Feedback ist
    # zugestellt, die Glocke holt es beim naechsten Abruf ohnehin nach.
    for empfaenger_id in empfaenger_ids:
        try:
            await manager.publish({"type": "message.new"}, user_id=empfaenger_id)
        except Exception:  # noqa: BLE001 - ein toter Socket darf nichts kippen
            logger.warning("Feedback %s: Live-Hinweis nicht zustellbar", referenz)

    return {
        "ok": True,
        "reference": referenz,
        "recipients": len(empfaenger_ids),
    }
