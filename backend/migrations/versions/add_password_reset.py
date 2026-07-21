"""Add password reset token fields to user."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_password_reset'
down_revision = 'add_account_role'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reset_token', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('reset_token_expires', sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_reset_token'), ['reset_token'], unique=False)


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_reset_token'))
        batch_op.drop_column('reset_token_expires')
        batch_op.drop_column('reset_token')
