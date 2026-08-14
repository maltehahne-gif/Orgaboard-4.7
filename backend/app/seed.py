"""Legt beim ersten Start die Benutzerkonten an.

Der Seed laeuft nur auf einer leeren Benutzertabelle. Sobald echte Konten
existieren, wird nichts mehr angelegt oder veraendert - sonst wuerde jeder
Neustart des Containers Karteileichen erzeugen, wenn sich die Namensliste im
Repository von den tatsaechlich vergebenen Adressen unterscheidet.

Die Namensliste enthaelt bewusst keine echten E-Mail-Adressen. Wer eigene
Konten anlegen will, hinterlegt sie ueber SEED_USERS_FILE als JSON:

    [{"full_name": "Vorname Nachname",
      "email": "adresse@beispiel.de",
      "role": "EMPLOYEE"}]
"""
import json
import os
from pathlib import Path

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import Employee, Role, User

# Platzhalteradressen. Echte Adressen gehoeren nicht ins Repository - sie sind
# personenbezogene Daten und waeren in einem oeffentlichen Repository einsehbar.
DEFAULT_USERS = [
    ("Björn Hahne", "bjoern.hahne@example.com", Role.EMPLOYEE),
    ("Jessica Wunder", "jessica.wunder@example.com", Role.EMPLOYEE),
    ("Susanne Menzel", "susanne.menzel@example.com", Role.EMPLOYEE),
    ("Britta C.B", "britta.cb@example.com", Role.EMPLOYEE),
    ("Joachim Hansen", "joachim.hansen@example.com", Role.EMPLOYEE),
    ("Matthias Knappe", "matthias.knappe@example.com", Role.EMPLOYEE),
    ("Britta Baumhof", "britta.baumhof@example.com", Role.EMPLOYEE),
    ("Carsten Böhrensen", "carsten.boehrensen@example.com", Role.TEAM_LEADER),
]


def load_roster() -> list[tuple[str, str, Role]]:
    path = os.getenv("SEED_USERS_FILE", "").strip()
    if not path:
        return DEFAULT_USERS

    entries = json.loads(Path(path).read_text(encoding="utf-8"))
    roster = []
    for entry in entries:
        roster.append(
            (
                entry["full_name"],
                entry["email"].lower().strip(),
                Role(entry.get("role", "EMPLOYEE")),
            )
        )
    return roster


def main():
    settings = get_settings()
    if not settings.seed_default_password:
        raise SystemExit(
            "SEED_DEFAULT_PASSWORD muss gesetzt sein. "
            "Es werden keine Passwörter hart codiert."
        )

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if (db.scalar(select(func.count(User.id))) or 0) > 0:
            print("Es existieren bereits Benutzer. Der Seed wird übersprungen.")
            return

        for full_name, email, role in load_roster():
            user = User(
                email=email,
                full_name=full_name,
                password_hash=hash_password(settings.seed_default_password),
                role=role,
                must_change_password=True,
            )
            db.add(user)
            db.flush()
            db.add(
                Employee(
                    user_id=user.id,
                    display_name=full_name,
                    position="Teamleiter" if role == Role.TEAM_LEADER else "Vertriebspartner",
                    monthly_units_target=30,
                )
            )
        db.commit()
        print("Benutzer angelegt. Alle müssen beim ersten Login das Passwort ändern.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
