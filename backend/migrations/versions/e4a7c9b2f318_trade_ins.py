"""Altgeraete: hereingenommene Geraete erfassen und nachverfolgen

Legt die Tabelle trade_ins an. Ein Altgeraet haengt immer an einem Kunden
und einem Mitarbeiter; die Verbindung zu einem Verkauf ist optional, weil
Geraete auch ohne Verkauf hereinkommen koennen.

Revision ID: e4a7c9b2f318
Revises: 8abdb3db740f
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4a7c9b2f318"
down_revision: Union[str, None] = "8abdb3db740f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ZUSTAND = sa.Enum("WORKING", "DEFECTIVE", "PARTS", "UNKNOWN", name="tradeincondition")
STATUS = sa.Enum("RECEIVED", "STORED", "RETURNED", "DISPOSED", "SOLD", name="tradeinstatus")


def upgrade() -> None:
    op.create_table(
        "trade_ins",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("customer_id", sa.String(length=36), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("employee_id", sa.String(length=36), sa.ForeignKey("employees.id"), nullable=False),
        # Faellt der Verkauf weg, bleibt das Altgeraet bestehen.
        sa.Column(
            "sale_id",
            sa.String(length=36),
            sa.ForeignKey("sales.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("serial_number", sa.String(length=120), nullable=True),
        sa.Column("condition", ZUSTAND, nullable=False, server_default="UNKNOWN"),
        sa.Column("status", STATUS, nullable=False, server_default="RECEIVED"),
        sa.Column("received_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trade_ins_customer_id", "trade_ins", ["customer_id"])
    op.create_index("ix_trade_ins_employee_id", "trade_ins", ["employee_id"])
    op.create_index("ix_trade_ins_sale_id", "trade_ins", ["sale_id"])
    op.create_index("ix_trade_ins_model", "trade_ins", ["model"])
    op.create_index("ix_trade_ins_serial_number", "trade_ins", ["serial_number"])
    op.create_index("ix_trade_ins_condition", "trade_ins", ["condition"])
    op.create_index("ix_trade_ins_status", "trade_ins", ["status"])
    op.create_index("ix_trade_ins_received_on", "trade_ins", ["received_on"])


def downgrade() -> None:
    op.drop_index("ix_trade_ins_received_on", table_name="trade_ins")
    op.drop_index("ix_trade_ins_status", table_name="trade_ins")
    op.drop_index("ix_trade_ins_condition", table_name="trade_ins")
    op.drop_index("ix_trade_ins_serial_number", table_name="trade_ins")
    op.drop_index("ix_trade_ins_model", table_name="trade_ins")
    op.drop_index("ix_trade_ins_sale_id", table_name="trade_ins")
    op.drop_index("ix_trade_ins_employee_id", table_name="trade_ins")
    op.drop_index("ix_trade_ins_customer_id", table_name="trade_ins")
    op.drop_table("trade_ins")
    # Auf PostgreSQL bleiben die Enum-Typen sonst als Leiche zurueck.
    bind = op.get_bind()
    ZUSTAND.drop(bind, checkfirst=True)
    STATUS.drop(bind, checkfirst=True)
