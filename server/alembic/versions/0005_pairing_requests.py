"""pairing requests

Revision ID: 0005_pairing_requests
Revises: 0004_sms_auth
Create Date: 2026-05-04 00:00:05.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_pairing_requests"
down_revision: str | None = "0004_sms_auth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pairing_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invite_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("creator_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requester_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["creator_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invite_id"], ["pairing_invites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requester_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pairing_requests_status", "pairing_requests", ["status"])
    op.create_index(
        "ix_pairing_requests_creator_status",
        "pairing_requests",
        ["creator_user_id", "status"],
    )
    op.create_index(
        "ix_pairing_requests_requester_status",
        "pairing_requests",
        ["requester_user_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_pairing_requests_requester_status", table_name="pairing_requests")
    op.drop_index("ix_pairing_requests_creator_status", table_name="pairing_requests")
    op.drop_index("ix_pairing_requests_status", table_name="pairing_requests")
    op.drop_table("pairing_requests")
