"""Add buyer features: saved searches, favorites, messages, estimates."""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_buyer_features'
down_revision = 'add_unit_images'
branch_labels = None
depends_on = None


def upgrade():
    # Create saved_searches table
    op.create_table('saved_searches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('criteria', sa.JSON(), nullable=True),
        sa.Column('notify_new_matches', sa.Boolean(), nullable=True),
        sa.Column('last_notified_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create favorites table
    op.create_table('favorites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('property_id', sa.Integer(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('rating', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['property_id'], ['properties.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create buyer_messages table
    op.create_table('buyer_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('buyer_id', sa.Integer(), nullable=False),
        sa.Column('property_id', sa.Integer(), nullable=False),
        sa.Column('subject', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('buyer_email', sa.String(length=120), nullable=True),
        sa.Column('buyer_phone', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['property_id'], ['properties.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create property_estimates table
    op.create_table('property_estimates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('property_id', sa.Integer(), nullable=False),
        sa.Column('estimated_price', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('estimated_reason', sa.Text(), nullable=True),
        sa.Column('market_analysis', sa.Text(), nullable=True),
        sa.Column('comparison_properties', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['property_id'], ['properties.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes
    op.create_index(op.f('ix_saved_searches_user_id'), 'saved_searches', ['user_id'], unique=False)
    op.create_index(op.f('ix_favorites_user_id'), 'favorites', ['user_id'], unique=False)
    op.create_index(op.f('ix_buyer_messages_buyer_id'), 'buyer_messages', ['buyer_id'], unique=False)
    op.create_index(op.f('ix_property_estimates_user_id'), 'property_estimates', ['user_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_property_estimates_user_id'), table_name='property_estimates')
    op.drop_index(op.f('ix_buyer_messages_buyer_id'), table_name='buyer_messages')
    op.drop_index(op.f('ix_favorites_user_id'), table_name='favorites')
    op.drop_index(op.f('ix_saved_searches_user_id'), table_name='saved_searches')

    op.drop_table('property_estimates')
    op.drop_table('buyer_messages')
    op.drop_table('favorites')
    op.drop_table('saved_searches')
