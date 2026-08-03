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

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from semsar_auth import Principal, get_principal
from semsar_events import enqueue

from . import seats
from .auth import ACCESS_TTL, REFRESH_TTL, _token, _user_event_doc
from .db import get_db
from .models import AgencyRO, Invitation, RoleRO, Team, UserRO

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
    if not team_ids:
        return {}
    return dict(db.query(UserRO.team_id, func.count()).filter(UserRO.team_id.in_(team_ids))
                .group_by(UserRO.team_id).all())


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

    return {
        "owner": owner.to_dict() if owner else None,
        "members": [member_row(u) for u in members],
        "teams": [t.to_dict(members_count=tcounts.get(t.id, 0)) for t in teams],
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
    name = ((await _json(request)).get("name") or "").strip()
    if not name:
        return _err("Nom d'équipe requis", 400)
    if not seats.can_create_team(db, agency):
        return _err("Limite d'équipes atteinte pour votre plan.", 409)
    if db.query(Team).filter(Team.agency_id == agency.id, Team.name == name).first():
        return _err("Une équipe porte déjà ce nom.", 409)
    t = Team(agency_id=agency.id, name=name)
    db.add(t)
    db.commit()
    return {"team": t.to_dict()}


@router.put("/backoffice/teams/{team_id}")
async def rename_team(team_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    t = db.query(Team).filter(Team.id == team_id, Team.agency_id == agency.id).first()
    if not t:
        return _err("Équipe introuvable", 404)
    name = ((await _json(request)).get("name") or "").strip()
    if not name:
        return _err("Nom d'équipe requis", 400)
    t.name = name
    db.commit()
    return {"team": t.to_dict(members_count=_team_counts(db, [t.id]).get(t.id, 0))}


@router.delete("/backoffice/teams/{team_id}")
def delete_team(team_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage(principal, db)
    if err:
        return err
    t = db.query(Team).filter(Team.id == team_id, Team.agency_id == agency.id).first()
    if not t:
        return _err("Équipe introuvable", 404)
    db.query(UserRO).filter(UserRO.team_id == t.id).update({"team_id": None})
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
