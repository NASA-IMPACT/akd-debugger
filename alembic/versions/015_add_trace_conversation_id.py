"""Add conversation id to trace logs.

Revision ID: 015
Revises: 014
Create Date: 2026-02-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "trace_logs",
        sa.Column("conversation_id", sa.String(length=120), nullable=True),
    )
    op.create_index(
        "ix_trace_logs_conversation_id",
        "trace_logs",
        ["conversation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_trace_logs_conversation_id", table_name="trace_logs")
    op.drop_column("trace_logs", "conversation_id")
