"""Das Betreiberkonto beim Start festlegen.

Die Rolle SYSTEM_ADMIN laesst sich bewusst nicht ueber die Oberflaeche
vergeben. Sonst koennte jeder, der einmal Zugriff auf die
Benutzerverwaltung hat, sich selbst zum Betreiber machen - und wer den
Verwaltungsbereich schuetzt, waere damit selbst nicht mehr geschuetzt.

Stattdessen steht die Adresse in SYSTEM_ADMIN_EMAIL. Wer die .env aendern
kann, hat ohnehin Zugriff auf den Server; dort noch eine Huerde aufzubauen
waere Theater.

Was hier NICHT passiert: es wird kein Konto angelegt. Das Konto muss
existieren - sonst wuerde ein Tippfehler in der Adresse stillschweigend ein
zweites Betreiberkonto erzeugen, das niemand erwartet.
"""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Role, User

log = logging.getLogger("orgaboard.bootstrap")


def betreiber_festlegen(db: Session) -> str | None:
    """Hebt das konfigurierte Konto auf SYSTEM_ADMIN. Gibt die ID zurueck.

    Laeuft bei jedem Start. Ist das Konto schon Systemadministrator,
    passiert nichts - der Aufruf ist damit gefahrlos wiederholbar.
    """
    adresse = (get_settings().system_admin_email or "").strip().lower()
    if not adresse:
        return None

    user = db.scalar(select(User).where(User.email == adresse))
    if user is None:
        log.warning(
            "SYSTEM_ADMIN_EMAIL=%s ist gesetzt, aber es gibt kein Konto mit dieser "
            "Adresse. Es wird keines angelegt - bitte Adresse pruefen.",
            adresse,
        )
        return None

    if user.role != Role.SYSTEM_ADMIN:
        user.role = Role.SYSTEM_ADMIN
        # Ein deaktiviertes Betreiberkonto waere eine Sackgasse: niemand
        # koennte es wieder aktivieren.
        user.is_active = True
        db.commit()
        log.info("Konto %s ist jetzt Systemadministrator.", adresse)
    elif not user.is_active:
        user.is_active = True
        db.commit()
        log.info("Betreiberkonto %s war deaktiviert und wurde reaktiviert.", adresse)

    return user.id
