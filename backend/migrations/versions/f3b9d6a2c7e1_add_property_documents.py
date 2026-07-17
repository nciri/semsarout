"""Add property_documents table for online sale dossiers

Revision ID: f3b9d6a2c7e1
Revises: e7a1c4f8b2d5
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'f3b9d6a2c7e1'
down_revision = 'e7a1c4f8b2d5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'property_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('property_id', sa.Integer(), nullable=False),
        sa.Column('doc_type', sa.String(length=30), nullable=False),
        sa.Column('file_url', sa.String(length=255), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['property_id'], ['properties.id']),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('property_documents')
