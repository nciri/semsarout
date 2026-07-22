"""Shared platform-moderation logic (super-admin). Kept out of route modules for reuse/testing."""
from datetime import datetime
from app import db
from app.models import User, ActivityLog


def is_login_blocked(user):
    """Return (blocked, reason) if the user or its agency is suspended/deleted."""
    if user.deleted_at is not None:
        return True, 'Ce compte a été supprimé.'
    if user.is_suspended:
        return True, user.suspended_reason or 'Ce compte a été suspendu.'
    agency = user.agency
    if agency is not None:
        if agency.deleted_at is not None:
            return True, "L'agence de ce compte a été supprimée."
        if agency.is_suspended:
            return True, agency.suspended_reason or "L'agence de ce compte a été suspendue."
    return False, None


def count_active_superadmins():
    return sum(1 for u in User.query.filter(User.deleted_at.is_(None), User.is_suspended.is_(False)).all()
               if any(r.slug == 'superadmin' for r in u.roles))


def log_admin_action(actor, action, entity_type, entity_id, extra=None):
    db.session.add(ActivityLog(
        user_id=actor.id, action=action, entity_type=entity_type,
        entity_id=entity_id, extra_data=extra or {}))


def suspend_user(user, reason):
    user.is_suspended = True
    user.suspended_at = datetime.utcnow()
    user.suspended_reason = reason


def unsuspend_user(user):
    user.is_suspended = False
    user.suspended_at = None
    user.suspended_reason = None


def suspend_agency(agency, reason):
    agency.is_suspended = True
    agency.suspended_at = datetime.utcnow()
    agency.suspended_reason = reason


def unsuspend_agency(agency):
    agency.is_suspended = False
    agency.suspended_at = None
    agency.suspended_reason = None
