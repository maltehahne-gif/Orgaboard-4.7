"""Das Betreiberkonto beim Start festlegen.

Die Rolle SYSTEM_ADMIN laesst sich bewusst nicht ueber die Oberflaeche
vergeben. Sonst koennte jeder, der einmal Zugriff auf die
Benutzerverwaltung hat, sich selbst zum Betreiber machen - und wer den
Verwaltungsbereich schuetzt, waere damit selbst nicht mehr geschuetzt.

Stattdessen steht die Adresse in SYSTEM_ADMIN_EMAIL. Wer die .env aendern
kann, hat ohnehin Zugriff auf den Server; dort noch eine Huerde aufzubauen
waere Theater.

Ein Konto wird nur angelegt, wenn zusaetzlich SYSTEM_ADMIN_PASSWORD gesetzt
ist. Ohne Passwort wird ausschliesslich gehoben - sonst wuerde ein Tippfehler
in der Adresse stillschweigend ein zweites Betreiberkonto ohne brauchbares
Passwort erzeugen, das niemand erwartet und niemand benutzen kann.

Das Passwort steht in der .env und wird nie protokolliert. Wer den ersten
Login gemacht hat, kann den Eintrag wieder entfernen: das Konto bleibt, und
ohne Passworteintrag wird kuenftig nur noch gehoben.
"""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Employee, Role, User

log = logging.getLogger("orgaboard.bootstrap")

# Dieselbe Untergrenze wie beim Passwortwechsel in auth.py. Ein kuerzeres
# Passwort liesse sich spaeter nicht einmal aendern - die Pruefung dort
# wuerde es ablehnen.
MINDESTLAENGE = 12


def betreiber_festlegen(db: Session) -> str | None:
    """Hebt das konfigurierte Konto auf SYSTEM_ADMIN. Gibt die ID zurueck.

    Laeuft bei jedem Start. Ist das Konto schon Systemadministrator,
    passiert nichts - der Aufruf ist damit gefahrlos wiederholbar.
    """
    adresse = (get_settings().system_admin_email or "").strip().lower()
    if not adresse:
        return None

    passwort = (get_settings().system_admin_password or "").strip()

    user = db.scalar(select(User).where(User.email == adresse))
    if user is None:
        if not passwort:
            log.warning(
                "SYSTEM_ADMIN_EMAIL=%s ist gesetzt, aber es gibt kein Konto mit dieser "
                "Adresse und kein SYSTEM_ADMIN_PASSWORD. Es wird keines angelegt - "
                "bitte Adresse pruefen oder Passwort setzen.",
                adresse,
            )
            return None
        if len(passwort) < MINDESTLAENGE:
            log.warning(
                "SYSTEM_ADMIN_PASSWORD ist kuerzer als %s Zeichen. Es wird kein "
                "Betreiberkonto angelegt - sonst entstuende ein Konto, mit dem sich "
                "das Passwort spaeter nicht einmal aendern liesse.",
                MINDESTLAENGE,
            )
            return None

        user = User(
            email=adresse,
            full_name="Systemadministrator",
            password_hash=hash_password(passwort),
            role=Role.SYSTEM_ADMIN,
            is_active=True,
            # Das Passwort kommt aus der .env, also von der Person selbst -
            # ein erzwungener Wechsel beim ersten Login waere hier nur eine
            # Huerde ohne Gewinn.
            must_change_password=False,
        )
        db.add(user)
        db.flush()
        # Ohne Mitarbeiterprofil laufen Dashboard und Kundenliste in einen
        # Fehler: sie setzen fuer jeden Angemeldeten eines voraus.
        db.add(Employee(user_id=user.id, display_name="Systemadministrator",
                        position="Inhaber"))
        db.commit()
        log.info("Betreiberkonto %s wurde angelegt.", adresse)
        return user.id

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
