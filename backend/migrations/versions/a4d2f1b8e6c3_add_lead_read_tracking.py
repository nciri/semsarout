"""Add read tracking to leads (is_read, read_at)

Revision ID: a4d2f1b8e6c3
Revises: add_nbhd_price_refs
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'a4d2f1b8e6c3'
down_revision = 'add_nbhd_price_refs'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('leads', sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('leads', sa.Column('read_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('leads', 'read_at')
    op.drop_column('leads', 'is_read')
