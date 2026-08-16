"""per-user message read state

Revision ID: a13c9e5f7b21
Revises: 7e91a2c3d4f5
Create Date: 2026-08-13
"""

import uuid
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


    # Bestehende Nachrichten uebernehmen.
    #
    # Die Schluessel entstehen in Python, nicht in der Datenbank. Vorher
    # standen hier randomblob()/hex() - beides gibt es nur in SQLite, und
    # auf PostgreSQL brach die Migration deshalb ab. Da vor ihr
    # `alembic upgrade head` im Startbefehl steht, kam der Container nie
    # hoch. uuid4() ist in jedem Dialekt gleich.
    bind = op.get_bind()

    # 1. Bereits gelesene private Nachrichten.
    gelesen = bind.execute(
        sa.text(
            "SELECT id, recipient_user_id, read_at FROM messages "
            "WHERE recipient_user_id IS NOT NULL AND read_at IS NOT NULL"
        )
    ).fetchall()

    # 2. Alte Team-Nachrichten fuer alle ausser dem Absender.
    team = bind.execute(
        sa.text(
            "SELECT m.id, u.id AS user_id, m.created_at "
            "FROM messages m CROSS JOIN users u "
            "WHERE m.recipient_user_id IS NULL AND u.id <> m.sender_user_id"
        )
    ).fetchall()

    einfuegen = sa.text(
        "INSERT INTO message_reads (id, message_id, user_id, read_at) "
        "VALUES (:id, :message_id, :user_id, :read_at)"
    )

    for message_id, user_id, read_at in [*gelesen, *team]:
        bind.execute(
            einfuegen,
            {
                "id": str(uuid.uuid4()),
                "message_id": message_id,
                "user_id": user_id,
                "read_at": read_at,
            },
        )



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
