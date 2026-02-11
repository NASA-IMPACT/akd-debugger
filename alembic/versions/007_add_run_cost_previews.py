"""Add run cost previews table

Revision ID: 007
Revises: 006
Create Date: 2026-02-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "run_cost_previews",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("suite_id", sa.Integer, sa.ForeignKey("benchmark_suites.id"), nullable=False),
        sa.Column("agent_config_id", sa.Integer, sa.ForeignKey("agent_configs.id"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.String), server_default="{}", nullable=False),
        sa.Column("batch_size", sa.Integer, nullable=False, server_default="10"),
        sa.Column("repeat", sa.Integer, nullable=False, server_default="1"),
        sa.Column("output_dir", sa.Text, nullable=True),
        sa.Column("query_ids", postgresql.ARRAY(sa.Integer), nullable=False),
        sa.Column("sample_query_ids", postgresql.ARRAY(sa.Integer), nullable=False),
        sa.Column("total_query_count", sa.Integer, nullable=False),
        sa.Column("sample_usage", postgresql.JSONB, nullable=False),
        sa.Column("sample_cost_usd", sa.Float, nullable=False),
        sa.Column("estimated_total_cost_usd", sa.Float, nullable=False),
        sa.Column("pricing_version", sa.String(64), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="USD"),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_run_cost_previews_agent_config_id", "run_cost_previews", ["agent_config_id"], unique=False)
    op.create_index("ix_run_cost_previews_created_at", "run_cost_previews", ["created_at"], unique=False)
    op.create_index("ix_run_cost_previews_suite_id", "run_cost_previews", ["suite_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_run_cost_previews_suite_id", table_name="run_cost_previews")
    op.drop_index("ix_run_cost_previews_created_at", table_name="run_cost_previews")
    op.drop_index("ix_run_cost_previews_agent_config_id", table_name="run_cost_previews")
    op.drop_table("run_cost_previews")
