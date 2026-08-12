"""message hidden

Revision ID: 7e91a2c3d4f5
Revises: 4dbf08e3a075
Create Date: 2026-08-11
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "7e91a2c3d4f5"
down_revision: Union[str, Sequence[str], None] = "4dbf08e3a075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_hidden",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "message_id",
            "user_id",
            name="uq_message_hidden_user"
        )
    )

    op.create_index(
        op.f("ix_message_hidden_message_id"),
        "message_hidden",
        ["message_id"]
    )

    op.create_index(
        op.f("ix_message_hidden_user_id"),
        "message_hidden",
        ["user_id"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_message_hidden_user_id"),
        table_name="message_hidden"
    )
    op.drop_index(
        op.f("ix_message_hidden_message_id"),
        table_name="message_hidden"
    )
    op.drop_table("message_hidden")
