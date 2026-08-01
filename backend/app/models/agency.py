from datetime import datetime
from app import db


class Agency(db.Model):
    """Agency model for real estate agencies."""
    __tablename__ = 'agencies'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False, index=True)
    description = db.Column(db.Text)

    # Contact info
    email = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20))
    website = db.Column(db.String(255))

    # Address
    address = db.Column(db.String(255))
    city = db.Column(db.String(100))
    postal_code = db.Column(db.String(10))

    # Branding
    logo_url = db.Column(db.String(255))
    cover_image_url = db.Column(db.String(255))

    # Business info
    license_number = db.Column(db.String(50))
    rc_number = db.Column(db.String(50))  # Registre de commerce
    ice_number = db.Column(db.String(50))  # ICE marocain

    # Integration
    staymanager_id = db.Column(db.String(100))  # Liaison StayManager
    api_key = db.Column(db.String(100), unique=True)  # For API access

    # Status
    is_verified = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Platform moderation (super-admin)
    is_suspended = db.Column(db.Boolean, default=False, nullable=False)
    suspended_at = db.Column(db.DateTime, nullable=True)
    suspended_reason = db.Column(db.String(255), nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    anonymized_at = db.Column(db.DateTime, nullable=True)

    # Teams & seats
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Relationships
    members = db.relationship('User', back_populates='agency', lazy='dynamic',
                               foreign_keys='User.agency_id')
    properties = db.relationship('Property', back_populates='agency', lazy='dynamic')
    subscription = db.relationship('Subscription', back_populates='agency', uselist=False)
    leads = db.relationship('Lead', back_populates='agency', lazy='dynamic')

    def to_dict(self, include_members=False):
        """Serialize agency to dictionary."""
        data = {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'description': self.description,
            'email': self.email,
            'phone': self.phone,
            'website': self.website,
            'address': self.address,
            'city': self.city,
            'postal_code': self.postal_code,
            'logo_url': self.logo_url,
            'cover_image_url': self.cover_image_url,
            'is_verified': self.is_verified,
            'properties_count': self.properties.count(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_suspended': bool(self.is_suspended),
            'suspended_reason': self.suspended_reason,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'anonymized_at': self.anonymized_at.isoformat() if self.anonymized_at else None,
        }
        if include_members:
            data['members'] = [m.to_dict() for m in self.members]
        return data

    def moderation_state(self):
        """Return 'deleted' | 'suspended' | 'active'."""
        if self.deleted_at is not None:
            return 'deleted'
        if self.is_suspended:
            return 'suspended'
        return 'active'

    def __repr__(self):
        return f'<Agency {self.name}>'
