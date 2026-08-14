"""merge monthly units target and message migrations

Revision ID: a53dfa8ec9d2
Revises: 9c7a4e2f6b10, b24d6f8a9c31
Create Date: 2026-08-14 17:29:15.762374
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a53dfa8ec9d2'
down_revision: Union[str, Sequence[str], None] = ('9c7a4e2f6b10', 'b24d6f8a9c31')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
