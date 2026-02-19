"""Remove bootstrap owner claim behavior.

Revision ID: 012
Revises: 011
Create Date: 2026-02-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Bootstrap organization should not have a special owner user.
    op.execute(
        sa.text(
            """
            UPDATE organizations
            SET owner_user_id = NULL
            WHERE is_bootstrap = true
            """
        )
    )

    # Clear any previously claimed bootstrap owner marker.
    op.execute(
        sa.text(
            """
            UPDATE system_state
            SET bootstrap_owner_user_id = NULL
            """
        )
    )


def downgrade() -> None:
    # No safe downgrade: previous owner identity cannot be reconstructed.
    pass
