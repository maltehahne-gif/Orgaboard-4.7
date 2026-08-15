"""Chat: eigene Nachricht loeschen und bearbeiten

Revision ID: 409f2920e1fb
Revises: d7b3f1e0a852
Create Date: 2026-08-15

Loeschen ist bewusst ein weiches Loeschen: der Nachrichtentext bleibt in der
Datenbank (Nachvollziehbarkeit, Audit-Log), die Oberflaeche zeigt aber nur
noch einen Platzhalter. Bearbeiten ueberschreibt den Text, das urspruengliche
Sendedatum bleibt unveraendert - "bearbeitet" wird ueber edited_at markiert.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "409f2920e1fb"
down_revision: Union[str, Sequence[str], None] = "d7b3f1e0a852"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("messages") as batch:
        batch.add_column(sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("messages") as batch:
        batch.drop_column("deleted_at")
        batch.drop_column("edited_at")
