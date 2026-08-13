"""message attachments

Revision ID: b24d6f8a9c31
Revises: a13c9e5f7b21
Create Date: 2026-08-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b24d6f8a9c31"
down_revision: Union[str, Sequence[str], None] = "a13c9e5f7b21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_attachments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("content_type", sa.String(length=160), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("storage_name", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_name")
    )

    op.create_index(
        op.f("ix_message_attachments_message_id"),
        "message_attachments",
        ["message_id"]
    )
    op.create_index(
        op.f("ix_message_attachments_kind"),
        "message_attachments",
        ["kind"]
    )
    op.create_index(
        op.f("ix_message_attachments_created_at"),
        "message_attachments",
        ["created_at"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_message_attachments_created_at"),
        table_name="message_attachments"
    )
    op.drop_index(
        op.f("ix_message_attachments_kind"),
        table_name="message_attachments"
    )
    op.drop_index(
        op.f("ix_message_attachments_message_id"),
        table_name="message_attachments"
    )
    op.drop_table("message_attachments")
