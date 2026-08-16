"""Konten endgueltig loeschen: Profil ohne Konto, getrennte Rechte

Zwei kleine Aenderungen, die zusammen das endgueltige Loeschen eines
Benutzerkontos moeglich machen, ohne die Unternehmenshistorie mitzunehmen:

1. employees.user_id wird nullable. Am Mitarbeiterprofil haengen Kunden,
   Termine, Verkaeufe, Angebote, Verleihe, Altgeraete und Wochenstatistiken.
   Faellt das Profil mit dem Konto, scheitert die Loeschung entweder am
   Fremdschluessel oder sie reisst Umsaetze frueherer Monate mit. Ohne Konto
   bleibt das Profil deshalb als namenloser Rest stehen.

2. Vier neue Einzelrechte. "Mitarbeiter ins Team aufnehmen" und "Teamleiter
   ernennen" waren bisher dasselbe Duerfen - wer das eine hatte, hatte das
   andere. Getrennte Rechte sind die Voraussetzung dafuer, dass ein
   Teamleiter sein Team besetzen, aber keine Fuehrungsrolle vergeben kann.

Bestehende Daten werden nicht angefasst. Kein vorhandenes Profil verliert
sein Konto, und ohne Eintrag in user_permissions gilt weiterhin, was die
Rolle vorsieht.

Revision ID: d2a91c47b6e0
Revises: c9d4e0b71f52
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2a91c47b6e0"
down_revision: Union[str, None] = "c9d4e0b71f52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEUE_RECHTE = (
    "TEAM_MITGLIED_HINZUFUEGEN",
    "TEAM_MITGLIED_ENTFERNEN",
    "ROLLE_TEAMLEITER_VERGEBEN",
    "ROLLE_TEAMLEITER_ENTZIEHEN",
)


def _ist_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # --- Rechte erweitern ---------------------------------------------------
    # PostgreSQL fuehrt einen eigenen Typ; SQLite speichert die Enum als Text
    # und braucht hier nichts.
    if _ist_postgres():
        for recht in NEUE_RECHTE:
            op.execute(f"ALTER TYPE permission ADD VALUE IF NOT EXISTS '{recht}'")

    # --- Profil darf ohne Konto bestehen ------------------------------------
    # Auf PostgreSQL ist das ein reiner Katalogeintrag. SQLite kann Spalten
    # nicht aendern und braucht den Batch-Modus, der die Tabelle neu aufbaut.
    if _ist_postgres():
        op.alter_column(
            "employees", "user_id",
            existing_type=sa.String(length=36),
            nullable=True,
        )
    else:
        with op.batch_alter_table("employees") as batch:
            batch.alter_column(
                "user_id",
                existing_type=sa.String(length=36),
                nullable=True,
            )


def downgrade() -> None:
    # Profile ohne Konto sind die Reste geloeschter Benutzer. Sie wieder auf
    # NOT NULL zu zwingen wuerde an genau diesen Zeilen scheitern - deshalb
    # bekommen sie vorher ein Konto zugewiesen zu koennen ist nicht moeglich,
    # und sie werden entfernt. Ihre Geschaeftsdaten haengen an ihnen; ein
    # Downgrade ist damit ausdruecklich verlustbehaftet.
    op.execute("DELETE FROM employees WHERE user_id IS NULL")

    if _ist_postgres():
        op.alter_column(
            "employees", "user_id",
            existing_type=sa.String(length=36),
            nullable=False,
        )
    else:
        with op.batch_alter_table("employees") as batch:
            batch.alter_column(
                "user_id",
                existing_type=sa.String(length=36),
                nullable=False,
            )

    # Die Enum-Werte bleiben stehen. PostgreSQL kennt kein "ALTER TYPE ...
    # DROP VALUE"; den Typ neu aufzubauen waere fuer ein Downgrade ein zu
    # grosser Eingriff. Ueberzaehlige Werte stoeren niemanden.
