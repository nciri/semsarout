"""Single source of truth for seat & team quota checks."""
from datetime import datetime
from app.models import User, Team, Invitation, Subscription, Role


# Platform-level roles must never be delegable through agency team management.
PLATFORM_ROLE_SLUGS = {'superadmin'}


def resolve_assignable_role(agency, role_id):
    """Return a Role assignable within `agency`, or None if invalid/forbidden.

    Assignable = the role belongs to this agency or is a global agency-role,
    AND is not a platform role (superadmin / level >= 200).
    """
    if role_id is None:
        return None
    role = Role.query.get(role_id)
    if role is None:
        return None
    if role.agency_id not in (None, agency.id):
        return None
    if role.slug in PLATFORM_ROLE_SLUGS or (role.level is not None and role.level >= 200):
        return None
    return role


def _plan(agency):
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    return sub.plan if sub else None


def seats_limit(agency):
    p = _plan(agency)
    return p.max_seats if p else 0


def active_member_seats(agency):
    """Real members of the agency, excluding the owner and soft-deleted users."""
    q = User.query.filter(User.agency_id == agency.id, User.deleted_at.is_(None))
    if agency.owner_id:
        q = q.filter(User.id != agency.owner_id)
    return q.count()


def _pending_invites(agency):
    now = datetime.utcnow()
    return Invitation.query.filter(
        Invitation.agency_id == agency.id,
        Invitation.status == 'pending',
        (Invitation.expires_at.is_(None)) | (Invitation.expires_at > now),
    ).count()


def seats_used(agency):
    return active_member_seats(agency) + _pending_invites(agency)


def can_invite(agency):
    limit = seats_limit(agency)
    return limit == -1 or seats_used(agency) < limit


def teams_limit(agency):
    p = _plan(agency)
    return p.max_teams if p else 0


def teams_used(agency):
    return Team.query.filter_by(agency_id=agency.id).count()


def can_create_team(agency):
    limit = teams_limit(agency)
    return limit == -1 or teams_used(agency) < limit


def member_count(agency):
    return User.query.filter(User.agency_id == agency.id, User.deleted_at.is_(None)).count()


def can_manage_team(user, agency):
    if user is None or agency is None:
        return False
    if agency.owner_id and user.id == agency.owner_id:
        return True
    return any(r.has_permission('team.manage') for r in user.roles)
