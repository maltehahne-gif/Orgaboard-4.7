"""Feedback wird intern zugestellt statt per Mail

Ergaenzt die Tabelle feedback um zwei Spalten zur internen Zustellung:
delivered_at und admin_message_count. Beide werden im selben Commit gesetzt
wie das Feedback selbst (siehe routers/feedback.py), es kann also keinen
Eintrag ohne Zustellung geben.

Die drei email_*-Spalten bleiben absichtlich bestehen. Sie tragen die
Historie der Eintraege aus der Zeit des Mailversands; ein Loeschen wuerde
diese Historie vernichten, ohne dafuer irgendetwas zu gewinnen. Neu
geschrieben werden sie nicht mehr.

Revision ID: c3f7a1d9e485
Revises: ffd97e165294
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f7a1d9e485"
down_revision: Union[str, None] = "ffd97e165294"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "feedback",
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "feedback",
        sa.Column(
            "admin_message_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("feedback", "admin_message_count")
    op.drop_column("feedback", "delivered_at")
