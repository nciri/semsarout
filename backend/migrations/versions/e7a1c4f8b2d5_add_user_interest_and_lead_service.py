"""Add users.interest and leads.service for the service journey

Revision ID: e7a1c4f8b2d5
Revises: d9f7e3b8c2a1
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'e7a1c4f8b2d5'
down_revision = 'd9f7e3b8c2a1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('interest', sa.String(length=30), nullable=True))
    op.add_column('leads', sa.Column('service', sa.String(length=30), nullable=True))


def downgrade():
    op.drop_column('leads', 'service')
    op.drop_column('users', 'interest')
