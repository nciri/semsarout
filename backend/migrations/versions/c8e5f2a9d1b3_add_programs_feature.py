"""Add programs feature

Revision ID: c8e5f2a9d1b3
Revises: 0bbb632ded0c
Create Date: 2026-01-21 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8e5f2a9d1b3'
down_revision = '0bbb632ded0c'
branch_labels = None
depends_on = None


def upgrade():
    # Create programs table
    op.create_table('programs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reference', sa.String(length=50), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('slug', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('program_type', sa.String(length=50), nullable=True),
        sa.Column('address', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('neighborhood', sa.String(length=100), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('total_units', sa.Integer(), nullable=True),
        sa.Column('available_units', sa.Integer(), nullable=True),
        sa.Column('min_price', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('max_price', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('delivery_date', sa.Date(), nullable=True),
        sa.Column('construction_status', sa.String(length=50), nullable=True),
        sa.Column('amenities', sa.JSON(), nullable=True),
        sa.Column('cover_image_url', sa.String(length=500), nullable=True),
        sa.Column('brochure_url', sa.String(length=500), nullable=True),
        sa.Column('video_url', sa.String(length=500), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('agency_id', sa.Integer(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('views_count', sa.Integer(), nullable=True),
        sa.Column('contacts_count', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('programs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_programs_city'), ['city'], unique=False)
        batch_op.create_index(batch_op.f('ix_programs_reference'), ['reference'], unique=True)
        batch_op.create_index(batch_op.f('ix_programs_slug'), ['slug'], unique=True)

    # Create program_units table
    op.create_table('program_units',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('program_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('unit_type', sa.String(length=50), nullable=True),
        sa.Column('surface_min', sa.Float(), nullable=True),
        sa.Column('surface_max', sa.Float(), nullable=True),
        sa.Column('rooms', sa.Integer(), nullable=True),
        sa.Column('bedrooms', sa.Integer(), nullable=True),
        sa.Column('bathrooms', sa.Integer(), nullable=True),
        sa.Column('price_from', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('price_to', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('total_count', sa.Integer(), nullable=True),
        sa.Column('available_count', sa.Integer(), nullable=True),
        sa.Column('features', sa.JSON(), nullable=True),
        sa.Column('floor_plan_url', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create program_images table
    op.create_table('program_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('program_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('caption', sa.String(length=255), nullable=True),
        sa.Column('image_type', sa.String(length=50), nullable=True),
        sa.Column('position', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Add has_programs and max_programs to subscription_plans
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('has_programs', sa.Boolean(), nullable=True, default=False))
        batch_op.add_column(sa.Column('max_programs', sa.Integer(), nullable=True, default=0))

    # Update Pro and Enterprise plans to enable programs
    op.execute("UPDATE subscription_plans SET has_programs = TRUE, max_programs = 10 WHERE slug = 'pro'")
    op.execute("UPDATE subscription_plans SET has_programs = TRUE, max_programs = -1 WHERE slug = 'enterprise'")


def downgrade():
    # Drop program tables
    op.drop_table('program_images')
    op.drop_table('program_units')

    with op.batch_alter_table('programs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_programs_slug'))
        batch_op.drop_index(batch_op.f('ix_programs_reference'))
        batch_op.drop_index(batch_op.f('ix_programs_city'))

    op.drop_table('programs')

    # Remove columns from subscription_plans
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.drop_column('max_programs')
        batch_op.drop_column('has_programs')
