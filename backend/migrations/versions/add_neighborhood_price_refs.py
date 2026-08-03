"""Add neighborhood price references (price-position gauge)."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_nbhd_price_refs'
down_revision = 'add_program_lots'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'neighborhood_price_refs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('city', sa.String(length=100), nullable=False),
        sa.Column('neighborhood', sa.String(length=100), nullable=False),
        sa.Column('property_type', sa.String(length=20), nullable=True),
        sa.Column('transaction_type', sa.String(length=20), nullable=False),
        sa.Column('avg_price_sqm', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('min_price_sqm', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('max_price_sqm', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('source', sa.String(length=150), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_neighborhood_price_refs_city'), 'neighborhood_price_refs', ['city'], unique=False)
    op.create_index(op.f('ix_neighborhood_price_refs_neighborhood'), 'neighborhood_price_refs', ['neighborhood'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_neighborhood_price_refs_neighborhood'), table_name='neighborhood_price_refs')
    op.drop_index(op.f('ix_neighborhood_price_refs_city'), table_name='neighborhood_price_refs')
    op.drop_table('neighborhood_price_refs')
