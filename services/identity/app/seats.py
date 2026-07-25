"""Logique de sièges & quotas d'équipe — relocalisée du monolithe (`app/services/seats.py`).

Source unique de vérité pour les contrôles de quota, portée dans identity (qui possédera les
écritures RBAC/équipe). Les **limites** viennent du plan de l'agence (`agency_ro.max_seats/
max_teams`) ; l'**usage** se calcule sur les projections identity (`user_ro`, et à terme
teams/invitations). Tant que teams/invitations ne sont pas extraits, leur usage vaut 0.
"""
from sqlalchemy.orm import Session

from .models import AgencyRO, RoleRO, UserRO

PLATFORM_ROLE_SLUGS = {"superadmin"}


def resolve_assignable_role(db: Session, agency_id: int, role_id):
    """Rôle assignable dans l'agence, ou None (rôle plateforme/level>=200 exclus)."""
    if role_id is None:
        return None
    role = db.get(RoleRO, role_id)
    if role is None or role.agency_id not in (None, agency_id):
        return None
    if role.slug in PLATFORM_ROLE_SLUGS or (role.level is not None and role.level >= 200):
        return None
    return role


def seats_limit(agency: AgencyRO) -> int:
    return agency.max_seats or 0


def active_member_seats(db: Session, agency: AgencyRO) -> int:
    """Membres réels de l'agence, hors owner et comptes supprimés."""
    q = db.query(UserRO).filter(UserRO.agency_id == agency.id, UserRO.deleted_at.is_(None))
    if agency.owner_id:
        q = q.filter(UserRO.id != agency.owner_id)
    return q.count()


def pending_invites(db: Session, agency: AgencyRO) -> int:
    # invitations pas encore extraites vers identity → 0 (données vides côté monolithe).
    return 0


def seats_used(db: Session, agency: AgencyRO) -> int:
    return active_member_seats(db, agency) + pending_invites(db, agency)


def can_invite(db: Session, agency: AgencyRO) -> bool:
    limit = seats_limit(agency)
    return limit == -1 or seats_used(db, agency) < limit


def teams_limit(agency: AgencyRO) -> int:
    return agency.max_teams or 0


def teams_used(db: Session, agency: AgencyRO) -> int:
    return 0  # teams pas encore extraits vers identity


def can_create_team(db: Session, agency: AgencyRO) -> bool:
    limit = teams_limit(agency)
    return limit == -1 or teams_used(db, agency) < limit


def member_count(db: Session, agency: AgencyRO) -> int:
    return db.query(UserRO).filter(UserRO.agency_id == agency.id, UserRO.deleted_at.is_(None)).count()


def can_manage_team(db: Session, user: UserRO, agency: AgencyRO) -> bool:
    if user is None or agency is None:
        return False
    if agency.owner_id and user.id == agency.owner_id:
        return True
    return any(any(p.slug == "team.manage" for p in r.permissions) for r in user.roles)
