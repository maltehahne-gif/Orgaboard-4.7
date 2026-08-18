"""Feedback: angemeldete Benutzer schicken eine Rueckmeldung an den Betreiber.

Ablauf: authentifizieren, validieren, Rate-Limit pruefen, speichern, Mail
erzeugen und versenden, Versandstatus speichern, saubere Antwort. Die
Absenderidentitaet (Benutzer, Rolle) kommt ausschliesslich aus der Sitzung -
niemals aus Angaben im Request-Body, ein mitgeschicktes user_id-Feld gibt es
im Eingabemodell gar nicht erst.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.ratelimit import feedback_limiter
from app.core.security import get_current_user, require_csrf
from app.models import Feedback, FeedbackCategory, User
from app.services.mail import send_email

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
        # Kein technischer Header-Injection-Vektor mehr, sobald das Feld beim
        # Versand direkt in "Subject: ..." landet - aber diese Prüfung greift
        # unabhängig davon, ob die Mail-Bibliothek selbst schon schützt.
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


def _escape_html(wert: str) -> str:
    return html.escape(wert).replace("\n", "<br>")


def _mail_inhalte(feedback: Feedback, user: User) -> tuple[str, str, str]:
    """(Betreff, Klartext, HTML). Nutzereingaben werden fürs HTML escaped -
    niemals als vertrauenswürdiges Markup behandelt."""
    kategorie_label = CATEGORY_LABELS.get(feedback.category.value, feedback.category.value)
    betreff = f"[OrgaBoard Feedback] {kategorie_label} – {feedback.subject}"
    zeitpunkt = feedback.created_at.strftime("%d.%m.%Y %H:%M UTC")

    text = (
        "OrgaBoard Feedback\n\n"
        f"Feedback-ID:\n{feedback.reference}\n\n"
        f"Kategorie:\n{kategorie_label}\n\n"
        f"Betreff:\n{feedback.subject}\n\n"
        f"Benutzer:\n{user.full_name}\n\n"
        f"Benutzer-ID:\n{user.id}\n\n"
        f"Rolle:\n{user.role.value}\n\n"
        f"Bereich:\n{feedback.page_path or '–'}\n\n"
        f"Zeitpunkt:\n{zeitpunkt}\n\n"
        f"Nachricht:\n{feedback.message}\n\n"
        "------------------------------\n"
        "Automatisch über OrgaBoard versendet."
    )

    html_body = f"""<html><body style="font-family:Arial,sans-serif;color:#171b19;line-height:1.5">
<h2 style="margin-bottom:4px">OrgaBoard Feedback</h2>
<p><strong>Feedback-ID:</strong><br>{_escape_html(feedback.reference)}</p>
<p><strong>Kategorie:</strong><br>{_escape_html(kategorie_label)}</p>
<p><strong>Betreff:</strong><br>{_escape_html(feedback.subject)}</p>
<p><strong>Benutzer:</strong><br>{_escape_html(user.full_name)}</p>
<p><strong>Benutzer-ID:</strong><br>{_escape_html(user.id)}</p>
<p><strong>Rolle:</strong><br>{_escape_html(user.role.value)}</p>
<p><strong>Bereich:</strong><br>{_escape_html(feedback.page_path or '–')}</p>
<p><strong>Zeitpunkt:</strong><br>{_escape_html(zeitpunkt)}</p>
<p><strong>Nachricht:</strong><br>{_escape_html(feedback.message)}</p>
<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
<p style="color:#6f7b79;font-size:13px">Automatisch über OrgaBoard versendet.</p>
</body></html>"""

    return betreff, text, html_body


@router.post("")
def create_feedback(
    data: FeedbackIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _csrf=Depends(require_csrf),
):
    feedback_limiter.check(_feedback_key(user))
    feedback_limiter.register_attempt(_feedback_key(user))

    settings = get_settings()

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
    db.commit()

    betreff, text, html_body = _mail_inhalte(feedback, user)

    try:
        send_email(settings.feedback_email_to, betreff, text, html_body)
    except Exception as exc:  # noqa: BLE001 - smtplib/MailNotConfigured werfen unterschiedliche Typen
        # Niemals Zugangsdaten oder andere Geheimnisse in der Fehlermeldung
        # speichern oder loggen - nur eine kurze technische Kurzfassung.
        feedback.email_error = str(exc)[:500]
        db.commit()
        logger.error("Feedback %s: Mailversand fehlgeschlagen: %s", feedback.reference, exc)
        raise HTTPException(
            status_code=502,
            detail="Dein Feedback wurde gespeichert, aber der Versand ist fehlgeschlagen. Bitte versuche es erneut.",
        ) from exc

    feedback.email_sent = True
    feedback.email_sent_at = datetime.now(timezone.utc)
    feedback.email_error = None
    db.commit()

    return {"ok": True, "reference": feedback.reference, "email_sent": True}
