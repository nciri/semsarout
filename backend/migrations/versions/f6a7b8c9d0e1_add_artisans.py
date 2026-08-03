"""Add artisans, work_orders + has_artisans plan flag."""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.add_column(sa.Column('has_artisans', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.create_table('artisans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=True),
        sa.Column('trade', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('company', sa.String(length=150), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=30), nullable=True),
        sa.Column('email', sa.String(length=120), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_artisans_agency_id', 'artisans', ['agency_id'])
    op.create_index('ix_artisans_trade', 'artisans', ['trade'])
    op.create_table('work_orders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('artisan_id', sa.Integer(), sa.ForeignKey('artisans.id'), nullable=True),
        sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('trade', sa.String(length=40), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('cost_estimate', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('cost_final', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('scheduled_date', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_work_orders_agency_id', 'work_orders', ['agency_id'])

def downgrade():
    op.drop_index('ix_work_orders_agency_id', table_name='work_orders')
    op.drop_table('work_orders')
    op.drop_index('ix_artisans_trade', table_name='artisans')
    op.drop_index('ix_artisans_agency_id', table_name='artisans')
    op.drop_table('artisans')
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.drop_column('has_artisans')
