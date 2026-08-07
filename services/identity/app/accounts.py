"""Modération de compte **utilisateur** (super-admin) — écritures possédées par identity.

identity possède le domaine compte (`user_ro`). trust-safety (façade super-admin) délègue ici
la mutation du compte via **jeton interne** (`x-internal-token`), puis possède, de son côté,
l'audit + le masquage (§6) + les événements `account.*`. Parité EXACTE des réponses du
monolithe (`/admin/accounts/users/*`) : mêmes messages, mêmes codes, `UserRO.to_dict()`.
L'`actor_id` (super-admin agissant) est transmis dans le corps par trust-safety pour les gardes
d'auto-action. identity émet `user.updated` pour resynchroniser les autres projections.
"""
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash

from semsar_common import forbidden, get_settings
from semsar_events import enqueue

from .auth import _user_event_doc
from .db import get_db
from .models import UserRO

router = APIRouter()
settings = get_settings()


def _msg(message: str, user: UserRO, code: int = 200) -> JSONResponse:
    return JSONResponse({"message": message, "user": user.to_dict()}, status_code=code)


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


def _is_superadmin(u: UserRO) -> bool:
    return any(r.slug == "superadmin" for r in u.roles)


def _count_active_superadmins(db: Session) -> int:
    """Parité `moderation.count_active_superadmins` : super-admins ni supprimés ni suspendus."""
    users = db.query(UserRO).filter(UserRO.deleted_at.is_(None), UserRO.is_suspended.is_(False)).all()
    return sum(1 for u in users if _is_superadmin(u))


def _emit(db: Session, user: UserRO) -> None:
    enqueue(db, "user", user.id, "user.updated", _user_event_doc(user))


def _resolve(db: Session, user_id: int, x_internal_token: str, tenant: str | None = None) -> UserRO | None:
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    u = db.get(UserRO, user_id)
    if u is not None and tenant and u.tenant != tenant:
        return None
    return u


@router.post("/internal/accounts/users/{user_id}/suspend", include_in_schema=False)
def suspend_user(user_id: int, actor_id: int | None = None, reason: str | None = None,
                 tenant: str | None = None,
                 x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    u = _resolve(db, user_id, x_internal_token, tenant)
    if u is None:
        return _err("User not found", 404)
    if u.id == actor_id:
        return _err("Vous ne pouvez pas vous suspendre vous-même.", 409)
    if u.is_suspended:
        return _msg("Compte déjà suspendu", u)
    if _is_superadmin(u) and _count_active_superadmins(db) <= 1:
        return _err("Impossible de suspendre le dernier super-admin.", 409)
    u.is_suspended = True
    u.suspended_at = datetime.utcnow()
    u.suspended_reason = reason
    _emit(db, u)
    db.commit()
    return _msg("Compte suspendu", u)


@router.post("/internal/accounts/users/{user_id}/unsuspend", include_in_schema=False)
def unsuspend_user(user_id: int, actor_id: int | None = None, reason: str | None = None,
                   tenant: str | None = None,
                   x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    u = _resolve(db, user_id, x_internal_token, tenant)
    if u is None:
        return _err("User not found", 404)
    u.is_suspended = False
    u.suspended_at = None
    u.suspended_reason = None
    _emit(db, u)
    db.commit()
    return _msg("Compte réactivé", u)


@router.post("/internal/accounts/users/{user_id}/delete", include_in_schema=False)
def delete_user(user_id: int, actor_id: int | None = None, reason: str | None = None,
                x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Suppression logique (parité `DELETE /accounts/users/{id}`)."""
    u = _resolve(db, user_id, x_internal_token)
    if u is None:
        return _err("User not found", 404)
    if u.id == actor_id:
        return _err("Vous ne pouvez pas supprimer votre propre compte.", 409)
    if u.deleted_at is not None:
        return _msg("Compte déjà supprimé", u)
    if _is_superadmin(u) and _count_active_superadmins(db) <= 1:
        return _err("Impossible de supprimer le dernier super-admin.", 409)
    u.deleted_at = datetime.utcnow()
    u.is_suspended = True  # bloque aussi le login immédiatement
    _emit(db, u)
    db.commit()
    return _msg("Compte supprimé", u)


@router.post("/internal/accounts/users/{user_id}/restore", include_in_schema=False)
def restore_user(user_id: int, actor_id: int | None = None, reason: str | None = None,
                 x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    u = _resolve(db, user_id, x_internal_token)
    if u is None:
        return _err("User not found", 404)
    if u.anonymized_at is not None:
        return _err("Compte anonymisé : restauration impossible.", 409)
    u.deleted_at = None
    u.is_suspended = False
    u.suspended_at = None
    u.suspended_reason = None
    _emit(db, u)
    db.commit()
    return _msg("Compte restauré", u)


@router.post("/internal/accounts/users/{user_id}/anonymize", include_in_schema=False)
def anonymize_user(user_id: int, actor_id: int | None = None, reason: str | None = None,
                   x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Anonymisation irréversible de la PII (parité `moderation.anonymize_user`)."""
    u = _resolve(db, user_id, x_internal_token)
    if u is None:
        return _err("User not found", 404)
    if u.id == actor_id:
        return _err("Vous ne pouvez pas vous anonymiser vous-même.", 409)
    if u.anonymized_at is not None:
        return _msg("Compte déjà anonymisé", u)
    if _is_superadmin(u) and _count_active_superadmins(db) <= 1:
        return _err("Impossible d'anonymiser le dernier super-admin.", 409)
    u.email = f"deleted+{u.id}@semsar.invalid"
    u.first_name = "Compte"
    u.last_name = "supprimé"
    u.phone = None
    u.avatar_url = None
    u.password_hash = generate_password_hash(secrets.token_urlsafe(32))
    if u.deleted_at is None:
        u.deleted_at = datetime.utcnow()
    u.is_suspended = True
    u.anonymized_at = datetime.utcnow()
    _emit(db, u)
    db.commit()
    return _msg("Compte anonymisé", u)
