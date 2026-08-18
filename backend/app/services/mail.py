"""Zentraler E-Mail-Versand.

Vorher stand derselbe SMTP-Code zweimal im Projekt (Passwort-Reset in
routers/auth.py, Angebotsversand in routers/offers.py) - jede Verbesserung
(Timeout, TLS-Reihenfolge, Fehlerbehandlung) haette an zwei Stellen
nachgezogen werden muessen. Neue Versandwege wie das Feedback-Formular
bauen deshalb auf dieser einen Stelle auf, statt einen dritten eigenen
SMTP-Block zu eroeffnen.
"""
from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.core.config import get_settings


class MailNotConfigured(RuntimeError):
    """SMTP ist auf diesem System (noch) nicht eingerichtet."""


def mail_configured() -> bool:
    settings = get_settings()
    return bool(settings.smtp_host and settings.smtp_from_email)


def send_email(
    to: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    attachment: tuple[bytes, str, str] | None = None,
) -> None:
    """Verschickt eine E-Mail ueber den konfigurierten SMTP-Server.

    `attachment` ist optional (Inhalt, Dateiname, Subtyp z. B. "pdf").
    Wirft MailNotConfigured, wenn kein SMTP hinterlegt ist, und laesst
    smtplib-/Netzwerkfehler unveraendert durch - wer verschickt, entscheidet
    selbst, wie ein Fehlschlag behandelt wird (erneut versuchen, dem
    Benutzer melden, in der Datenbank vermerken).
    """
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        raise MailNotConfigured("SMTP ist nicht eingerichtet (SMTP_HOST/SMTP_FROM_EMAIL fehlen)")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = to
    message.set_content(text_body)
    if html_body is not None:
        message.add_alternative(html_body, subtype="html")
    if attachment is not None:
        content, filename, subtype = attachment
        message.add_attachment(content, maintype="application", subtype=subtype, filename=filename)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        smtp.ehlo()
        if settings.smtp_use_tls:
            smtp.starttls()
            smtp.ehlo()
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
