"""Angebote: Angebot und Angebotspositionen anlegen

Legt offers und offer_items an. Ein Angebot haengt an Kunde und Mitarbeiter,
optional an einem Termin. Positionen tragen wie bei Verkaeufen einen Namens-
und Preis-Schnappschuss.

Revision ID: b7c2e9f14a68
Revises: a2f4c8d15e73
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7c2e9f14a68"
down_revision: Union[str, None] = "a2f4c8d15e73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STATUS = sa.Enum(
    "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED",
    name="offerstatus",
)


def upgrade() -> None:
    op.create_table(
        "offers",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("number", sa.String(length=40), nullable=False),
        sa.Column("customer_id", sa.String(length=36), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("employee_id", sa.String(length=36), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("appointment_id", sa.String(length=36), sa.ForeignKey("appointments.id"), nullable=True),
        sa.Column("status", STATUS, nullable=False, server_default="DRAFT"),
        sa.Column("issued_on", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("discount_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "converted_sale_id",
            sa.String(length=36),
            sa.ForeignKey("sales.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_offers_number", "offers", ["number"], unique=True)
    op.create_index("ix_offers_customer_id", "offers", ["customer_id"])
    op.create_index("ix_offers_employee_id", "offers", ["employee_id"])
    op.create_index("ix_offers_status", "offers", ["status"])

    op.create_table(
        "offer_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("offer_id", sa.String(length=36), sa.ForeignKey("offers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.String(length=36), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("product_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
    )
    op.create_index("ix_offer_items_offer_id", "offer_items", ["offer_id"])
    op.create_index("ix_offer_items_product_id", "offer_items", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_offer_items_product_id", table_name="offer_items")
    op.drop_index("ix_offer_items_offer_id", table_name="offer_items")
    op.drop_table("offer_items")

    op.drop_index("ix_offers_status", table_name="offers")
    op.drop_index("ix_offers_employee_id", table_name="offers")
    op.drop_index("ix_offers_customer_id", table_name="offers")
    op.drop_index("ix_offers_number", table_name="offers")
    op.drop_table("offers")
    bind = op.get_bind()
    STATUS.drop(bind, checkfirst=True)
