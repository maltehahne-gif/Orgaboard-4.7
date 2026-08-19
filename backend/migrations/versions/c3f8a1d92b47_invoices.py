"""Rechnungen: Beleg zu jedem Verkauf, plus Anschrift am Benutzer

Legt invoices und invoice_items an und ergaenzt den Benutzer um seine
Anschrift. Die Anschrift steht auf jeder Rechnung, die er erstellt -
deshalb am Benutzer und nicht als feste Angabe im Code.

Revision ID: c3f8a1d92b47
Revises: ffd97e165294
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f8a1d92b47"
down_revision: Union[str, None] = "ffd97e165294"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ZAHLUNGSART = sa.Enum("CASH", "CARD", name="paymentmethod")


def upgrade() -> None:
    for spalte, laenge in (("street", 180), ("house_number", 30), ("postal_code", 20), ("city", 120)):
        op.add_column("users", sa.Column(spalte, sa.String(length=laenge), nullable=True))

    op.create_table(
        "invoices",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("number", sa.String(length=40), nullable=False),
        # Ohne Verkauf gibt es nichts zu berechnen: die Rechnung faellt mit.
        sa.Column(
            "sale_id",
            sa.String(length=36),
            sa.ForeignKey("sales.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("customer_id", sa.String(length=36), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("employee_id", sa.String(length=36), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("issued_on", sa.Date(), nullable=False),
        sa.Column("service_on", sa.Date(), nullable=False),
        sa.Column("issuer_name", sa.String(length=255), nullable=False),
        sa.Column("issuer_street", sa.String(length=220), nullable=True),
        sa.Column("issuer_postal_code", sa.String(length=20), nullable=True),
        sa.Column("issuer_city", sa.String(length=120), nullable=True),
        sa.Column("issuer_phone", sa.String(length=80), nullable=True),
        sa.Column("customer_name", sa.String(length=255), nullable=False),
        sa.Column("customer_street", sa.String(length=220), nullable=True),
        sa.Column("customer_postal_code", sa.String(length=20), nullable=True),
        sa.Column("customer_city", sa.String(length=120), nullable=True),
        sa.Column("customer_phone", sa.String(length=80), nullable=True),
        sa.Column("customer_email", sa.String(length=255), nullable=True),
        sa.Column("customer_contact", sa.String(length=255), nullable=True),
        sa.Column("payment_method", ZAHLUNGSART, nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_invoices_number", "invoices", ["number"], unique=True)
    op.create_index("ix_invoices_sale_id", "invoices", ["sale_id"], unique=True)
    op.create_index("ix_invoices_customer_id", "invoices", ["customer_id"])
    op.create_index("ix_invoices_employee_id", "invoices", ["employee_id"])
    op.create_index("ix_invoices_issued_on", "invoices", ["issued_on"])

    op.create_table(
        "invoice_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "invoice_id",
            sa.String(length=36),
            sa.ForeignKey("invoices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Wird ein Produkt aus dem Katalog entfernt, bleibt die Position mit
        # ihrem Namensschnappschuss stehen.
        sa.Column(
            "product_id",
            sa.String(length=36),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("vat_percent", sa.Integer(), nullable=False, server_default="19"),
    )
    op.create_index("ix_invoice_items_invoice_id", "invoice_items", ["invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_invoice_items_invoice_id", table_name="invoice_items")
    op.drop_table("invoice_items")
    op.drop_index("ix_invoices_issued_on", table_name="invoices")
    op.drop_index("ix_invoices_employee_id", table_name="invoices")
    op.drop_index("ix_invoices_customer_id", table_name="invoices")
    op.drop_index("ix_invoices_sale_id", table_name="invoices")
    op.drop_index("ix_invoices_number", table_name="invoices")
    op.drop_table("invoices")
    for spalte in ("city", "postal_code", "house_number", "street"):
        op.drop_column("users", spalte)
    # Auf PostgreSQL bliebe der Enum-Typ sonst als Leiche zurueck.
    ZAHLUNGSART.drop(op.get_bind(), checkfirst=True)
