from datetime import datetime
from app import db


class Client(db.Model):
    """Client model for CRM - buyers, sellers, landlords, tenants, investors."""
    __tablename__ = 'clients'

    id = db.Column(db.Integer, primary_key=True)

    # Contact info
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(120), index=True)
    phone = db.Column(db.String(20))
    phone_secondary = db.Column(db.String(20))
    whatsapp = db.Column(db.String(20))

    # Address
    address = db.Column(db.String(255))
    city = db.Column(db.String(100))
    postal_code = db.Column(db.String(10))

    # Type: 'buyer', 'seller', 'landlord', 'tenant', 'investor'
    client_type = db.Column(db.String(20), nullable=False, default='buyer')

    # Status: 'active', 'inactive', 'archived'
    status = db.Column(db.String(20), default='active')

    # Source: 'website', 'phone', 'referral', 'portal', 'social', 'walk_in', 'other'
    source = db.Column(db.String(30), default='website')
    source_detail = db.Column(db.String(255))  # Which portal, which referral, etc.

    # Search criteria (for buyers/tenants)
    search_criteria = db.Column(db.JSON, default=dict)
    # Example: {
    #   'transaction_type': 'sale',
    #   'property_types': ['apartment', 'villa'],
    #   'cities': ['Casablanca', 'Rabat'],
    #   'min_price': 500000,
    #   'max_price': 1500000,
    #   'min_surface': 80,
    #   'min_rooms': 3,
    #   'features': ['parking', 'terrace']
    # }

    budget_min = db.Column(db.Numeric(12, 2))
    budget_max = db.Column(db.Numeric(12, 2))

    # Notes and follow-up
    notes = db.Column(db.Text)
    next_follow_up = db.Column(db.DateTime)

    # Rating (1-5 stars for lead quality)
    rating = db.Column(db.Integer, default=3)

    # Tags (JSON array)
    tags = db.Column(db.JSON, default=list)

    # Assignment
    assigned_to_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    assigned_to = db.relationship('User', foreign_keys=[assigned_to_id])

    # Agency
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)
    agency = db.relationship('Agency')

    # Converted from lead
    lead_id = db.Column(db.Integer, db.ForeignKey('leads.id'), nullable=True)

    # GDPR consent
    gdpr_consent = db.Column(db.Boolean, default=False)
    gdpr_consent_date = db.Column(db.DateTime)
    marketing_consent = db.Column(db.Boolean, default=False)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_contact_at = db.Column(db.DateTime)

    # Relationships
    interactions = db.relationship('ClientInteraction', back_populates='client',
                                   lazy='dynamic', cascade='all, delete-orphan')
    visits = db.relationship('Visit', back_populates='client', lazy='dynamic')
    transactions = db.relationship('Transaction', back_populates='client', lazy='dynamic',
                                   foreign_keys='Transaction.client_id')

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def to_dict(self, include_interactions=False):
        data = {
            'id': self.id,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'full_name': self.full_name,
            'email': self.email,
            'phone': self.phone,
            'whatsapp': self.whatsapp,
            'address': self.address,
            'city': self.city,
            'client_type': self.client_type,
            'status': self.status,
            'source': self.source,
            'search_criteria': self.search_criteria,
            'budget_min': float(self.budget_min) if self.budget_min else None,
            'budget_max': float(self.budget_max) if self.budget_max else None,
            'notes': self.notes,
            'next_follow_up': self.next_follow_up.isoformat() if self.next_follow_up else None,
            'rating': self.rating,
            'tags': self.tags or [],
            'assigned_to_id': self.assigned_to_id,
            'assigned_to_name': self.assigned_to.full_name if self.assigned_to else None,
            'agency_id': self.agency_id,
            'visits_count': self.visits.count(),
            'transactions_count': self.transactions.count(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_contact_at': self.last_contact_at.isoformat() if self.last_contact_at else None
        }
        if include_interactions:
            data['interactions'] = [i.to_dict() for i in self.interactions.limit(20)]
        return data

    def __repr__(self):
        return f'<Client {self.full_name}>'


class ClientInteraction(db.Model):
    """Interaction history with clients."""
    __tablename__ = 'client_interactions'

    id = db.Column(db.Integer, primary_key=True)

    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    client = db.relationship('Client', back_populates='interactions')

    # Type: 'call', 'email', 'sms', 'whatsapp', 'visit', 'meeting', 'note'
    interaction_type = db.Column(db.String(20), nullable=False)

    # Direction for calls/emails: 'inbound', 'outbound'
    direction = db.Column(db.String(20))

    subject = db.Column(db.String(255))
    content = db.Column(db.Text)

    # Duration for calls (in seconds)
    duration = db.Column(db.Integer)

    # Related property
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)

    # Who logged this
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_by = db.relationship('User')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'client_id': self.client_id,
            'interaction_type': self.interaction_type,
            'direction': self.direction,
            'subject': self.subject,
            'content': self.content,
            'duration': self.duration,
            'property_id': self.property_id,
            'created_by_id': self.created_by_id,
            'created_by_name': self.created_by.full_name if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<ClientInteraction {self.interaction_type}>'
