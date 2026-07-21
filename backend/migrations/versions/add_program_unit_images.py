"""Add program unit images table and timestamps to program units."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_unit_images'
down_revision = 'add_urgent_until'
branch_labels = None
depends_on = None


def upgrade():
    # Add timestamps to program_units
    with op.batch_alter_table('program_units', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))

    # Create program_unit_images table
    op.create_table('program_unit_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('unit_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('caption', sa.String(length=255), nullable=True),
        sa.Column('image_type', sa.String(length=50), nullable=True),
        sa.Column('position', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['unit_id'], ['program_units.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('program_unit_images', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_program_unit_images_unit_id'), ['unit_id'], unique=False)


def downgrade():
    with op.batch_alter_table('program_unit_images', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_program_unit_images_unit_id'))
    op.drop_table('program_unit_images')

    with op.batch_alter_table('program_units', schema=None) as batch_op:
        batch_op.drop_column('updated_at')
        batch_op.drop_column('created_at')
