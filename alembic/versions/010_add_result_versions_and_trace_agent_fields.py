"""Add result versions and trace agent fields.

Revision ID: 010
Revises: 009
Create Date: 2026-02-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "results",
        sa.Column(
            "parent_result_id",
            sa.Integer(),
            sa.ForeignKey("results.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "results",
        sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "results",
        sa.Column(
            "is_default_version",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "results",
        sa.Column(
            "version_status",
            sa.String(length=20),
            nullable=False,
            server_default="active",
        ),
    )
    op.create_index(
        "ix_results_parent_result_id", "results", ["parent_result_id"], unique=False
    )
    op.create_index(
        "ix_results_is_default_version", "results", ["is_default_version"], unique=False
    )
    op.create_index(
        "ix_results_version_status", "results", ["version_status"], unique=False
    )

    op.add_column(
        "trace_logs",
        sa.Column(
            "agent_config_id",
            sa.Integer(),
            sa.ForeignKey("agent_configs.id"),
            nullable=True,
        ),
    )
    op.add_column(
        "trace_logs",
        sa.Column(
            "trace_type",
            sa.String(length=20),
            nullable=False,
            server_default="benchmark",
        ),
    )
    op.create_index(
        "ix_trace_logs_agent_config_id", "trace_logs", ["agent_config_id"], unique=False
    )
    op.create_index("ix_trace_logs_trace_type", "trace_logs", ["trace_type"], unique=False)

    op.execute("UPDATE results SET version_number = 1 WHERE version_number IS NULL")
    op.execute(
        "UPDATE results SET is_default_version = true WHERE is_default_version IS NULL"
    )
    op.execute(
        "UPDATE results SET version_status = 'active' WHERE version_status IS NULL"
    )
    op.execute(
        """
        UPDATE trace_logs
        SET trace_type = CASE
            WHEN endpoint LIKE '%preview%' THEN 'preview'
            WHEN run_id IS NOT NULL THEN 'benchmark'
            ELSE 'benchmark'
        END
        WHERE trace_type IS NULL OR trace_type = 'benchmark'
        """
    )
    op.execute(
        """
        UPDATE trace_logs tl
        SET agent_config_id = r.agent_config_id
        FROM runs r
        WHERE tl.run_id = r.id AND tl.agent_config_id IS NULL
        """
    )

def downgrade() -> None:
    op.drop_index("ix_trace_logs_trace_type", table_name="trace_logs")
    op.drop_index("ix_trace_logs_agent_config_id", table_name="trace_logs")
    op.drop_column("trace_logs", "trace_type")
    op.drop_column("trace_logs", "agent_config_id")

    op.drop_index("ix_results_version_status", table_name="results")
    op.drop_index("ix_results_is_default_version", table_name="results")
    op.drop_index("ix_results_parent_result_id", table_name="results")
    op.drop_column("results", "version_status")
    op.drop_column("results", "is_default_version")
    op.drop_column("results", "version_number")
    op.drop_column("results", "parent_result_id")
