"""Feedback: Rueckmeldungen angemeldeter Benutzer per Mail an den Betreiber

Legt die Tabelle feedback an. Das Feedback wird zuerst gespeichert und erst
danach per Mail verschickt, damit ein kurzzeitig nicht erreichbarer
Mailserver keine Rueckmeldung verschluckt (siehe routers/feedback.py).

Revision ID: ffd97e165294
Revises: d2a91c47b6e0
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ffd97e165294"
down_revision: Union[str, None] = "d2a91c47b6e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


KATEGORIE = sa.Enum(
    "BUG", "IMPROVEMENT", "FEATURE_REQUEST", "DESIGN", "PERFORMANCE", "OTHER",
    name="feedbackcategory",
)


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("reference", sa.String(length=40), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", KATEGORIE, nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("page_path", sa.String(length=300), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("email_sent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_error", sa.String(length=500), nullable=True),
    )
    op.create_index("ix_feedback_reference", "feedback", ["reference"], unique=True)
    op.create_index("ix_feedback_user_id", "feedback", ["user_id"])
    op.create_index("ix_feedback_category", "feedback", ["category"])
    op.create_index("ix_feedback_created_at", "feedback", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_feedback_created_at", table_name="feedback")
    op.drop_index("ix_feedback_category", table_name="feedback")
    op.drop_index("ix_feedback_user_id", table_name="feedback")
    op.drop_index("ix_feedback_reference", table_name="feedback")
    op.drop_table("feedback")
    # Auf PostgreSQL bleibt der Enum-Typ sonst als Leiche zurueck.
    bind = op.get_bind()
    KATEGORIE.drop(bind, checkfirst=True)
