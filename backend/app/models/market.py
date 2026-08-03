from datetime import datetime
from app import db


class NeighborhoodPriceRef(db.Model):
    """Manual reference price/m² for a neighborhood, used by the price-position
    gauge. Takes priority over the auto value computed from listings.

    `property_type = None` means the reference applies to all property types.
    """
    __tablename__ = 'neighborhood_price_refs'

    id = db.Column(db.Integer, primary_key=True)
    city = db.Column(db.String(100), nullable=False, index=True)
    neighborhood = db.Column(db.String(100), nullable=False, index=True)
    # None = applies to any property type
    property_type = db.Column(db.String(20), nullable=True)
    # 'sale' | 'rent'
    transaction_type = db.Column(db.String(20), nullable=False)

    avg_price_sqm = db.Column(db.Numeric(12, 2), nullable=False)
    min_price_sqm = db.Column(db.Numeric(12, 2))
    max_price_sqm = db.Column(db.Numeric(12, 2))

    source = db.Column(db.String(150), default='manuel')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'city': self.city,
            'neighborhood': self.neighborhood,
            'property_type': self.property_type,
            'transaction_type': self.transaction_type,
            'avg_price_sqm': float(self.avg_price_sqm) if self.avg_price_sqm is not None else None,
            'min_price_sqm': float(self.min_price_sqm) if self.min_price_sqm is not None else None,
            'max_price_sqm': float(self.max_price_sqm) if self.max_price_sqm is not None else None,
            'source': self.source,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<NeighborhoodPriceRef {self.city}/{self.neighborhood} {self.transaction_type}>'
