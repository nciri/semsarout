from datetime import datetime
from app import db


# Association table for User-Role many-to-many relationship
user_roles = db.Table('user_roles',
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('role_id', db.Integer, db.ForeignKey('roles.id'), primary_key=True),
    db.Column('created_at', db.DateTime, default=datetime.utcnow)
)

# Association table for Role-Permission many-to-many relationship
role_permissions = db.Table('role_permissions',
    db.Column('role_id', db.Integer, db.ForeignKey('roles.id'), primary_key=True),
    db.Column('permission_id', db.Integer, db.ForeignKey('permissions.id'), primary_key=True)
)


class Role(db.Model):
    """Role model for access control."""
    __tablename__ = 'roles'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    slug = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(255))
    color = db.Column(db.String(20), default='gray')  # For UI display

    # Hierarchy level (lower = more permissions)
    level = db.Column(db.Integer, default=100)

    # System role cannot be deleted
    is_system = db.Column(db.Boolean, default=False)

    # Agency-specific role
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    permissions = db.relationship('Permission', secondary=role_permissions,
                                  backref=db.backref('roles', lazy='dynamic'))
    users = db.relationship('User', secondary=user_roles,
                           backref=db.backref('roles', lazy='dynamic'))

    def has_permission(self, permission_slug):
        """Check if role has a specific permission."""
        return any(p.slug == permission_slug for p in self.permissions)

    def to_dict(self, include_permissions=False):
        data = {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'description': self.description,
            'color': self.color,
            'level': self.level,
            'is_system': self.is_system,
            'users_count': len(self.users)
        }
        if include_permissions:
            data['permissions'] = [p.to_dict() for p in self.permissions]
        return data

    def __repr__(self):
        return f'<Role {self.name}>'


class Permission(db.Model):
    """Permission model for granular access control."""
    __tablename__ = 'permissions'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.String(255))

    # Module grouping
    module = db.Column(db.String(50), nullable=False)  # properties, clients, finances, etc.

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'description': self.description,
            'module': self.module
        }

    def __repr__(self):
        return f'<Permission {self.slug}>'


class ActivityLog(db.Model):
    """Activity log for audit trail."""
    __tablename__ = 'activity_logs'

    id = db.Column(db.Integer, primary_key=True)

    # Actor
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    user = db.relationship('User')

    # Action details
    action = db.Column(db.String(50), nullable=False)  # create, update, delete, view, login, etc.
    entity_type = db.Column(db.String(50))  # property, client, lead, etc.
    entity_id = db.Column(db.Integer)

    # Additional data (JSON)
    old_values = db.Column(db.JSON)
    new_values = db.Column(db.JSON)
    extra_data = db.Column(db.JSON)  # Additional metadata

    # Request info
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.String(255))

    # Agency scope
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.full_name if self.user else None,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'extra_data': self.extra_data,
            'ip_address': self.ip_address,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<ActivityLog {self.action} {self.entity_type}>'
