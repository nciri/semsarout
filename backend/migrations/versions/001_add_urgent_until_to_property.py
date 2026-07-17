"""Add urgent_until field to property table."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '41ed06962b17'
branch_labels = None
depends_on = None


def upgrade():
    # Add urgent_until column to properties table
    with op.batch_alter_table('properties', schema=None) as batch_op:
        batch_op.add_column(sa.Column('urgent_until', sa.DateTime(), nullable=True))


def downgrade():
    # Remove urgent_until column from properties table
    with op.batch_alter_table('properties', schema=None) as batch_op:
        batch_op.drop_column('urgent_until')
