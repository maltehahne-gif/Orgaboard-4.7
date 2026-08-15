"""Grund erfassen, wenn ein Termin ohne Abschluss endet

Revision ID: 8abdb3db740f
Revises: 409f2920e1fb
Create Date: 2026-08-15

Bisher liess sich ein Termin nur als "kein Verkauf, kein Verleih" abschliessen -
warum, ging verloren. Das Feld ist bewusst ein freier Kurzcode statt eines
eigenen Enums: die Liste moeglicher Gruende aendert sich erfahrungsgemaess
haeufiger als ein Datenbank-Enum guenstig migriert werden kann.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8abdb3db740f"
down_revision: Union[str, Sequence[str], None] = "409f2920e1fb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("appointments") as batch:
        batch.add_column(sa.Column("no_result_reason", sa.String(length=40), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("appointments") as batch:
        batch.drop_column("no_result_reason")
