from datetime import datetime
from app import db


class Team(db.Model):
    """A lightweight label to group agency members (no data partitioning)."""
    __tablename__ = 'teams'
    __table_args__ = (db.UniqueConstraint('agency_id', 'name', name='uq_team_agency_name'),)

    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    name = db.Column(db.String(80), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        from app.models.user import User
        return {
            'id': self.id,
            'agency_id': self.agency_id,
            'name': self.name,
            'members_count': User.query.filter_by(team_id=self.id).count(),
        }

    def __repr__(self):
        return f'<Team {self.name}>'
