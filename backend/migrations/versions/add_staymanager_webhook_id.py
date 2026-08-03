"""Add staymanager_webhook_id to integrations, widen reservation currency column."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_sm_webhook_id'
down_revision = '337b809f18ad'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('staymanager_integrations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('staymanager_webhook_id', sa.String(length=100), nullable=True))

    with op.batch_alter_table('staymanager_reservations', schema=None) as batch_op:
        batch_op.alter_column('currency', type_=sa.String(length=10),
                               existing_type=sa.String(length=3))


def downgrade():
    with op.batch_alter_table('staymanager_reservations', schema=None) as batch_op:
        batch_op.alter_column('currency', type_=sa.String(length=3),
                               existing_type=sa.String(length=10))

    with op.batch_alter_table('staymanager_integrations', schema=None) as batch_op:
        batch_op.drop_column('staymanager_webhook_id')
