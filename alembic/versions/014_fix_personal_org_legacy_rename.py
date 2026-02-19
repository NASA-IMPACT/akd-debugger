"""Fix legacy personal organization rename pattern.

Revision ID: 014
Revises: 013
Create Date: 2026-02-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE organizations
            SET name = 'Default'
            WHERE is_personal = true
              AND (name LIKE :legacy_pattern OR name LIKE :fallback_pattern)
            """
        ),
        {
            "legacy_pattern": "%'s Personal Organization",
            "fallback_pattern": "% Personal Organization",
        },
    )


def downgrade() -> None:
    pass
