from datetime import datetime
from app import db


class SavedSearch(db.Model):
    """Saved property searches for buyers."""
    __tablename__ = 'saved_searches'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)

    # Search criteria (stored as JSON)
    criteria = db.Column(db.JSON)  # {city, min_price, max_price, property_type, etc}

    # Notification settings
    notify_new_matches = db.Column(db.Boolean, default=True)
    last_notified_at = db.Column(db.DateTime)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref='saved_searches')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'description': self.description,
            'criteria': self.criteria,
            'notify_new_matches': self.notify_new_matches,
            'last_notified_at': self.last_notified_at.isoformat() if self.last_notified_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<SavedSearch {self.name}>'


class Favorite(db.Model):
    """Favorite properties for buyers."""
    __tablename__ = 'favorites'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=False)

    notes = db.Column(db.Text)
    rating = db.Column(db.Integer)  # 1-5 star rating

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref='favorites')
    property = db.relationship('Property', backref='favorited_by')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'property_id': self.property_id,
            'notes': self.notes,
            'rating': self.rating,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Favorite {self.property_id}>'


class BuyerMessage(db.Model):
    """Messages from buyers to sellers/agents."""
    __tablename__ = 'buyer_messages'

    id = db.Column(db.Integer, primary_key=True)
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=False)

    # Message content
    subject = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)

    # Contact info
    buyer_email = db.Column(db.String(120))
    buyer_phone = db.Column(db.String(20))

    # Status: new, read, replied, archived
    status = db.Column(db.String(20), default='new')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    read_at = db.Column(db.DateTime)

    # Relationships
    buyer = db.relationship('User', foreign_keys=[buyer_id], backref='sent_messages')
    property = db.relationship('Property', backref='buyer_messages')

    def to_dict(self):
        return {
            'id': self.id,
            'buyer_id': self.buyer_id,
            'property_id': self.property_id,
            'subject': self.subject,
            'message': self.message,
            'buyer_email': self.buyer_email,
            'buyer_phone': self.buyer_phone,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'read_at': self.read_at.isoformat() if self.read_at else None
        }

    def __repr__(self):
        return f'<BuyerMessage {self.id}>'


class PropertyEstimate(db.Model):
    """Property value estimates from buyers."""
    __tablename__ = 'property_estimates'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=False)

    # Estimate details
    estimated_price = db.Column(db.Numeric(12, 2), nullable=False)
    estimated_reason = db.Column(db.Text)  # Why they think this price

    # Market conditions
    market_analysis = db.Column(db.Text)
    comparison_properties = db.Column(db.JSON)  # Similar properties for comparison

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref='estimates')
    property = db.relationship('Property', backref='estimates')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'property_id': self.property_id,
            'estimated_price': float(self.estimated_price) if self.estimated_price else None,
            'estimated_reason': self.estimated_reason,
            'market_analysis': self.market_analysis,
            'comparison_properties': self.comparison_properties,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<PropertyEstimate {self.property_id}>'
