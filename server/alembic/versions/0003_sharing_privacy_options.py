"""sharing privacy options

Revision ID: 0003_sharing_privacy_options
Revises: 0002_shared_features
Create Date: 2026-05-04 00:00:02.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_sharing_privacy_options"
down_revision: str | None = "0002_shared_features"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sharing_settings",
        sa.Column("mode", sa.String(length=24), server_default="always", nullable=False),
    )
    op.add_column(
        "sharing_settings",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "sharing_settings",
        sa.Column("share_battery", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "sharing_settings",
        sa.Column("share_distance", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "sharing_settings",
        sa.Column("precise_location", sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("sharing_settings", "precise_location")
    op.drop_column("sharing_settings", "share_distance")
    op.drop_column("sharing_settings", "share_battery")
    op.drop_column("sharing_settings", "expires_at")
    op.drop_column("sharing_settings", "mode")
