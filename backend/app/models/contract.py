from datetime import datetime
from app import db


class ContractTemplate(db.Model):
    __tablename__ = 'contract_templates'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True, index=True)
    document_type = db.Column(db.String(30), nullable=False)  # mandate_sale|mandate_rental|compromise|lease|other
    name = db.Column(db.String(150), nullable=False)
    body_html = db.Column(db.Text, nullable=False)
    is_builtin = db.Column(db.Boolean, default=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_body=True):
        d = {
            'id': self.id, 'agency_id': self.agency_id, 'document_type': self.document_type,
            'name': self.name, 'is_builtin': self.is_builtin, 'is_global': self.agency_id is None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_body:
            d['body_html'] = self.body_html
        return d

    def __repr__(self):
        return f'<ContractTemplate {self.name}>'


class Contract(db.Model):
    __tablename__ = 'contracts'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    document_type = db.Column(db.String(30), nullable=False)
    template_id = db.Column(db.Integer, db.ForeignKey('contract_templates.id'), nullable=True)
    transaction_id = db.Column(db.Integer, db.ForeignKey('transactions.id'), nullable=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=True)
    body_html = db.Column(db.Text, nullable=False)
    merge_context = db.Column(db.JSON)
    status = db.Column(db.String(20), default='draft')  # draft|finalized|signed
    pdf_url = db.Column(db.String(255), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    finalized_at = db.Column(db.DateTime)
    signed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_body=True):
        d = {
            'id': self.id, 'agency_id': self.agency_id, 'title': self.title,
            'document_type': self.document_type, 'template_id': self.template_id,
            'transaction_id': self.transaction_id, 'property_id': self.property_id,
            'client_id': self.client_id, 'status': self.status, 'pdf_url': self.pdf_url,
            'finalized_at': self.finalized_at.isoformat() if self.finalized_at else None,
            'signed_at': self.signed_at.isoformat() if self.signed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_body:
            d['body_html'] = self.body_html
        return d

    def __repr__(self):
        return f'<Contract {self.title} {self.status}>'
