"""merge heads

Revision ID: 337b809f18ad
Revises: add_password_reset, f3b9d6a2c7e1
Create Date: 2026-07-18 00:41:21.485178

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '337b809f18ad'
down_revision = ('add_password_reset', 'f3b9d6a2c7e1')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
