"""Add message replies (bidirectional messaging) and agent availability (visit booking)."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_buyer_exp_upgrades'
down_revision = 'add_sm_webhook_id'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('message_replies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('buyer_message_id', sa.Integer(), nullable=False),
        sa.Column('sender_role', sa.String(length=10), nullable=False),
        sa.Column('sender_user_id', sa.Integer(), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['buyer_message_id'], ['buyer_messages.id'], ),
        sa.ForeignKeyConstraint(['sender_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_message_replies_buyer_message_id'), 'message_replies', ['buyer_message_id'], unique=False)

    op.create_table('agent_availabilities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('agent_id', sa.Integer(), nullable=False),
        sa.Column('weekday', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('slot_minutes', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agent_availabilities_agent_id'), 'agent_availabilities', ['agent_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_agent_availabilities_agent_id'), table_name='agent_availabilities')
    op.drop_table('agent_availabilities')
    op.drop_index(op.f('ix_message_replies_buyer_message_id'), table_name='message_replies')
    op.drop_table('message_replies')
