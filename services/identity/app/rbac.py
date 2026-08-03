"""Router RBAC d'identity (lecture) — rôles & permissions, à parité avec le monolithe.

Surface **lecture** du domaine rôles (`/backoffice/roles*`, `/backoffice/permissions`) servie
depuis les projections identity (`role_ro`/`permission_ro`). Les écritures (CRUD rôles, gestion
d'équipe, invitations) restent au monolithe pour l'instant (RBAC à base de sièges + agence).
Erreurs legacy `{'error': msg}`.
"""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_events import enqueue

from . import audit, seats
from .auth import _user_event_doc
from .db import get_db
from .models import AgencyRO, PermissionRO, RoleRO, UserRO, user_role_ro

router = APIRouter()


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


async def _json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def _actor_id(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def _acting(principal: Principal, db: Session) -> UserRO | None:
    uid = _actor_id(principal)
    return db.get(UserRO, uid) if uid else None


def _require_manage_roles(principal: Principal, db: Session):
    """Reproduit `_require_manage_roles` : (agency, None) si autorisé, sinon (None, err)."""
    agency = db.get(AgencyRO, principal.agency_id) if principal.agency_id else None
    if principal.is_superadmin:
        return agency, None
    if agency is None:
        return None, _err("Aucune agence", 400)
    if not seats.can_manage_team(db, _acting(principal, db), agency):
        return None, _err("Vous n'avez pas le droit de gérer les rôles.", 403)
    return agency, None


def _emit_user(db: Session, user: UserRO) -> None:
    db.flush()
    enqueue(db, "user", user.id, "user.updated", _user_event_doc(user))


def _counts(db: Session, role_ids: list[int]) -> dict[int, int]:
    if not role_ids:
        return {}
    rows = (db.query(user_role_ro.c.role_id, func.count())
            .filter(user_role_ro.c.role_id.in_(role_ids))
            .group_by(user_role_ro.c.role_id).all())
    return dict(rows)


@router.get("/backoffice/users")
def get_users(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    """Liste des utilisateurs (backoffice, cloisonnée à l'agence) — parité
    `backend/app/api/v1/backoffice/roles.py:get_users`. Chaque user + ses rôles (avec users_count)."""
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    query = db.query(UserRO)
    if principal.agency_id:
        query = query.filter(UserRO.agency_id == principal.agency_id)
    if qp.get("type"):
        query = query.filter(UserRO.user_type == qp.get("type"))
    if qp.get("is_active") is not None and qp.get("is_active") != "":
        query = query.filter(UserRO.is_active.is_(qp.get("is_active").lower() == "true"))
    if qp.get("q"):
        term = f"%{qp.get('q')}%"
        query = query.filter(or_(UserRO.first_name.ilike(term), UserRO.last_name.ilike(term),
                                 UserRO.email.ilike(term)))
    query = query.order_by(UserRO.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    role_ids = {r.id for u in items for r in u.roles}
    counts = _counts(db, list(role_ids))
    users = []
    for u in items:
        d = u.to_dict()
        d["roles"] = [r.to_dict(users_count=counts.get(r.id, 0)) for r in u.roles]
        users.append(d)
    return {"users": users, "total": total, "pages": pages, "current_page": page}


@router.get("/backoffice/roles")
def get_roles(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    agency_id = principal.agency_id
    roles = (db.query(RoleRO)
             .filter(or_(RoleRO.agency_id == agency_id, RoleRO.agency_id.is_(None)))
             .order_by(RoleRO.level).all())
    counts = _counts(db, [r.id for r in roles])
    return {"roles": [r.to_dict(include_permissions=True, users_count=counts.get(r.id, 0))
                      for r in roles]}


@router.get("/backoffice/roles/{role_id}")
def get_role(role_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    role = db.get(RoleRO, role_id)
    # Cloisonnement multi-agences (même portée que la liste) : un rôle d'une autre agence
    # n'est pas lisible → 404. Corrige l'IDOR présent aussi côté monolithe (get_or_404 non scoping).
    if role is None or (role.agency_id is not None and role.agency_id != principal.agency_id):
        return _err("Not found", 404)
    counts = _counts(db, [role.id])
    return role.to_dict(include_permissions=True, users_count=counts.get(role.id, 0))


@router.get("/backoffice/permissions")
def get_permissions(_p: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    perms = db.query(PermissionRO).order_by(PermissionRO.module, PermissionRO.name).all()
    grouped: dict[str, list] = {}
    for p in perms:
        grouped.setdefault(p.module, []).append(p.to_dict())
    return {"permissions": [p.to_dict() for p in perms], "grouped": grouped}


# ---- Écritures (gestion des utilisateurs) ----
def _scoped_user(db: Session, principal: Principal, user_id: int):
    user = db.get(UserRO, user_id)
    if user is None:
        return None, _err("User not found", 404)
    if principal.agency_id and user.agency_id != principal.agency_id:
        return None, _err("Access denied", 403)
    return user, None


@router.post("/backoffice/users/{user_id}/activate")
def activate_user(user_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user, err = _scoped_user(db, principal, user_id)
    if err:
        return err
    user.is_active = True
    _emit_user(db, user)
    db.commit()
    return {"message": "User activated"}


@router.post("/backoffice/users/{user_id}/deactivate")
def deactivate_user(user_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user, err = _scoped_user(db, principal, user_id)
    if err:
        return err
    user.is_active = False
    _emit_user(db, user)
    db.commit()
    return {"message": "User deactivated"}


@router.put("/backoffice/users/{user_id}/roles")
async def update_user_roles(user_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user, err = _scoped_user(db, principal, user_id)
    if err:
        return err
    agency, err = _require_manage_roles(principal, db)
    if err:
        return err
    role_ids = (await _json(request)).get("roles", [])
    if principal.is_superadmin:
        roles = db.query(RoleRO).filter(RoleRO.id.in_(role_ids)).all()
        if len(roles) != len(set(role_ids)):
            return _err("Rôle invalide", 400)
    else:
        if agency.owner_id and user.id == agency.owner_id:
            return _err("Le rôle du propriétaire ne peut pas être modifié.", 409)
        roles = []
        for rid in role_ids:
            role = seats.resolve_assignable_role(db, agency.id, rid)
            if role is None:
                return _err("Rôle invalide", 400)
            roles.append(role)
    user.roles = roles
    _emit_user(db, user)
    audit.emit(db, actor_id=_actor_id(principal), action="update_roles",
               entity_type="user", entity_id=user.id, agency_id=principal.agency_id,
               extra_data={"roles": [r.name for r in roles]})
    db.commit()
    return {"message": "Roles updated"}


# ---- CRUD des rôles (identity source de vérité, émet role.*) ----
def _role_doc(role: RoleRO) -> dict:
    return {
        "id": role.id, "name": role.name, "slug": role.slug, "description": role.description,
        "color": role.color, "level": role.level, "is_system": bool(role.is_system),
        "agency_id": role.agency_id, "permission_ids": [p.id for p in role.permissions],
    }


def _perms(db: Session, ids: list) -> list:
    return db.query(PermissionRO).filter(PermissionRO.id.in_(ids)).all() if ids else []


def _assert_grantable(db: Session, principal: Principal, agency, permission_ids):
    """Anti-escalation : un manager ne peut accorder à un rôle que des permissions qu'il DÉTIENT.
    Super-admin et propriétaire d'agence (autorité pleine) ne sont pas restreints. 403 sinon."""
    ids = list(permission_ids or [])
    if not ids or principal.is_superadmin:
        return None
    acting = _acting(principal, db)
    if agency is not None and acting is not None and agency.owner_id == acting.id:
        return None
    held = {p.id for r in (acting.roles if acting else []) for p in r.permissions}
    if not set(ids).issubset(held):
        return _err("Vous ne pouvez accorder que des permissions que vous détenez.", 403)
    return None


@router.post("/backoffice/roles", status_code=201)
async def create_role(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage_roles(principal, db)
    if err:
        return err
    data = await _json(request)
    try:
        level = int(data.get("level", 100))
    except (TypeError, ValueError):
        level = 100
    if not principal.is_superadmin and level >= 100:
        level = 99
    role = RoleRO(
        name=data.get("name"),
        slug=data.get("slug") or (data.get("name", "") or "").lower().replace(" ", "_"),
        description=data.get("description"), color=data.get("color", "gray"), level=level,
        is_system=False, agency_id=None if principal.is_superadmin else agency.id,
    )
    if "permissions" in data:
        err = _assert_grantable(db, principal, agency, data["permissions"])
        if err:
            return err
        role.permissions = _perms(db, data["permissions"])
    db.add(role)
    db.flush()
    enqueue(db, "role", role.id, "role.created", _role_doc(role))
    audit.emit(db, actor_id=_actor_id(principal), action="create",
               entity_type="role", entity_id=role.id, agency_id=principal.agency_id,
               extra_data={"name": role.name, "slug": role.slug})
    db.commit()
    return role.to_dict(include_permissions=True, users_count=0)


@router.put("/backoffice/roles/{role_id}")
async def update_role(role_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage_roles(principal, db)
    if err:
        return err
    role = db.get(RoleRO, role_id)
    if role is None:
        return _err("Not found", 404)
    if not principal.is_superadmin and role.agency_id != agency.id:
        return _err("Rôle introuvable", 404)
    if role.is_system:
        return _err("Cannot modify system role", 403)
    data = await _json(request)
    if not principal.is_superadmin and "level" in data:
        try:
            lvl = int(data["level"])
        except (TypeError, ValueError):
            lvl = role.level
        data["level"] = lvl if lvl < 100 else 99
    for field in ("name", "description", "color", "level"):
        if field in data:
            setattr(role, field, data[field])
    if "permissions" in data:
        err = _assert_grantable(db, principal, agency, data["permissions"])
        if err:
            return err
        role.permissions = _perms(db, data["permissions"])
    enqueue(db, "role", role.id, "role.updated", _role_doc(role))
    audit.emit(db, actor_id=_actor_id(principal), action="update",
               entity_type="role", entity_id=role.id, agency_id=principal.agency_id,
               extra_data={"name": role.name})
    db.commit()
    counts = _counts(db, [role.id])
    return role.to_dict(include_permissions=True, users_count=counts.get(role.id, 0))


@router.delete("/backoffice/roles/{role_id}")
def delete_role(role_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    agency, err = _require_manage_roles(principal, db)
    if err:
        return err
    role = db.get(RoleRO, role_id)
    if role is None:
        return _err("Not found", 404)
    if not principal.is_superadmin and role.agency_id != agency.id:
        return _err("Rôle introuvable", 404)
    if role.is_system:
        return _err("Cannot delete system role", 403)
    if _counts(db, [role.id]).get(role.id, 0) > 0:
        return _err("Cannot delete role with assigned users", 400)
    enqueue(db, "role", role.id, "role.deleted", {"id": role.id})
    audit.emit(db, actor_id=_actor_id(principal), action="delete",
               entity_type="role", entity_id=role.id, agency_id=principal.agency_id,
               extra_data={"name": role.name, "slug": role.slug})
    db.delete(role)
    db.commit()
    return {"message": "Role deleted"}
