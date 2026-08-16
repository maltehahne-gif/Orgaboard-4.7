"""Web-Push: Benachrichtigungen aufs Geraet schicken.

Die Verschluesselung uebernimmt pywebpush - eine erprobte Umsetzung des
Standards (RFC 8291/8292). Selbst gebaute Kryptografie kommt hier nicht in
Frage: ein Fehler faellt nicht auf, weil eine falsch verschluesselte
Nachricht schlicht nicht ankommt.

Ohne konfigurierte VAPID-Schluessel ist Push abgeschaltet. Das ist der
Normalfall in Entwicklung und Test - die Anwendung laeuft dann vollstaendig
weiter, nur eben ohne Push. Erzwungen wird nichts.
"""
from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Notification, PushSubscription

log = logging.getLogger("orgaboard.webpush")

# Statuscodes, mit denen ein Push-Dienst sagt: dieses Geraet gibt es nicht
# mehr. Dann wird die Anmeldung entfernt, statt es weiter zu versuchen.
ABGEMELDET = {404, 410}


def push_verfuegbar() -> bool:
    settings = get_settings()
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def oeffentlicher_schluessel() -> str | None:
    """Der Schluessel, den der Browser zum Anmelden braucht."""
    return get_settings().vapid_public_key or None


def _vapid_claims() -> dict:
    settings = get_settings()
    # Der Standard verlangt eine Kontaktadresse fuer den Fall, dass ein
    # Push-Dienst den Absender erreichen muss.
    kontakt = settings.vapid_contact_email or settings.smtp_from_email or "admin@example.com"
    return {"sub": f"mailto:{kontakt}"}


def senden(db: Session, benachrichtigungen: list[Notification]) -> int:
    """Benachrichtigungen an alle Geraete ihrer Empfaenger schicken.

    Gibt zurueck, wie viele Zustellungen gelungen sind. Fehler beenden den
    Durchlauf nicht: ein nicht erreichbares Geraet darf weder die uebrigen
    Geraete noch den Aufrufer aufhalten - der wollte eigentlich nur sein
    Postfach lesen.
    """
    if not benachrichtigungen or not push_verfuegbar():
        return 0

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:  # pragma: no cover - nur ohne installiertes Paket
        log.warning("pywebpush ist nicht installiert - Push wird uebersprungen")
        return 0

    settings = get_settings()
    zugestellt = 0
    entfernen: list[str] = []

    # Je Empfaenger einmal die Geraete laden, nicht je Benachrichtigung.
    nach_benutzer: dict[str, list[Notification]] = {}
    for n in benachrichtigungen:
        nach_benutzer.setdefault(n.user_id, []).append(n)

    for user_id, meldungen in nach_benutzer.items():
        geraete = db.scalars(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        ).all()
        if not geraete:
            continue

        for meldung in meldungen:
            nutzlast = json.dumps({
                "title": meldung.title,
                "body": meldung.body or "",
                "link": meldung.link or "/",
                "kind": meldung.kind,
                "id": meldung.id,
            })
            for geraet in geraete:
                try:
                    webpush(
                        subscription_info={
                            "endpoint": geraet.endpoint,
                            "keys": {"p256dh": geraet.p256dh, "auth": geraet.auth},
                        },
                        data=nutzlast,
                        vapid_private_key=settings.vapid_private_key,
                        vapid_claims=dict(_vapid_claims()),
                        timeout=10,
                    )
                    zugestellt += 1
                except WebPushException as fehler:
                    status = getattr(fehler.response, "status_code", None)
                    if status in ABGEMELDET:
                        entfernen.append(geraet.id)
                    else:
                        log.warning("Push fehlgeschlagen (%s): %s", status, fehler)
                except Exception:  # noqa: BLE001 - Netzfehler duerfen nichts aufhalten
                    log.exception("Push konnte nicht zugestellt werden")

    if entfernen:
        for geraet in db.scalars(
            select(PushSubscription).where(PushSubscription.id.in_(entfernen))
        ).all():
            db.delete(geraet)
        db.commit()

    return zugestellt
