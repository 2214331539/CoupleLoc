"""sms auth

Revision ID: 0004_sms_auth
Revises: 0003_sharing_privacy_options
Create Date: 2026-05-04 00:00:03.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_sms_auth"
down_revision: str | None = "0003_sharing_privacy_options"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_number", sa.String(length=32), nullable=True))
    op.create_index("ix_users_phone_number", "users", ["phone_number"], unique=True)

    op.create_table(
        "sms_verification_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phone_number", sa.String(length=32), nullable=False),
        sa.Column("purpose", sa.String(length=24), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sms_verification_codes_phone_number", "sms_verification_codes", ["phone_number"])
    op.create_index("ix_sms_verification_codes_purpose", "sms_verification_codes", ["purpose"])
    op.create_index("ix_sms_verification_codes_expires_at", "sms_verification_codes", ["expires_at"])
    op.create_index("ix_sms_verification_codes_sent_at", "sms_verification_codes", ["sent_at"])
    op.create_index(
        "ix_sms_codes_phone_purpose_sent",
        "sms_verification_codes",
        ["phone_number", "purpose", "sent_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_sms_codes_phone_purpose_sent", table_name="sms_verification_codes")
    op.drop_index("ix_sms_verification_codes_sent_at", table_name="sms_verification_codes")
    op.drop_index("ix_sms_verification_codes_expires_at", table_name="sms_verification_codes")
    op.drop_index("ix_sms_verification_codes_purpose", table_name="sms_verification_codes")
    op.drop_index("ix_sms_verification_codes_phone_number", table_name="sms_verification_codes")
    op.drop_table("sms_verification_codes")
    op.drop_index("ix_users_phone_number", table_name="users")
    op.drop_column("users", "phone_number")
