"""Benachrichtigungen: Anlass-Schluessel, Einstellungen, Push-Anmeldungen

Erweitert notifications um link und dedupe_key (damit derselbe Anlass nicht
bei jedem Abruf erneut entsteht) und legt notification_settings sowie
push_subscriptions an.

Revision ID: c9d4e0b71f52
Revises: b7c2e9f14a68
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d4e0b71f52"
down_revision: Union[str, None] = "b7c2e9f14a68"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


KATEGORIE = sa.Enum(
    "APPOINTMENT_SOON", "APPOINTMENT_TODAY", "FOLLOWUP_TODAY", "FOLLOWUP_OVERDUE",
    "MESSAGE_NEW", "RENTAL_DUE", "RENTAL_OVERDUE",
    name="notificationcategory",
)


def upgrade() -> None:
    # Batch-Modus: SQLite kann keine Bedingung nachtraeglich per ALTER
    # ergaenzen und baut die Tabelle deshalb um. Auf PostgreSQL laeuft
    # derselbe Aufruf als gewoehnliches ALTER durch.
    with op.batch_alter_table("notifications") as batch:
        batch.add_column(sa.Column("link", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("dedupe_key", sa.String(length=200), nullable=True))
        batch.create_unique_constraint("uq_notification_dedupe", ["user_id", "dedupe_key"])

    # Den Enum-Typ NICHT vorab anlegen: create_table() erzeugt ihn auf
    # PostgreSQL selbst. Beides zusammen scheiterte mit "type ... already
    # exists" - und zwar nur dort, weil SQLite keine Enum-Typen kennt und
    # den Fehler deshalb nie zeigt. Gleiches Vorgehen wie in der
    # Altgeraete-Migration (e4a7c9b2f318).
    op.create_table(
        "notification_settings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id", sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("category", KATEGORIE, nullable=False),
        sa.Column("in_app", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("push", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("user_id", "category", name="uq_notification_setting"),
    )
    op.create_index("ix_notification_settings_user_id", "notification_settings", ["user_id"])
    op.create_index("ix_notification_settings_category", "notification_settings", ["category"])

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id", sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("endpoint", sa.String(length=600), nullable=False),
        sa.Column("p256dh", sa.String(length=200), nullable=False),
        sa.Column("auth", sa.String(length=100), nullable=False),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])
    op.create_index("ix_push_subscriptions_endpoint", "push_subscriptions", ["endpoint"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_push_subscriptions_endpoint", table_name="push_subscriptions")
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")

    op.drop_index("ix_notification_settings_category", table_name="notification_settings")
    op.drop_index("ix_notification_settings_user_id", table_name="notification_settings")
    op.drop_table("notification_settings")
    KATEGORIE.drop(op.get_bind(), checkfirst=True)

    with op.batch_alter_table("notifications") as batch:
        batch.drop_constraint("uq_notification_dedupe", type_="unique")
        batch.drop_column("dedupe_key")
        batch.drop_column("link")
