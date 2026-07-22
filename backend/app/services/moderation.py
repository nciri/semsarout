"""Shared platform-moderation logic (super-admin). Kept out of route modules for reuse/testing."""
import secrets
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


def exclude_moderated_properties(query):
    """Hide listings whose owner or agency is suspended/deleted (platform moderation)."""
    from app.models import Property, Agency
    return (query.join(User, Property.owner_id == User.id)
            .filter(User.is_suspended.is_(False), User.deleted_at.is_(None))
            .outerjoin(Agency, Property.agency_id == Agency.id)
            .filter(db.or_(Agency.id.is_(None),
                           db.and_(Agency.is_suspended.is_(False),
                                   Agency.deleted_at.is_(None)))))


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


def soft_delete_user(user):
    user.deleted_at = datetime.utcnow()
    user.is_suspended = True  # also blocks login immediately


def restore_user(user):
    user.deleted_at = None
    user.is_suspended = False
    user.suspended_at = None
    user.suspended_reason = None


def soft_delete_agency(agency):
    agency.deleted_at = datetime.utcnow()
    agency.is_suspended = True


def restore_agency(agency):
    agency.deleted_at = None
    agency.is_suspended = False
    agency.suspended_at = None
    agency.suspended_reason = None


def anonymize_user(user):
    """Irreversible PII scrub. Keeps FK-linked records intact."""
    user.email = f'deleted+{user.id}@semsar.invalid'
    user.first_name = 'Compte'
    user.last_name = 'supprimé'
    user.phone = None
    user.avatar_url = None
    user.reset_token = None
    user.reset_token_expires = None
    user.set_password(secrets.token_urlsafe(32))
    if user.deleted_at is None:
        user.deleted_at = datetime.utcnow()
    user.is_suspended = True
    user.anonymized_at = datetime.utcnow()


def anonymize_agency(agency):
    """Irreversible PII scrub for an agency. Keeps FK-linked records intact."""
    agency.name = 'Agence supprimée'
    agency.slug = f'agence-supprimee-{agency.id}'
    agency.description = None
    agency.email = f'deleted+agency{agency.id}@semsar.invalid'
    agency.phone = None
    agency.website = None
    agency.address = None
    agency.postal_code = None
    agency.logo_url = None
    agency.cover_image_url = None
    agency.license_number = None
    agency.rc_number = None
    agency.ice_number = None
    agency.api_key = None
    if agency.deleted_at is None:
        agency.deleted_at = datetime.utcnow()
    agency.is_suspended = True
    agency.anonymized_at = datetime.utcnow()
