from datetime import datetime
from app import db


class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(40), nullable=False, index=True)
    group = db.Column(db.String(20), nullable=False)  # furniture|appliance
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    stock = db.Column(db.Integer, default=0)
    image_url = db.Column(db.String(500))
    is_active = db.Column(db.Boolean, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'category': self.category, 'group': self.group, 'name': self.name,
                'description': self.description, 'price': float(self.price or 0), 'stock': self.stock,
                'image_url': self.image_url, 'is_active': self.is_active,
                'created_at': self.created_at.isoformat() if self.created_at else None}


class Cart(db.Model):
    __tablename__ = 'carts'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class CartItem(db.Model):
    __tablename__ = 'cart_items'
    id = db.Column(db.Integer, primary_key=True)
    cart_id = db.Column(db.Integer, db.ForeignKey('carts.id'), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, default=1)

    def to_dict(self):
        p = Product.query.get(self.product_id)
        unit = float(p.price) if p else 0.0
        return {'id': self.id, 'product_id': self.product_id, 'quantity': self.quantity,
                'product': ({'id': p.id, 'name': p.name, 'price': unit, 'image_url': p.image_url,
                             'stock': p.stock, 'is_active': p.is_active} if p else None),
                'line_total': round(unit * self.quantity, 2)}


class Order(db.Model):
    __tablename__ = 'orders'
    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(20), unique=True, nullable=False, index=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)
    delivery_address = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')
    subtotal = db.Column(db.Numeric(12, 2), default=0)
    total = db.Column(db.Numeric(12, 2), default=0)
    payment_reference = db.Column(db.String(50), nullable=True)
    paid_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_items=False):
        items = OrderItem.query.filter_by(order_id=self.id).all()
        d = {'id': self.id, 'reference': self.reference, 'agency_id': self.agency_id,
             'buyer_id': self.buyer_id, 'property_id': self.property_id,
             'delivery_address': self.delivery_address, 'status': self.status,
             'subtotal': float(self.subtotal or 0), 'total': float(self.total or 0),
             'payment_reference': self.payment_reference,
             'paid_at': self.paid_at.isoformat() if self.paid_at else None,
             'items_count': len(items),
             'created_at': self.created_at.isoformat() if self.created_at else None}
        if include_items:
            d['items'] = [i.to_dict() for i in items]
        return d


class OrderItem(db.Model):
    __tablename__ = 'order_items'
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    product_name = db.Column(db.String(200), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    line_total = db.Column(db.Numeric(12, 2), nullable=False)

    def to_dict(self):
        return {'id': self.id, 'product_id': self.product_id, 'product_name': self.product_name,
                'unit_price': float(self.unit_price or 0), 'quantity': self.quantity,
                'line_total': float(self.line_total or 0)}
