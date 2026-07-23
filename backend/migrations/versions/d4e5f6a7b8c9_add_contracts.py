"""Add contracts + contract_templates + has_contracts plan flag."""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.add_column(sa.Column('has_contracts', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.create_table('contract_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=True),
        sa.Column('document_type', sa.String(length=30), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('body_html', sa.Text(), nullable=False),
        sa.Column('is_builtin', sa.Boolean(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_contract_templates_agency_id', 'contract_templates', ['agency_id'])
    op.create_table('contracts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('document_type', sa.String(length=30), nullable=False),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('contract_templates.id'), nullable=True),
        sa.Column('transaction_id', sa.Integer(), sa.ForeignKey('transactions.id'), nullable=True),
        sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id'), nullable=True),
        sa.Column('body_html', sa.Text(), nullable=False),
        sa.Column('merge_context', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('pdf_url', sa.String(length=255), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('finalized_at', sa.DateTime(), nullable=True),
        sa.Column('signed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_contracts_agency_id', 'contracts', ['agency_id'])

def downgrade():
    op.drop_index('ix_contracts_agency_id', table_name='contracts')
    op.drop_table('contracts')
    op.drop_index('ix_contract_templates_agency_id', table_name='contract_templates')
    op.drop_table('contract_templates')
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.drop_column('has_contracts')
