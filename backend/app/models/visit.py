from datetime import datetime
from app import db


class Visit(db.Model):
    """Visit/Appointment model for scheduling property viewings."""
    __tablename__ = 'visits'

    id = db.Column(db.Integer, primary_key=True)

    # Related entities
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=False)
    related_property = db.relationship('Property')

    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=True)
    client = db.relationship('Client', back_populates='visits')

    # For non-registered visitors
    visitor_name = db.Column(db.String(100))
    visitor_email = db.Column(db.String(120))
    visitor_phone = db.Column(db.String(20))

    # Assigned agent
    agent_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    agent = db.relationship('User', foreign_keys=[agent_id])

    # Schedule
    scheduled_at = db.Column(db.DateTime, nullable=False)
    duration_minutes = db.Column(db.Integer, default=30)

    # Status: 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
    status = db.Column(db.String(20), default='scheduled')

    # Visit type: 'in_person', 'virtual', 'open_house'
    visit_type = db.Column(db.String(20), default='in_person')

    # Notes
    notes = db.Column(db.Text)
    internal_notes = db.Column(db.Text)  # Not shared with client

    # Report after visit
    report = db.Column(db.Text)
    client_feedback = db.Column(db.String(20))  # 'interested', 'maybe', 'not_interested'
    client_comments = db.Column(db.Text)

    # Reminders sent
    reminder_sent_24h = db.Column(db.Boolean, default=False)
    reminder_sent_2h = db.Column(db.Boolean, default=False)

    # Confirmation
    confirmed_at = db.Column(db.DateTime)
    confirmation_method = db.Column(db.String(20))  # 'email', 'sms', 'whatsapp', 'phone'

    # Agency
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    cancelled_at = db.Column(db.DateTime)
    cancellation_reason = db.Column(db.String(255))

    @property
    def contact_name(self):
        if self.client:
            return self.client.full_name
        return self.visitor_name

    @property
    def contact_phone(self):
        if self.client:
            return self.client.phone
        return self.visitor_phone

    def to_dict(self, include_property=False, include_client=False):
        data = {
            'id': self.id,
            'property_id': self.property_id,
            'property_title': self.related_property.title if self.related_property else None,
            'property_address': f"{self.related_property.address}, {self.related_property.city}" if self.related_property else None,
            'client_id': self.client_id,
            'contact_name': self.contact_name,
            'contact_phone': self.contact_phone,
            'visitor_email': self.visitor_email or (self.client.email if self.client else None),
            'agent_id': self.agent_id,
            'agent_name': self.agent.full_name if self.agent else None,
            'scheduled_at': self.scheduled_at.isoformat() if self.scheduled_at else None,
            'duration_minutes': self.duration_minutes,
            'status': self.status,
            'visit_type': self.visit_type,
            'notes': self.notes,
            'report': self.report,
            'client_feedback': self.client_feedback,
            'client_comments': self.client_comments,
            'confirmed_at': self.confirmed_at.isoformat() if self.confirmed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_property and self.related_property:
            data['property'] = self.related_property.to_dict(include_images=False)
        if include_client and self.client:
            data['client'] = self.client.to_dict()
        return data

    def __repr__(self):
        return f'<Visit {self.id} - {self.scheduled_at}>'


class CalendarEvent(db.Model):
    """General calendar events (meetings, tasks, reminders)."""
    __tablename__ = 'calendar_events'

    id = db.Column(db.Integer, primary_key=True)

    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)

    # Type: 'meeting', 'task', 'reminder', 'call', 'other'
    event_type = db.Column(db.String(20), default='meeting')

    # Schedule
    start_at = db.Column(db.DateTime, nullable=False)
    end_at = db.Column(db.DateTime)
    all_day = db.Column(db.Boolean, default=False)

    # Recurrence (JSON)
    recurrence = db.Column(db.JSON)  # {'frequency': 'weekly', 'interval': 1, 'until': '2024-12-31'}

    # Location
    location = db.Column(db.String(255))

    # Attendees (JSON array of user IDs)
    attendees = db.Column(db.JSON, default=list)

    # Related entities
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)

    # Owner
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    user = db.relationship('User')

    # Agency
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)

    # Status: 'pending', 'completed', 'cancelled'
    status = db.Column(db.String(20), default='pending')

    # Color for calendar display
    color = db.Column(db.String(20), default='blue')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'event_type': self.event_type,
            'start_at': self.start_at.isoformat() if self.start_at else None,
            'end_at': self.end_at.isoformat() if self.end_at else None,
            'all_day': self.all_day,
            'location': self.location,
            'attendees': self.attendees or [],
            'client_id': self.client_id,
            'property_id': self.property_id,
            'user_id': self.user_id,
            'status': self.status,
            'color': self.color,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<CalendarEvent {self.title}>'
