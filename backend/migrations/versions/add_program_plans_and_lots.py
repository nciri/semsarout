"""Add program plans and lots (interactive lot plan feature)."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_program_lots'
down_revision = 'add_sm_webhook_id'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'program_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('program_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('position', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_program_plans_program_id'), 'program_plans', ['program_id'], unique=False)

    op.create_table(
        'program_lots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('program_id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.Integer(), nullable=False),
        sa.Column('reference', sa.String(length=50), nullable=True),
        sa.Column('title', sa.String(length=150), nullable=True),
        sa.Column('lot_type', sa.String(length=30), nullable=True),
        sa.Column('surface', sa.Float(), nullable=True),
        sa.Column('rooms', sa.Integer(), nullable=True),
        sa.Column('bedrooms', sa.Integer(), nullable=True),
        sa.Column('bathrooms', sa.Integer(), nullable=True),
        sa.Column('floor', sa.Integer(), nullable=True),
        sa.Column('price', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('zone', sa.JSON(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['plan_id'], ['program_plans.id'], ),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_program_lots_program_id'), 'program_lots', ['program_id'], unique=False)
    op.create_index(op.f('ix_program_lots_plan_id'), 'program_lots', ['plan_id'], unique=False)
    op.create_index(op.f('ix_program_lots_status'), 'program_lots', ['status'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_program_lots_status'), table_name='program_lots')
    op.drop_index(op.f('ix_program_lots_plan_id'), table_name='program_lots')
    op.drop_index(op.f('ix_program_lots_program_id'), table_name='program_lots')
    op.drop_table('program_lots')
    op.drop_index(op.f('ix_program_plans_program_id'), table_name='program_plans')
    op.drop_table('program_plans')
