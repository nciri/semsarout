"""Router RBAC d'identity (lecture) — rôles & permissions, à parité avec le monolithe.

Surface **lecture** du domaine rôles (`/backoffice/roles*`, `/backoffice/permissions`) servie
depuis les projections identity (`role_ro`/`permission_ro`). Les écritures (CRUD rôles, gestion
d'équipe, invitations) restent au monolithe pour l'instant (RBAC à base de sièges + agence).
Erreurs legacy `{'error': msg}`.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from .db import get_db
from .models import PermissionRO, RoleRO, user_role_ro

router = APIRouter()


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


def _counts(db: Session, role_ids: list[int]) -> dict[int, int]:
    if not role_ids:
        return {}
    rows = (db.query(user_role_ro.c.role_id, func.count())
            .filter(user_role_ro.c.role_id.in_(role_ids))
            .group_by(user_role_ro.c.role_id).all())
    return dict(rows)


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
