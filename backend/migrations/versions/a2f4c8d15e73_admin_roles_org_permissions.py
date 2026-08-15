"""Betreiber-Administration: Rollen, Organisationsstruktur, Einzelrechte

Legt die Grundlage fuer den Systemadministrator:

- zwei neue Rollenstufen (REGIONAL_LEAD, SYSTEM_ADMIN)
- Region / Bezirk / Team als eigene Tabellen
- Einzelrechte je Benutzer (Abweichung vom Rollenstandard)
- Betreibereinstellungen als Schluessel-Wert-Ablage
- zusaetzliche Stammdaten an Benutzer und Mitarbeiter

Bestehende Daten werden nicht angefasst. Alle neuen Spalten sind nullable,
alle neuen Tabellen sind leer. Ein vorhandener Benutzer behaelt seine Rolle
und sieht nach der Migration genau dasselbe wie davor - die Zuordnung zu
einem Team ist optional und wird ueber den Verwaltungsbereich nachgetragen.

Revision ID: a2f4c8d15e73
Revises: f1b8d3c60a94
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2f4c8d15e73"
down_revision: Union[str, None] = "f1b8d3c60a94"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEUE_ROLLEN = ("REGIONAL_LEAD", "SYSTEM_ADMIN")

RECHTE = (
    "KUNDEN_SEHEN", "KUNDEN_BEARBEITEN", "KUNDEN_LOESCHEN",
    "TERMINE_SEHEN", "TERMINE_ERSTELLEN", "TERMINE_BEARBEITEN", "TERMINE_LOESCHEN",
    "VERKAEUFE_SEHEN", "VERKAEUFE_ERSTELLEN", "VERKAEUFE_LOESCHEN",
    "PRODUKTE_VERWALTEN", "CHAT_NUTZEN", "DASHBOARD_SEHEN", "STATISTIK_SEHEN", "EXPORT",
)


def _ist_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # --- Rollen erweitern ---------------------------------------------------
    # PostgreSQL fuehrt einen eigenen Typ; SQLite speichert die Enum als Text
    # mit Pruefbedingung und braucht hier nichts.
    if _ist_postgres():
        for rolle in NEUE_ROLLEN:
            op.execute(f"ALTER TYPE role ADD VALUE IF NOT EXISTS '{rolle}'")

    # --- Organisationsstruktur ---------------------------------------------
    op.create_table(
        "regions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("lead_user_id", sa.String(length=36), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["lead_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("name", name="uq_region_name"),
    )
    op.create_index("ix_regions_name", "regions", ["name"])
    op.create_index("ix_regions_lead_user_id", "regions", ["lead_user_id"])
    op.create_index("ix_regions_is_active", "regions", ["is_active"])

    op.create_table(
        "districts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("region_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("lead_user_id", sa.String(length=36), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["region_id"], ["regions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("region_id", "name", name="uq_district_name_in_region"),
    )
    op.create_index("ix_districts_region_id", "districts", ["region_id"])
    op.create_index("ix_districts_name", "districts", ["name"])
    op.create_index("ix_districts_lead_user_id", "districts", ["lead_user_id"])
    op.create_index("ix_districts_is_active", "districts", ["is_active"])

    op.create_table(
        "teams",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("district_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("lead_user_id", sa.String(length=36), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["district_id"], ["districts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("district_id", "name", name="uq_team_name_in_district"),
    )
    op.create_index("ix_teams_district_id", "teams", ["district_id"])
    op.create_index("ix_teams_name", "teams", ["name"])
    op.create_index("ix_teams_lead_user_id", "teams", ["lead_user_id"])
    op.create_index("ix_teams_is_active", "teams", ["is_active"])

    # --- Einzelrechte -------------------------------------------------------
    op.create_table(
        "user_permissions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("permission", sa.Enum(*RECHTE, name="permission"), nullable=False),
        sa.Column("allowed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "permission", name="uq_user_permission"),
    )
    op.create_index("ix_user_permissions_user_id", "user_permissions", ["user_id"])
    op.create_index("ix_user_permissions_permission", "user_permissions", ["permission"])

    # --- Betreibereinstellungen --------------------------------------------
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=120), primary_key=True),
        sa.Column("value_json", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_user_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )

    # --- Stammdaten ---------------------------------------------------------
    op.add_column("users", sa.Column("first_name", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(length=80), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(length=1000), nullable=True))

    op.add_column("employees", sa.Column("team_id", sa.String(length=36), nullable=True))
    op.add_column("employees", sa.Column("employee_number", sa.String(length=60), nullable=True))
    op.add_column("employees", sa.Column("hired_on", sa.Date(), nullable=True))
    op.add_column("employees", sa.Column("location", sa.String(length=160), nullable=True))
    op.create_index("ix_employees_team_id", "employees", ["team_id"])
    op.create_index("ix_employees_employee_number", "employees", ["employee_number"])
    # Der Fremdschluessel wird eigens benannt, damit downgrade ihn wieder
    # loesen kann - SQLite verlangt dafuer den Batch-Modus.
    with op.batch_alter_table("employees") as batch:
        batch.create_foreign_key(
            "fk_employees_team_id", "teams", ["team_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    with op.batch_alter_table("employees") as batch:
        batch.drop_constraint("fk_employees_team_id", type_="foreignkey")
    op.drop_index("ix_employees_employee_number", table_name="employees")
    op.drop_index("ix_employees_team_id", table_name="employees")
    op.drop_column("employees", "location")
    op.drop_column("employees", "hired_on")
    op.drop_column("employees", "employee_number")
    op.drop_column("employees", "team_id")

    op.drop_column("users", "avatar_url")
    op.drop_column("users", "phone")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")

    op.drop_table("system_settings")

    op.drop_index("ix_user_permissions_permission", table_name="user_permissions")
    op.drop_index("ix_user_permissions_user_id", table_name="user_permissions")
    op.drop_table("user_permissions")
    sa.Enum(name="permission").drop(op.get_bind(), checkfirst=True)

    for tabelle, spalten in (
        ("teams", ["is_active", "lead_user_id", "name", "district_id"]),
        ("districts", ["is_active", "lead_user_id", "name", "region_id"]),
        ("regions", ["is_active", "lead_user_id", "name"]),
    ):
        for spalte in spalten:
            op.drop_index(f"ix_{tabelle}_{spalte}", table_name=tabelle)
        op.drop_table(tabelle)

    # Die beiden Rollenwerte bleiben im PostgreSQL-Typ stehen. Einen Wert aus
    # einem Enum zu entfernen geht nur, indem der ganze Typ neu gebaut wird -
    # das wuerde jede Zeile in users anfassen. Ein ungenutzter Wert schadet
    # nicht; wer ihn loswerden will, muss den Typ von Hand ersetzen.


