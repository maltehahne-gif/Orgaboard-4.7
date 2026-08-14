"""Verkauf stornieren statt loeschen

Revision ID: d7b3f1e0a852
Revises: c5e1a2b7d904
Create Date: 2026-08-14

Hinweis zur Umsetzung: SQLite kann Fremdschluessel nicht per ALTER TABLE
nachtragen. Ohne batch_alter_table bricht die Migration dort mitten drin ab -
die Spalten waeren angelegt, der Fremdschluessel nicht, und die Revision
bliebe unverbucht. Der Batch-Modus kopiert die Tabelle um und funktioniert
auf SQLite wie auf PostgreSQL.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7b3f1e0a852"
down_revision: Union[str, Sequence[str], None] = "c5e1a2b7d904"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("sales") as batch:
        batch.add_column(sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("cancelled_by_user_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("cancellation_reason", sa.Text(), nullable=True))
        batch.create_foreign_key(
            "fk_sales_cancelled_by_user",
            "users",
            ["cancelled_by_user_id"],
            ["id"],
        )

    op.create_index("ix_sales_cancelled_at", "sales", ["cancelled_at"])


def downgrade() -> None:
    op.drop_index("ix_sales_cancelled_at", table_name="sales")

    with op.batch_alter_table("sales") as batch:
        batch.drop_constraint("fk_sales_cancelled_by_user", type_="foreignkey")
        batch.drop_column("cancellation_reason")
        batch.drop_column("cancelled_by_user_id")
        batch.drop_column("cancelled_at")
