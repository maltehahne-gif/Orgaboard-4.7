"""rename weekly units target to monthly units target

Revision ID: 9c7a4e2f6b10
Revises: 4dbf08e3a075
Create Date: 2026-08-14
"""

from typing import Sequence, Union

from alembic import op


revision: str = "9c7a4e2f6b10"
down_revision: Union[str, Sequence[str], None] = "4dbf08e3a075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "employees",
        "weekly_units_target",
        new_column_name="monthly_units_target",
    )


def downgrade() -> None:
    op.alter_column(
        "employees",
        "monthly_units_target",
        new_column_name="weekly_units_target",
    )
