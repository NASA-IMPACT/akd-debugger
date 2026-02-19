"""Set personal organization default name.

Revision ID: 013
Revises: 012
Create Date: 2026-02-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename legacy auto-generated personal org names to the new default label.
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE organizations
            SET name = 'Default'
            WHERE is_personal = true
              AND name LIKE :legacy_pattern
            """
        ),
        {"legacy_pattern": "%''s Personal Organization"},
    )


def downgrade() -> None:
    # Not reversible: original full-name-derived values are not recoverable.
    pass
