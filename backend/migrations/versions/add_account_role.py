"""Add account_role field to distinguish buyers and agents."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_account_role'
down_revision = 'add_buyer_features'
branch_labels = None
depends_on = None


def upgrade():
    # Add account_role column to users table
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('account_role', sa.String(length=20), nullable=True))

    # Set default value for existing users
    op.execute("UPDATE users SET account_role = 'buyer' WHERE account_role IS NULL")

    # Make column not nullable after setting default
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('account_role', nullable=False, existing_type=sa.String(length=20))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('account_role')
