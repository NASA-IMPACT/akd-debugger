"""Add source_code to agent configs

Revision ID: 009
Revises: 008
Create Date: 2026-02-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agent_configs", sa.Column("source_code", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_configs", "source_code")

