"""Add urgent_until field to property table."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_urgent_until'
down_revision = 'd9f7e3b8c2a1'
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
