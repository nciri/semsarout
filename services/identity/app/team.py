"""Router équipe & invitations d'identity — reroute des routes du monolithe (`/team*`,
`/teams*`, `/team/invitations*`, `/invitations/{token}*`). Erreurs legacy `{'error'}`.

identity possède désormais users + roles + seats + teams + invitations : la gestion d'équipe
est self-contained. Les changements de membre (team_id/agency_id/roles) émettent `user.*`
(resync monolithe). L'envoi d'email est stubbé en dev (le chemin d'invitation est renvoyé).
"""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from semsar_auth import Principal, get_principal
from semsar_common import get_settings
from semsar_events import enqueue

from . import seats, teams_catalog
from .auth import ACCESS_TTL, REFRESH_TTL, _token, _user_event_doc
from .db import get_db
from .models import AgencyRO, Invitation, RoleRO, Team, TeamMembership, UserRO

router = APIRouter()
_log = logging.getLogger("identity")


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


async def _json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def _acting(principal: Principal, db: Session) -> UserRO | None:
    uid = int(principal.sub) if principal.sub and principal.sub.isdigit() else None
    return db.get(UserRO, uid) if uid else None


def _require_manage(principal: Principal, db: Session):
    agency = db.get(AgencyRO, principal.agency_id) if principal.agency_id else None
    if agency is None:
        return None, _err("Aucune agence", 400)
    if not seats.can_manage_team(db, _acting(principal, db), agency):
        return None, _err("Vous n'avez pas le droit de gérer l'équipe.", 403)
    return agency, None


def _emit_user(db: Session, user: UserRO) -> None:
    db.flush()
    enqueue(db, "user", user.id, "user.updated", _user_event_doc(user))


def _role_name(db: Session, role_id) -> str | None:
    r = db.get(RoleRO, role_id) if role_id else None
    return r.name if r else None


def _inv_dict(db: Session, inv: Invitation) -> dict:
    return inv.to_dict(role_name=_role_name(db, inv.role_id))


def _team_counts(db: Session, team_ids: list[int]) -> dict[int, int]:
    """Effectif d'une équipe : rattachement principal OU appartenance secondaire, sans
    compter deux fois celui qui a les deux."""
    if not team_ids:
        return {}
    counts: dict[int, set[int]] = {tid: set() for tid in team_ids}
    for tid, uid in db.query(UserRO.team_id, UserRO.id).filter(UserRO.team_id.in_(team_ids)):
        counts[tid].add(uid)
    for tid, uid in db.query(TeamMembership.team_id, TeamMembership.user_id).filter(
            TeamMembership.team_id.in_(team_ids)):
        counts[tid].add(uid)
    return {tid: len(ids) for tid, ids in counts.items()}


def _memberships(db: Session, team_ids: list[int]) -> dict[int, list[dict]]:
    """Appartenances secondaires, groupées par équipe."""
    if not team_ids:
        return {}
    rows = db.query(TeamMembership).filter(TeamMembership.team_id.in_(team_ids)).all()
    out: dict[int, list[dict]] = {tid: [] for tid in team_ids}
    for m in rows:
        out[m.team_id].append({"user_id": m.user_id, "job": m.job})
    return out


def _team_payload(data: dict, current: Team | None = None):
    """Champs communs à la création et à la modification d'une équipe."""
    name = (data.get("name") or (current.name if current else "")).strip()
    if not name:
        return None, _err("Nom d'équipe requis", 400)
    kind = (data.get("kind") or (current.kind if current else teams_catalog.DEFAULT_KIND)).strip()
    if not teams_catalog.valid_kind(kind):
        return None, _err("Métier d'équipe inconnu", 400)
    color = (data.get("color") or (current.color if current else None) or "").strip()[:16] or None
    description = (data.get("description")
                   or (current.description if current else None) or "").strip()[:255] or None
    return {"name": name[:80], "kind": kind, "color": color, "description": description}, None


def _new_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def _send_email(to: str, subject: str, body: str) -> None:
    _log.info("email (stub dev)", extra={"to": to, "subject": subject})


# ---- Vue d'équipe ----
@router.get("/backoffice/team")
def get_team(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency = db.get(AgencyRO, principal.agency_id) if principal.agency_id else None
    if agency is None:
        return _err("Aucune agence", 400)
    members = db.query(UserRO).filter(UserRO.agency_id == agency.id, UserRO.deleted_at.is_(None)).all()
    owner = db.get(UserRO, agency.owner_id) if agency.owner_id else None
    teams = db.query(Team).filter(Team.agency_id == agency.id).all()
    pending = db.query(Invitation).filter(Invitation.agency_id == agency.id, Invitation.status == "pending").all()
    tcounts = _team_counts(db, [t.id for t in teams])

    def member_row(u: UserRO) -> dict:
        d = u.to_dict()
        d["roles"] = [r.to_dict() for r in u.roles]
        d["is_owner"] = (u.id == agency.owner_id)
        return d

    mships = _memberships(db, [t.id for t in teams])
    return {
        "owner": owner.to_dict() if owner else None,
        "members": [member_row(u) for u in members],
        "teams": [{**t.to_dict(members_count=tcounts.get(t.id, 0)),
                   "memberships": mships.get(t.id, [])} for t in teams],
        "team_kinds": teams_catalog.catalogue(),
        "invitations": [_inv_dict(db, i) for i in pending if i.is_active_pending()],
        "seats": {"used": seats.seats_used(db, agency), "limit": seats.seats_limit(agency)},
        "teams_quota": {"used": seats.teams_used(db, agency), "limit": seats.teams_limit(agency)},
        "can_manage": seats.can_manage_team(db, _acting(principal, db), agency),
    }


# ---- CRUD équipes ----
@router.post("/backoffice/teams", status_code=201)
async def create_team(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    payload, e = _team_payload(await _json(request))
    if e:
        return e
    if not seats.can_create_team(db, agency):
        return _err("Limite d'équipes atteinte pour votre plan.", 409)
    if db.query(Team).filter(Team.agency_id == agency.id, Team.name == payload["name"]).first():
        return _err("Une équipe porte déjà ce nom.", 409)
    t = Team(agency_id=agency.id, **payload)
    db.add(t)
    db.commit()
    return {"team": {**t.to_dict(), "memberships": []}}


@router.put("/backoffice/teams/{team_id}")
async def rename_team(team_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    t = db.query(Team).filter(Team.id == team_id, Team.agency_id == agency.id).first()
    if not t:
        return _err("Équipe introuvable", 404)
    payload, e = _team_payload(await _json(request), current=t)
    if e:
        return e
    if db.query(Team).filter(Team.agency_id == agency.id, Team.name == payload["name"],
                             Team.id != t.id).first():
        return _err("Une équipe porte déjà ce nom.", 409)
    for field, value in payload.items():
        setattr(t, field, value)
    # Un changement de métier invalide les rôles tenus dans l'équipe : ils appartiennent au
    # métier. Les ramener au rôle courant vaut mieux que garder un libellé qui n'existe plus.
    for m in db.query(TeamMembership).filter(TeamMembership.team_id == t.id):
        if not teams_catalog.valid_job(t.kind, m.job):
            m.job = teams_catalog.default_job(t.kind)
    db.commit()
    return {"team": {**t.to_dict(members_count=_team_counts(db, [t.id]).get(t.id, 0)),
                     "memberships": _memberships(db, [t.id]).get(t.id, [])}}


@router.delete("/backoffice/teams/{team_id}")
def delete_team(team_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    t = db.query(Team).filter(Team.id == team_id, Team.agency_id == agency.id).first()
    if not t:
        return _err("Équipe introuvable", 404)
    db.query(UserRO).filter(UserRO.team_id == t.id).update({"team_id": None})
    db.query(TeamMembership).filter(TeamMembership.team_id == t.id).delete()
    db.delete(t)
    db.commit()
    return {"message": "Équipe supprimée"}


# ---- Membres ----
@router.put("/backoffice/team/members/{user_id}")
async def update_member(user_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    u = db.query(UserRO).filter(UserRO.id == user_id, UserRO.agency_id == agency.id).first()
    if not u:
        return _err("Membre introuvable", 404)
    data = await _json(request)
    if "team_id" in data:
        tid = data["team_id"]
        if tid is not None and not db.query(Team).filter(Team.id == tid, Team.agency_id == agency.id).first():
            return _err("Équipe invalide", 400)
        u.team_id = tid
    if data.get("role_id") is not None:
        if u.id == agency.owner_id:
            return _err("Le rôle du propriétaire ne peut pas être modifié.", 409)
        role = seats.resolve_assignable_role(db, agency.id, data["role_id"])
        if not role:
            return _err("Rôle invalide", 400)
        u.roles = [role]
    _emit_user(db, u)
    db.commit()
    d = u.to_dict()
    d["roles"] = [r.to_dict() for r in u.roles]
    return {"member": d}


@router.delete("/backoffice/team/members/{user_id}")
def remove_member(user_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    if user_id == agency.owner_id:
        return _err("Impossible de retirer le propriétaire du compte.", 409)
    u = db.query(UserRO).filter(UserRO.id == user_id, UserRO.agency_id == agency.id).first()
    if not u:
        return _err("Membre introuvable", 404)
    u.agency_id = None
    u.team_id = None
    _emit_user(db, u)
    db.commit()
    return {"message": "Membre retiré"}


# ---- Invitations (gestion) ----
@router.post("/backoffice/team/invitations", status_code=201)
async def create_invitation(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    data = await _json(request)
    email = (data.get("email") or "").strip().lower()
    if not email:
        return _err("Email requis", 400)
    if db.query(UserRO).filter(UserRO.email == email, UserRO.agency_id == agency.id).first():
        return _err("Cet utilisateur est déjà membre.", 409)
    if db.query(Invitation).filter(Invitation.agency_id == agency.id, Invitation.email == email,
                                   Invitation.status == "pending").first():
        return _err("Une invitation est déjà en attente pour cet email.", 409)
    if not seats.can_invite(db, agency):
        return _err("Limite de sièges atteinte. Passez à un plan supérieur.", 409)
    role_id = data.get("role_id")
    if role_id is not None and seats.resolve_assignable_role(db, agency.id, role_id) is None:
        return _err("Rôle invalide", 400)
    team_id = data.get("team_id")
    if team_id is not None and not db.query(Team).filter(Team.id == team_id, Team.agency_id == agency.id).first():
        return _err("Équipe invalide", 400)
    raw, token_hash = _new_token()
    inv = Invitation(agency_id=agency.id, email=email, role_id=role_id, team_id=team_id,
                     token_hash=token_hash, status="pending",
                     invited_by=int(principal.sub) if principal.sub.isdigit() else None,
                     expires_at=datetime.utcnow() + timedelta(days=7))
    db.add(inv)
    db.commit()
    path = f"/invitation/{raw}"
    _send_email(email, f"Invitation à rejoindre {agency.name}", f"Activez votre compte : {path}")
    return {"invitation": _inv_dict(db, inv), "invite_path": path}


@router.post("/backoffice/team/invitations/{inv_id}/resend")
def resend_invitation(inv_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    inv = db.query(Invitation).filter(Invitation.id == inv_id, Invitation.agency_id == agency.id).first()
    if not inv or inv.status != "pending":
        return _err("Invitation introuvable", 404)
    raw, token_hash = _new_token()
    inv.token_hash = token_hash
    inv.expires_at = datetime.utcnow() + timedelta(days=7)
    db.commit()
    path = f"/invitation/{raw}"
    _send_email(inv.email, f"Invitation à rejoindre {agency.name}", f"Activez votre compte : {path}")
    return {"invitation": _inv_dict(db, inv), "invite_path": path}


@router.delete("/backoffice/team/invitations/{inv_id}")
def revoke_invitation(inv_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    inv = db.query(Invitation).filter(Invitation.id == inv_id, Invitation.agency_id == agency.id).first()
    if not inv or inv.status != "pending":
        return _err("Invitation introuvable", 404)
    inv.status = "revoked"
    db.commit()
    return {"message": "Invitation révoquée"}


# ---- Acceptation (public) ----
def _find_inv(db: Session, token: str) -> Invitation | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return db.query(Invitation).filter(Invitation.token_hash == token_hash).first()


@router.get("/invitations/{token}")
def get_invitation(token: str, db: Session = Depends(get_db)):
    inv = _find_inv(db, token)
    if not inv or inv.status != "pending":
        return _err("Invitation invalide", 404)
    if inv.expires_at and inv.expires_at < datetime.utcnow():
        return _err("Invitation expirée", 410)
    agency = db.get(AgencyRO, inv.agency_id)
    return {"agency_name": agency.name if agency else None, "email": inv.email,
            "role_name": _role_name(db, inv.role_id)}


@router.post("/invitations/{token}/accept", status_code=201)
async def accept_invitation(token: str, request: Request, db: Session = Depends(get_db)):
    inv = _find_inv(db, token)
    if not inv or inv.status != "pending":
        return _err("Invitation invalide", 404)
    if inv.expires_at and inv.expires_at < datetime.utcnow():
        return _err("Invitation expirée", 410)
    agency = db.get(AgencyRO, inv.agency_id)
    if not agency:
        return _err("Agence introuvable", 404)
    data = await _json(request)
    password = data.get("password")
    if not password or len(password) < 8:
        return _err("Mot de passe (8 caractères min.) requis", 400)
    existing = db.query(UserRO).filter(UserRO.email == inv.email).first()
    if existing and not check_password_hash(existing.password_hash, password):
        return _err("Un compte existe déjà pour cet email. Connectez-vous avec votre mot de passe "
                    "habituel pour accepter l'invitation.", 403)
    # Re-check des sièges (course au dernier siège) : marquer accepté d'abord.
    inv.status = "accepted"
    db.flush()
    limit = seats.seats_limit(agency)
    if not (limit == -1 or seats.seats_used(db, agency) < limit):
        db.rollback()
        return _err("Plus de siège disponible pour cette agence.", 409)
    if existing:
        user = existing
        user.agency_id = agency.id
        user.team_id = inv.team_id
    else:
        user = UserRO(email=inv.email, first_name=(data.get("first_name") or "").strip() or "Membre",
                      last_name=(data.get("last_name") or "").strip() or "", account_role="buyer",
                      agency_id=agency.id, team_id=inv.team_id, is_active=True, is_verified=True,
                      password_hash=generate_password_hash(password), created_at=datetime.utcnow())
        db.add(user)
    db.flush()
    if inv.role_id:
        role = db.get(RoleRO, inv.role_id)
        if role:
            user.roles = list(dict.fromkeys((user.roles or []) + [role])) if existing else [role]
    inv.accepted_at = datetime.utcnow()
    enqueue(db, "user", user.id, "user.created" if not existing else "user.updated", _user_event_doc(user))
    db.commit()
    return {"user": user.to_dict(),
            "access_token": _token(user.id, ACCESS_TTL, "access"),
            "refresh_token": _token(user.id, REFRESH_TTL, "refresh")}


# ---- Appartenances secondaires -----------------------------------------------------------
# `UserRO.team_id` reste l'équipe de rattachement ; ces routes gèrent les renforts, avec le
# rôle tenu dans l'équipe d'accueil (le catalogue des métiers le borne).

@router.post("/backoffice/teams/{team_id}/membres", status_code=201)
async def add_membership(team_id: int, request: Request,
                         principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    t = db.query(Team).filter(Team.id == team_id, Team.agency_id == agency.id).first()
    if not t:
        return _err("Équipe introuvable", 404)
    data = await _json(request)
    try:
        user_id = int(data.get("user_id") or 0)
    except (TypeError, ValueError):
        return _err("Membre invalide", 400)
    u = db.query(UserRO).filter(UserRO.id == user_id, UserRO.agency_id == agency.id,
                                UserRO.deleted_at.is_(None)).first()
    if not u:
        return _err("Membre introuvable", 404)
    job = (data.get("job") or teams_catalog.default_job(t.kind)).strip()
    if not teams_catalog.valid_job(t.kind, job):
        return _err("Rôle inconnu pour ce métier d'équipe", 400)
    existing = db.query(TeamMembership).filter(TeamMembership.team_id == t.id,
                                               TeamMembership.user_id == u.id).first()
    if existing is not None:
        existing.job = job
        db.commit()
        return {"membership": existing.to_dict()}
    m = TeamMembership(agency_id=agency.id, team_id=t.id, user_id=u.id, job=job)
    db.add(m)
    db.commit()
    return {"membership": m.to_dict()}


@router.delete("/backoffice/teams/{team_id}/membres/{user_id}")
def remove_membership(team_id: int, user_id: int, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    m = (db.query(TeamMembership)
         .filter(TeamMembership.team_id == team_id, TeamMembership.user_id == user_id,
                 TeamMembership.agency_id == agency.id).first())
    if m is None:
        return _err("Appartenance introuvable", 404)
    db.delete(m)
    db.commit()
    return {"message": "Membre retiré de l'équipe"}


@router.get("/internal/teams", include_in_schema=False)
def internal_teams(agency_id: int = 0, x_internal_token: str = Header(default=""),
                   db: Session = Depends(get_db)):
    """Équipes d'une agence, pour les services qui leur confient du travail (staymanager).

    Rend aussi les appartenances : l'écran d'exploitation affiche qui peut prendre une tâche
    sans avoir à interroger deux services.
    """
    if x_internal_token != get_settings().internal_token:
        return _err("Interdit", 403)
    if agency_id <= 0:
        return _err("Agence requise", 400)
    teams = db.query(Team).filter(Team.agency_id == agency_id).order_by(Team.name).all()
    ids = [t.id for t in teams]
    counts = _team_counts(db, ids)
    mships = _memberships(db, ids)
    return {"teams": [{**t.to_dict(members_count=counts.get(t.id, 0)),
                       "memberships": mships.get(t.id, [])} for t in teams]}
