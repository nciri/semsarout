"""Add marketplace: products, carts, cart_items, orders, order_items."""
from alembic import op
import sqlalchemy as sa

revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('products',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('category', sa.String(length=40), nullable=False),
        sa.Column('group', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('stock', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_products_category', 'products', ['category'])

    op.create_table('carts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('user_id', name='uq_carts_user_id'),
    )

    op.create_table('cart_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('cart_id', sa.Integer(), sa.ForeignKey('carts.id'), nullable=False),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=True, server_default='1'),
    )
    op.create_index('ix_cart_items_cart_id', 'cart_items', ['cart_id'])

    op.create_table('orders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('reference', sa.String(length=20), nullable=False),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('buyer_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True),
        sa.Column('delivery_address', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='pending'),
        sa.Column('subtotal', sa.Numeric(precision=12, scale=2), nullable=True, server_default='0'),
        sa.Column('total', sa.Numeric(precision=12, scale=2), nullable=True, server_default='0'),
        sa.Column('payment_reference', sa.String(length=50), nullable=True),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('reference', name='uq_orders_reference'),
    )
    op.create_index('ix_orders_agency_id', 'orders', ['agency_id'])
    op.create_index('ix_orders_reference', 'orders', ['reference'])

    op.create_table('order_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=True),
        sa.Column('product_name', sa.String(length=200), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('line_total', sa.Numeric(precision=12, scale=2), nullable=False),
    )
    op.create_index('ix_order_items_order_id', 'order_items', ['order_id'])


def downgrade():
    op.drop_index('ix_order_items_order_id', table_name='order_items')
    op.drop_table('order_items')

    op.drop_index('ix_orders_reference', table_name='orders')
    op.drop_index('ix_orders_agency_id', table_name='orders')
    op.drop_table('orders')

    op.drop_index('ix_cart_items_cart_id', table_name='cart_items')
    op.drop_table('cart_items')

    op.drop_table('carts')

    op.drop_index('ix_products_category', table_name='products')
    op.drop_table('products')
