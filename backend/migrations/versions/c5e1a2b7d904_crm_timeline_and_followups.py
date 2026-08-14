"""Kundennotizen mit Verlauf, Wiedervorlagen und Termin-Ergebnis

Revision ID: c5e1a2b7d904
Revises: a53dfa8ec9d2
Create Date: 2026-08-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c5e1a2b7d904"
down_revision: Union[str, Sequence[str], None] = "a53dfa8ec9d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_notes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("customer_id", sa.String(length=36), nullable=False),
        sa.Column("employee_id", sa.String(length=36), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_customer_notes_customer_id", "customer_notes", ["customer_id"])
    op.create_index("ix_customer_notes_employee_id", "customer_notes", ["employee_id"])
    op.create_index("ix_customer_notes_created_at", "customer_notes", ["created_at"])

    op.create_table(
        "follow_ups",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("customer_id", sa.String(length=36), nullable=False),
        sa.Column("employee_id", sa.String(length=36), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column(
            "reason",
            sa.Enum(
                "NO_RESULT",
                "AFTER_SALE",
                "RENTAL_RETURN",
                "OFFER",
                "MANUAL",
                name="followupreason",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("OPEN", "DONE", "CANCELLED", name="followupstatus"),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("appointment_id", sa.String(length=36), nullable=True),
        sa.Column("sale_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sale_id"], ["sales.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_follow_ups_customer_id", "follow_ups", ["customer_id"])
    op.create_index("ix_follow_ups_employee_id", "follow_ups", ["employee_id"])
    op.create_index("ix_follow_ups_due_on", "follow_ups", ["due_on"])
    op.create_index("ix_follow_ups_status", "follow_ups", ["status"])
    # Die haeufigste Abfrage ist "offene Wiedervorlagen dieses Mitarbeiters bis
    # heute" - dafuer ein zusammengesetzter Index.
    op.create_index(
        "ix_follow_ups_employee_status_due",
        "follow_ups",
        ["employee_id", "status", "due_on"],
    )

    op.add_column("appointments", sa.Column("outcome", sa.String(length=20), nullable=True))
    op.create_index("ix_appointments_outcome", "appointments", ["outcome"])


def downgrade() -> None:
    op.drop_index("ix_appointments_outcome", table_name="appointments")
    op.drop_column("appointments", "outcome")

    op.drop_index("ix_follow_ups_employee_status_due", table_name="follow_ups")
    op.drop_index("ix_follow_ups_status", table_name="follow_ups")
    op.drop_index("ix_follow_ups_due_on", table_name="follow_ups")
    op.drop_index("ix_follow_ups_employee_id", table_name="follow_ups")
    op.drop_index("ix_follow_ups_customer_id", table_name="follow_ups")
    op.drop_table("follow_ups")

    op.drop_index("ix_customer_notes_created_at", table_name="customer_notes")
    op.drop_index("ix_customer_notes_employee_id", table_name="customer_notes")
    op.drop_index("ix_customer_notes_customer_id", table_name="customer_notes")
    op.drop_table("customer_notes")
