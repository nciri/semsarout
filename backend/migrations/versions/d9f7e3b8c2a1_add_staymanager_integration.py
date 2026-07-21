"""Add StayManager integration tables

Revision ID: d9f7e3b8c2a1
Revises: c8e5f2a9d1b3
Create Date: 2026-01-21 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd9f7e3b8c2a1'
down_revision = 'c8e5f2a9d1b3'
branch_labels = None
depends_on = None


def upgrade():
    # Create staymanager_integrations table
    op.create_table('staymanager_integrations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('agency_id', sa.Integer(), nullable=False),
        sa.Column('staymanager_user_id', sa.String(length=100), nullable=True),
        sa.Column('staymanager_email', sa.String(length=255), nullable=True),
        sa.Column('api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(), nullable=True),
        sa.Column('sync_error', sa.Text(), nullable=True),
        sa.Column('auto_sync_enabled', sa.Boolean(), nullable=True),
        sa.Column('sync_frequency_hours', sa.Integer(), nullable=True),
        sa.Column('webhook_secret', sa.String(length=100), nullable=True),
        sa.Column('webhook_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('agency_id')
    )

    # Create staymanager_property_links table
    op.create_table('staymanager_property_links',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('integration_id', sa.Integer(), nullable=False),
        sa.Column('property_id', sa.Integer(), nullable=False),
        sa.Column('staymanager_property_id', sa.String(length=100), nullable=False),
        sa.Column('staymanager_property_name', sa.String(length=255), nullable=True),
        sa.Column('sync_reservations', sa.Boolean(), nullable=True),
        sa.Column('sync_availability', sa.Boolean(), nullable=True),
        sa.Column('sync_guests', sa.Boolean(), nullable=True),
        sa.Column('last_reservation_sync', sa.DateTime(), nullable=True),
        sa.Column('last_availability_sync', sa.DateTime(), nullable=True),
        sa.Column('sync_status', sa.String(length=20), nullable=True),
        sa.Column('sync_error', sa.Text(), nullable=True),
        sa.Column('ical_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['integration_id'], ['staymanager_integrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['property_id'], ['properties.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create staymanager_reservations table
    op.create_table('staymanager_reservations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('property_link_id', sa.Integer(), nullable=False),
        sa.Column('staymanager_reservation_id', sa.String(length=100), nullable=False),
        sa.Column('external_id', sa.String(length=100), nullable=True),
        sa.Column('platform', sa.String(length=50), nullable=True),
        sa.Column('check_in', sa.DateTime(), nullable=False),
        sa.Column('check_out', sa.DateTime(), nullable=False),
        sa.Column('nights', sa.Integer(), nullable=True),
        sa.Column('guest_name', sa.String(length=255), nullable=True),
        sa.Column('guest_phone', sa.String(length=50), nullable=True),
        sa.Column('guest_email', sa.String(length=255), nullable=True),
        sa.Column('guest_count', sa.Integer(), nullable=True),
        sa.Column('staymanager_guest_id', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('guest_verified', sa.Boolean(), nullable=True),
        sa.Column('verification_status', sa.String(length=20), nullable=True),
        sa.Column('has_access_code', sa.Boolean(), nullable=True),
        sa.Column('access_code_masked', sa.String(length=20), nullable=True),
        sa.Column('contract_status', sa.String(length=20), nullable=True),
        sa.Column('total_price', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('guest_notes', sa.Text(), nullable=True),
        sa.Column('special_requests', sa.Text(), nullable=True),
        sa.Column('raw_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('synced_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['property_link_id'], ['staymanager_property_links.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('staymanager_reservations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_staymanager_reservations_check_in'), ['check_in'], unique=False)
        batch_op.create_index(batch_op.f('ix_staymanager_reservations_check_out'), ['check_out'], unique=False)
        batch_op.create_index(batch_op.f('ix_staymanager_reservations_staymanager_reservation_id'), ['staymanager_reservation_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_staymanager_reservations_status'), ['status'], unique=False)

    # Create staymanager_sync_logs table
    op.create_table('staymanager_sync_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('integration_id', sa.Integer(), nullable=False),
        sa.Column('property_link_id', sa.Integer(), nullable=True),
        sa.Column('sync_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('items_synced', sa.Integer(), nullable=True),
        sa.Column('items_created', sa.Integer(), nullable=True),
        sa.Column('items_updated', sa.Integer(), nullable=True),
        sa.Column('items_deleted', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_details', sa.JSON(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('trigger', sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(['integration_id'], ['staymanager_integrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['property_link_id'], ['staymanager_property_links.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    # Drop tables in reverse order
    op.drop_table('staymanager_sync_logs')

    with op.batch_alter_table('staymanager_reservations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_staymanager_reservations_status'))
        batch_op.drop_index(batch_op.f('ix_staymanager_reservations_staymanager_reservation_id'))
        batch_op.drop_index(batch_op.f('ix_staymanager_reservations_check_out'))
        batch_op.drop_index(batch_op.f('ix_staymanager_reservations_check_in'))

    op.drop_table('staymanager_reservations')
    op.drop_table('staymanager_property_links')
    op.drop_table('staymanager_integrations')
