from datetime import datetime
from app import db


class Lead(db.Model):
    """Lead model for contact requests and prospects."""
    __tablename__ = 'leads'

    id = db.Column(db.Integer, primary_key=True)

    # Contact info
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20))
    message = db.Column(db.Text)
    notes = db.Column(db.Text)

    # Source: 'contact_form', 'phone_reveal', 'callback_request', 'website', 'manual'
    source = db.Column(db.String(30), default='contact_form')

    # Status: 'new', 'contacted', 'qualified', 'converted', 'lost'
    status = db.Column(db.String(20), default='new')
    lost_reason = db.Column(db.String(255))

    # Related property (if applicable)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)
    property = db.relationship('Property')

    # Agency that receives the lead
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)
    agency = db.relationship('Agency', back_populates='leads')

    # For individual owners (no agency)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    owner = db.relationship('User', foreign_keys=[owner_id])

    # Assigned agent
    assigned_to_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    assigned_to = db.relationship('User', foreign_keys=[assigned_to_id])

    # Billing (if lead is charged)
    is_charged = db.Column(db.Boolean, default=False)
    charge_amount = db.Column(db.Numeric(10, 2))

    # Tracking
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.String(255))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    contacted_at = db.Column(db.DateTime)
    qualified_at = db.Column(db.DateTime)
    converted_at = db.Column(db.DateTime)
    lost_at = db.Column(db.DateTime)

    def to_dict(self):
        """Serialize lead to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'message': self.message,
            'notes': self.notes,
            'source': self.source,
            'status': self.status,
            'lost_reason': self.lost_reason,
            'property_id': self.property_id,
            'property_title': self.property.title if self.property else None,
            'agency_id': self.agency_id,
            'assigned_to_id': self.assigned_to_id,
            'assigned_to_name': self.assigned_to.full_name if self.assigned_to else None,
            'is_charged': self.is_charged,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'contacted_at': self.contacted_at.isoformat() if self.contacted_at else None,
            'qualified_at': self.qualified_at.isoformat() if self.qualified_at else None,
            'converted_at': self.converted_at.isoformat() if self.converted_at else None
        }

    def __repr__(self):
        return f'<Lead {self.id}>'
