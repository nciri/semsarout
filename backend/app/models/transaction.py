from datetime import datetime
from app import db


class Transaction(db.Model):
    """Transaction/Deal model for sales and rental pipeline."""
    __tablename__ = 'transactions'

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(30), unique=True, nullable=False, index=True)

    # Related entities
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=False)
    related_property = db.relationship('Property')

    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    client = db.relationship('Client', back_populates='transactions', foreign_keys=[client_id])

    # Seller/Landlord (owner of the property)
    seller_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=True)
    seller = db.relationship('Client', foreign_keys=[seller_id])

    # Assigned agent
    agent_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    agent = db.relationship('User', foreign_keys=[agent_id])

    # Type: 'sale', 'rent', 'vacation_rental'
    transaction_type = db.Column(db.String(20), nullable=False)

    # Pipeline stage
    # Sale: 'contact', 'visit', 'offer', 'negotiation', 'compromise', 'final_act'
    # Rent: 'contact', 'visit', 'application', 'verification', 'lease', 'move_in'
    stage = db.Column(db.String(30), default='contact')
    stage_order = db.Column(db.Integer, default=0)  # For drag-drop ordering

    # Pricing
    asking_price = db.Column(db.Numeric(12, 2))
    offer_price = db.Column(db.Numeric(12, 2))
    final_price = db.Column(db.Numeric(12, 2))

    # Commission
    commission_rate = db.Column(db.Numeric(5, 2))  # Percentage
    commission_amount = db.Column(db.Numeric(12, 2))
    commission_split = db.Column(db.JSON)  # Split between agents

    # Status: 'active', 'won', 'lost', 'on_hold'
    status = db.Column(db.String(20), default='active')
    lost_reason = db.Column(db.String(255))

    # Key dates
    contact_date = db.Column(db.DateTime, default=datetime.utcnow)
    visit_date = db.Column(db.DateTime)
    offer_date = db.Column(db.DateTime)
    acceptance_date = db.Column(db.DateTime)
    compromise_date = db.Column(db.DateTime)
    closing_date = db.Column(db.DateTime)
    expected_closing_date = db.Column(db.DateTime)

    # Notes
    notes = db.Column(db.Text)

    # Probability of closing (0-100)
    probability = db.Column(db.Integer, default=50)

    # Priority: 'low', 'medium', 'high', 'urgent'
    priority = db.Column(db.String(20), default='medium')

    # Agency
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = db.Column(db.DateTime)

    # Relationships
    offers = db.relationship('Offer', back_populates='transaction', lazy='dynamic',
                            cascade='all, delete-orphan')
    documents = db.relationship('TransactionDocument', back_populates='transaction',
                               lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self, include_property=False, include_client=False, include_offers=False):
        data = {
            'id': self.id,
            'reference': self.reference,
            'property_id': self.property_id,
            'property_title': self.related_property.title if self.related_property else None,
            'property_city': self.related_property.city if self.related_property else None,
            'client_id': self.client_id,
            'client_name': self.client.full_name if self.client else None,
            'seller_id': self.seller_id,
            'seller_name': self.seller.full_name if self.seller else None,
            'agent_id': self.agent_id,
            'agent_name': self.agent.full_name if self.agent else None,
            'transaction_type': self.transaction_type,
            'stage': self.stage,
            'stage_order': self.stage_order,
            'asking_price': float(self.asking_price) if self.asking_price else None,
            'offer_price': float(self.offer_price) if self.offer_price else None,
            'final_price': float(self.final_price) if self.final_price else None,
            'commission_rate': float(self.commission_rate) if self.commission_rate else None,
            'commission_amount': float(self.commission_amount) if self.commission_amount else None,
            'status': self.status,
            'lost_reason': self.lost_reason,
            'contact_date': self.contact_date.isoformat() if self.contact_date else None,
            'expected_closing_date': self.expected_closing_date.isoformat() if self.expected_closing_date else None,
            'closing_date': self.closing_date.isoformat() if self.closing_date else None,
            'probability': self.probability,
            'priority': self.priority,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_property and self.related_property:
            data['property'] = self.related_property.to_dict(include_images=True)
        if include_client and self.client:
            data['client'] = self.client.to_dict()
        if include_offers:
            data['offers'] = [o.to_dict() for o in self.offers]
        return data

    def __repr__(self):
        return f'<Transaction {self.reference}>'


class Offer(db.Model):
    """Offer model for tracking offers and counter-offers."""
    __tablename__ = 'offers'

    id = db.Column(db.Integer, primary_key=True)

    transaction_id = db.Column(db.Integer, db.ForeignKey('transactions.id'), nullable=False)
    transaction = db.relationship('Transaction', back_populates='offers')

    # Offer details
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    conditions = db.Column(db.Text)  # Payment conditions, contingencies, etc.

    # Type: 'initial', 'counter', 'final'
    offer_type = db.Column(db.String(20), default='initial')

    # From: 'buyer', 'seller'
    from_party = db.Column(db.String(20), nullable=False)

    # Status: 'pending', 'accepted', 'rejected', 'expired', 'withdrawn'
    status = db.Column(db.String(20), default='pending')

    # Expiry
    expires_at = db.Column(db.DateTime)

    # Response
    response_notes = db.Column(db.Text)
    responded_at = db.Column(db.DateTime)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_by = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'transaction_id': self.transaction_id,
            'amount': float(self.amount) if self.amount else None,
            'conditions': self.conditions,
            'offer_type': self.offer_type,
            'from_party': self.from_party,
            'status': self.status,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'response_notes': self.response_notes,
            'responded_at': self.responded_at.isoformat() if self.responded_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by_name': self.created_by.full_name if self.created_by else None
        }

    def __repr__(self):
        return f'<Offer {self.id} - {self.amount}>'


class TransactionDocument(db.Model):
    """Documents related to transactions."""
    __tablename__ = 'transaction_documents'

    id = db.Column(db.Integer, primary_key=True)

    transaction_id = db.Column(db.Integer, db.ForeignKey('transactions.id'), nullable=False)
    transaction = db.relationship('Transaction', back_populates='documents')

    # Document type: 'mandate', 'visit_report', 'offer', 'compromise', 'lease', 'invoice', 'other'
    document_type = db.Column(db.String(30), nullable=False)

    name = db.Column(db.String(255), nullable=False)
    file_url = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer)  # In bytes
    mime_type = db.Column(db.String(100))

    # Signature status (for e-signature integration)
    requires_signature = db.Column(db.Boolean, default=False)
    signature_status = db.Column(db.String(20))  # 'pending', 'signed', 'rejected'
    signed_at = db.Column(db.DateTime)
    signature_url = db.Column(db.String(255))

    # Uploaded by
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    uploaded_by = db.relationship('User')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'transaction_id': self.transaction_id,
            'document_type': self.document_type,
            'name': self.name,
            'file_url': self.file_url,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'requires_signature': self.requires_signature,
            'signature_status': self.signature_status,
            'signed_at': self.signed_at.isoformat() if self.signed_at else None,
            'uploaded_by_name': self.uploaded_by.full_name if self.uploaded_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<TransactionDocument {self.name}>'


# Pipeline stages configuration
SALE_STAGES = [
    {'id': 'contact', 'name': 'Contact initial', 'order': 0, 'color': 'gray'},
    {'id': 'visit', 'name': 'Visite', 'order': 1, 'color': 'blue'},
    {'id': 'offer', 'name': 'Offre', 'order': 2, 'color': 'yellow'},
    {'id': 'negotiation', 'name': 'Négociation', 'order': 3, 'color': 'orange'},
    {'id': 'compromise', 'name': 'Compromis', 'order': 4, 'color': 'purple'},
    {'id': 'final_act', 'name': 'Acte final', 'order': 5, 'color': 'green'}
]

RENT_STAGES = [
    {'id': 'contact', 'name': 'Contact initial', 'order': 0, 'color': 'gray'},
    {'id': 'visit', 'name': 'Visite', 'order': 1, 'color': 'blue'},
    {'id': 'application', 'name': 'Candidature', 'order': 2, 'color': 'yellow'},
    {'id': 'verification', 'name': 'Vérification', 'order': 3, 'color': 'orange'},
    {'id': 'lease', 'name': 'Bail', 'order': 4, 'color': 'purple'},
    {'id': 'move_in', 'name': 'Entrée', 'order': 5, 'color': 'green'}
]
