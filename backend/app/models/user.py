from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from app import db


class User(db.Model):
    """User model for authentication and profile management."""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    phone = db.Column(db.String(20))
    avatar_url = db.Column(db.String(255))

    # User type: 'particular', 'professional', 'admin'
    user_type = db.Column(db.String(20), default='particular')

    # Account role: 'buyer' (searcher), 'agent' (seller), 'admin'
    account_role = db.Column(db.String(20), default='buyer')

    # Declared interest at signup: 'vente', 'mise-en-location', 'gestion-locative',
    # 'courte-duree', 'estimation', 'autre'
    interest = db.Column(db.String(30), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    is_verified = db.Column(db.Boolean, default=False)

    # Password reset
    reset_token = db.Column(db.String(100), nullable=True, index=True)
    reset_token_expires = db.Column(db.DateTime, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = db.Column(db.DateTime)

    # Platform moderation (super-admin)
    is_suspended = db.Column(db.Boolean, default=False, nullable=False)
    suspended_at = db.Column(db.DateTime, nullable=True)
    suspended_reason = db.Column(db.String(255), nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    anonymized_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)
    agency = db.relationship('Agency', back_populates='members')
    properties = db.relationship('Property', back_populates='owner', lazy='dynamic')

    def set_password(self, password):
        """Hash and set the user password."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Verify the password against the hash."""
        return check_password_hash(self.password_hash, password)

    @property
    def full_name(self):
        """Return the full name of the user."""
        return f"{self.first_name} {self.last_name}"

    def moderation_state(self):
        """Return 'deleted' | 'suspended' | 'active'."""
        if self.deleted_at is not None:
            return 'deleted'
        if self.is_suspended:
            return 'suspended'
        return 'active'

    def to_dict(self):
        """Serialize user to dictionary."""
        # Get primary role (highest level)
        primary_role = None
        if hasattr(self, 'roles') and self.roles:
            roles_list = list(self.roles)
            if roles_list:
                # Get role with highest level (admin has level 100)
                primary_role = max(roles_list, key=lambda r: r.level)

        is_superadmin = any(getattr(r, 'slug', None) == 'superadmin'
                            for r in (list(self.roles) if hasattr(self, 'roles') else []))

        return {
            'id': self.id,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'full_name': self.full_name,
            'phone': self.phone,
            'avatar_url': self.avatar_url,
            'user_type': self.user_type,
            'account_role': self.account_role,
            'interest': self.interest,
            'is_verified': self.is_verified,
            'agency_id': self.agency_id,
            'role': primary_role.slug if primary_role else None,
            'role_name': primary_role.name if primary_role else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_superadmin': is_superadmin,
            'is_suspended': bool(self.is_suspended),
            'suspended_reason': self.suspended_reason,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'anonymized_at': self.anonymized_at.isoformat() if self.anonymized_at else None,
        }

    def __repr__(self):
        return f'<User {self.email}>'
