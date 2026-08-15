"""Kunden anonymisieren statt loeschen (DSGVO Art. 17)

Fuegt customers.anonymized_at hinzu. Der Zeitstempel haelt fest, wann die
personenbezogenen Felder entfernt wurden. Der Datensatz selbst bleibt
bestehen, damit Verkaeufe und Umsatzzahlen nicht nachtraeglich verschwinden.

Revision ID: f1b8d3c60a94
Revises: e4a7c9b2f318
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1b8d3c60a94"
down_revision: Union[str, None] = "e4a7c9b2f318"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("anonymized_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_customers_anonymized_at", "customers", ["anonymized_at"])


def downgrade() -> None:
    op.drop_index("ix_customers_anonymized_at", table_name="customers")
    op.drop_column("customers", "anonymized_at")
