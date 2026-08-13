"""per-user message read state

Revision ID: a13c9e5f7b21
Revises: 7e91a2c3d4f5
Create Date: 2026-08-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a13c9e5f7b21"
down_revision: Union[str, Sequence[str], None] = "7e91a2c3d4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_reads",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "message_id",
            "user_id",
            name="uq_message_read_user",
        ),
    )

    op.create_index(
        op.f("ix_message_reads_message_id"),
        "message_reads",
        ["message_id"],
    )

    op.create_index(
        op.f("ix_message_reads_user_id"),
        "message_reads",
        ["user_id"],
    )

    # Bereits gelesene private Nachrichten übernehmen.
    op.execute("""
        INSERT INTO message_reads (id, message_id, user_id, read_at)
        SELECT
            md5(random()::text || clock_timestamp()::text || m.id),
            m.id,
            m.recipient_user_id,
            m.read_at
        FROM messages m
        WHERE m.recipient_user_id IS NOT NULL
          AND m.read_at IS NOT NULL
        ON CONFLICT (message_id, user_id) DO NOTHING
    """)

    # Alte Team-Nachrichten werden für bestehende Benutzer als bereits
    # gelesen behandelt, damit nicht plötzlich alte Nachrichten als neu
    # erscheinen.
    op.execute("""
        INSERT INTO message_reads (id, message_id, user_id, read_at)
        SELECT
            md5(random()::text || clock_timestamp()::text || m.id || u.id),
            m.id,
            u.id,
            m.created_at
        FROM messages m
        CROSS JOIN users u
        WHERE m.recipient_user_id IS NULL
          AND u.id <> m.sender_user_id
        ON CONFLICT (message_id, user_id) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index(
        op.f("ix_message_reads_user_id"),
        table_name="message_reads",
    )
    op.drop_index(
        op.f("ix_message_reads_message_id"),
        table_name="message_reads",
    )
    op.drop_table("message_reads")
