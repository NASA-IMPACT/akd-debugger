"""Add trace logs table

Revision ID: 006
Revises: 005
Create Date: 2026-02-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trace_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("run_id", sa.Integer, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=True),
        sa.Column("query_id", sa.Integer, sa.ForeignKey("queries.id"), nullable=True),
        sa.Column("provider", sa.String(50), nullable=False, server_default="openai"),
        sa.Column("endpoint", sa.String(120), nullable=False, server_default="agents.runner.run"),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="started"),
        sa.Column("request_payload", postgresql.JSONB, nullable=True),
        sa.Column("response_payload", postgresql.JSONB, nullable=True),
        sa.Column("usage", postgresql.JSONB, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_trace_logs_created_at", "trace_logs", ["created_at"], unique=False)
    op.create_index("ix_trace_logs_model", "trace_logs", ["model"], unique=False)
    op.create_index("ix_trace_logs_query_id", "trace_logs", ["query_id"], unique=False)
    op.create_index("ix_trace_logs_run_id", "trace_logs", ["run_id"], unique=False)
    op.create_index("ix_trace_logs_status", "trace_logs", ["status"], unique=False)

    op.add_column("results", sa.Column("trace_log_id", sa.Integer, nullable=True))
    op.create_index("ix_results_trace_log_id", "results", ["trace_log_id"], unique=False)
    op.create_foreign_key(
        "fk_results_trace_log_id_trace_logs",
        "results",
        "trace_logs",
        ["trace_log_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_results_trace_log_id_trace_logs", "results", type_="foreignkey")
    op.drop_index("ix_results_trace_log_id", table_name="results")
    op.drop_column("results", "trace_log_id")

    op.drop_index("ix_trace_logs_status", table_name="trace_logs")
    op.drop_index("ix_trace_logs_run_id", table_name="trace_logs")
    op.drop_index("ix_trace_logs_query_id", table_name="trace_logs")
    op.drop_index("ix_trace_logs_model", table_name="trace_logs")
    op.drop_index("ix_trace_logs_created_at", table_name="trace_logs")
    op.drop_table("trace_logs")
