from datetime import datetime
from app import db


class Notary(db.Model):
    __tablename__ = 'notaries'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    office = db.Column(db.String(200))
    city = db.Column(db.String(100))
    phone = db.Column(db.String(30))
    email = db.Column(db.String(120))
    license_number = db.Column(db.String(50))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'agency_id': self.agency_id, 'name': self.name,
                'office': self.office, 'city': self.city, 'phone': self.phone,
                'email': self.email, 'license_number': self.license_number, 'notes': self.notes,
                'created_at': self.created_at.isoformat() if self.created_at else None}


class LegalCase(db.Model):
    __tablename__ = 'legal_cases'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    transaction_id = db.Column(db.Integer, db.ForeignKey('transactions.id'), nullable=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)
    notary_id = db.Column(db.Integer, db.ForeignKey('notaries.id'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    case_type = db.Column(db.String(20), default='sale')
    status = db.Column(db.String(20), default='open')
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_tasks=False):
        tasks = LegalTask.query.filter_by(legal_case_id=self.id).all()
        notary = Notary.query.get(self.notary_id) if self.notary_id else None
        d = {
            'id': self.id, 'agency_id': self.agency_id, 'transaction_id': self.transaction_id,
            'property_id': self.property_id, 'notary_id': self.notary_id,
            'notary': notary.to_dict() if notary else None,
            'title': self.title, 'case_type': self.case_type, 'status': self.status,
            'notes': self.notes,
            'tasks_total': len(tasks),
            'tasks_done': sum(1 for t in tasks if t.status == 'done'),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_tasks:
            d['tasks'] = [t.to_dict() for t in sorted(tasks, key=lambda x: x.position)]
        return d


class LegalTask(db.Model):
    __tablename__ = 'legal_tasks'
    id = db.Column(db.Integer, primary_key=True)
    legal_case_id = db.Column(db.Integer, db.ForeignKey('legal_cases.id'), nullable=False, index=True)
    label = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), default='todo')
    due_date = db.Column(db.DateTime, nullable=True)
    assignee_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    position = db.Column(db.Integer, default=0)
    notes = db.Column(db.Text)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'legal_case_id': self.legal_case_id, 'label': self.label,
                'status': self.status,
                'due_date': self.due_date.isoformat() if self.due_date else None,
                'assignee_id': self.assignee_id, 'position': self.position, 'notes': self.notes,
                'completed_at': self.completed_at.isoformat() if self.completed_at else None,
                'created_at': self.created_at.isoformat() if self.created_at else None}
