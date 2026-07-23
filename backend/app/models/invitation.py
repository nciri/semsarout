from datetime import datetime
from app import db


class Invitation(db.Model):
    """A seat invitation sent to an email; token stored hashed only."""
    __tablename__ = 'invitations'

    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    email = db.Column(db.String(120), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=True)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=True)
    token_hash = db.Column(db.String(64), nullable=False, index=True)
    status = db.Column(db.String(20), default='pending')  # pending|accepted|revoked|expired
    invited_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    expires_at = db.Column(db.DateTime)
    accepted_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def is_active_pending(self):
        return self.status == 'pending' and (self.expires_at is None or self.expires_at > datetime.utcnow())

    def to_dict(self):
        role = None
        if self.role_id:
            from app.models.role import Role
            r = Role.query.get(self.role_id)
            role = r.name if r else None
        return {
            'id': self.id,
            'agency_id': self.agency_id,
            'email': self.email,
            'role_id': self.role_id,
            'role_name': role,
            'team_id': self.team_id,
            'status': self.status,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<Invitation {self.email} {self.status}>'
