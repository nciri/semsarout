"""Add missing has_dedicated_account_manager column to subscription_plans

Revision ID: b7c3e9a1d582
Revises: a4d2f1b8e6c3
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'b7c3e9a1d582'
down_revision = 'a4d2f1b8e6c3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'subscription_plans',
        sa.Column('has_dedicated_account_manager', sa.Boolean(), nullable=True, server_default=sa.false())
    )


def downgrade():
    op.drop_column('subscription_plans', 'has_dedicated_account_manager')
