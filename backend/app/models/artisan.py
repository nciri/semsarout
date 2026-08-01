from datetime import datetime
from app import db


class Artisan(db.Model):
    __tablename__ = 'artisans'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True, index=True)
    trade = db.Column(db.String(40), nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    company = db.Column(db.String(150))
    city = db.Column(db.String(100))
    phone = db.Column(db.String(30))
    email = db.Column(db.String(120))
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'agency_id': self.agency_id, 'is_shared': self.agency_id is None,
                'trade': self.trade, 'name': self.name, 'company': self.company, 'city': self.city,
                'phone': self.phone, 'email': self.email, 'notes': self.notes,
                'created_at': self.created_at.isoformat() if self.created_at else None}


class WorkOrder(db.Model):
    __tablename__ = 'work_orders'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    artisan_id = db.Column(db.Integer, db.ForeignKey('artisans.id'), nullable=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    trade = db.Column(db.String(40), nullable=False)
    status = db.Column(db.String(20), default='requested')
    cost_estimate = db.Column(db.Numeric(12, 2), nullable=True)
    cost_final = db.Column(db.Numeric(12, 2), nullable=True)
    scheduled_date = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        artisan = Artisan.query.get(self.artisan_id) if self.artisan_id else None
        return {'id': self.id, 'agency_id': self.agency_id, 'artisan_id': self.artisan_id,
                'artisan': ({'id': artisan.id, 'name': artisan.name, 'trade': artisan.trade} if artisan else None),
                'property_id': self.property_id, 'title': self.title, 'trade': self.trade,
                'status': self.status,
                'cost_estimate': float(self.cost_estimate) if self.cost_estimate is not None else None,
                'cost_final': float(self.cost_final) if self.cost_final is not None else None,
                'scheduled_date': self.scheduled_date.isoformat() if self.scheduled_date else None,
                'completed_at': self.completed_at.isoformat() if self.completed_at else None,
                'notes': self.notes,
                'created_at': self.created_at.isoformat() if self.created_at else None}
