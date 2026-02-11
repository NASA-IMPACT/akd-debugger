"""Add async preview status fields and app notifications

Revision ID: 008
Revises: 007
Create Date: 2026-02-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("run_cost_previews", sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"))
    op.add_column("run_cost_previews", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("run_cost_previews", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("run_cost_previews", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_run_cost_previews_status", "run_cost_previews", ["status"], unique=False)

    op.create_table(
        "app_notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notif_type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("related_id", sa.Integer(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_app_notifications_created_at", "app_notifications", ["created_at"], unique=False)
    op.create_index("ix_app_notifications_is_read", "app_notifications", ["is_read"], unique=False)
    op.create_index("ix_app_notifications_notif_type", "app_notifications", ["notif_type"], unique=False)
    op.create_index("ix_app_notifications_related_id", "app_notifications", ["related_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_app_notifications_related_id", table_name="app_notifications")
    op.drop_index("ix_app_notifications_notif_type", table_name="app_notifications")
    op.drop_index("ix_app_notifications_is_read", table_name="app_notifications")
    op.drop_index("ix_app_notifications_created_at", table_name="app_notifications")
    op.drop_table("app_notifications")

    op.drop_index("ix_run_cost_previews_status", table_name="run_cost_previews")
    op.drop_column("run_cost_previews", "completed_at")
    op.drop_column("run_cost_previews", "started_at")
    op.drop_column("run_cost_previews", "error_message")
    op.drop_column("run_cost_previews", "status")
