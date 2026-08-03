"""Add account moderation fields to users and agencies."""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'b7c3e9a1d582'
branch_labels = None
depends_on = None

_COLS = [
    ('is_suspended', sa.Boolean(), {'nullable': False, 'server_default': sa.false()}),
    ('suspended_at', sa.DateTime(), {'nullable': True}),
    ('suspended_reason', sa.String(length=255), {'nullable': True}),
    ('deleted_at', sa.DateTime(), {'nullable': True}),
    ('anonymized_at', sa.DateTime(), {'nullable': True}),
]

def upgrade():
    for table in ('users', 'agencies'):
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name, type_, kw in _COLS:
                batch_op.add_column(sa.Column(name, type_, **kw))

def downgrade():
    for table in ('users', 'agencies'):
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name, _type, _kw in reversed(_COLS):
                batch_op.drop_column(name)
