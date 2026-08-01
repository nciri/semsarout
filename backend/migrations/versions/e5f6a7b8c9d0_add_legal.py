"""Add notaries, legal_cases, legal_tasks + has_legal plan flag."""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.add_column(sa.Column('has_legal', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.create_table('notaries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('office', sa.String(length=200), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=30), nullable=True),
        sa.Column('email', sa.String(length=120), nullable=True),
        sa.Column('license_number', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_notaries_agency_id', 'notaries', ['agency_id'])
    op.create_table('legal_cases',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('transaction_id', sa.Integer(), sa.ForeignKey('transactions.id'), nullable=True),
        sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True),
        sa.Column('notary_id', sa.Integer(), sa.ForeignKey('notaries.id'), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('case_type', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_legal_cases_agency_id', 'legal_cases', ['agency_id'])
    op.create_table('legal_tasks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('legal_case_id', sa.Integer(), sa.ForeignKey('legal_cases.id'), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('assignee_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('position', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_legal_tasks_legal_case_id', 'legal_tasks', ['legal_case_id'])

def downgrade():
    op.drop_index('ix_legal_tasks_legal_case_id', table_name='legal_tasks')
    op.drop_table('legal_tasks')
    op.drop_index('ix_legal_cases_agency_id', table_name='legal_cases')
    op.drop_table('legal_cases')
    op.drop_index('ix_notaries_agency_id', table_name='notaries')
    op.drop_table('notaries')
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.drop_column('has_legal')
