"""Router auth d'identity — **émission des JWT** (login/me/refresh), à parité avec le monolithe.

identity devient l'émetteur des jetons : il forge des JWT compatibles flask-jwt-extended
(même secret HS256, même structure) avec les **claims d'identité** embarqués, à partir de sa
projection compte (`user_ro`/`role_ro`/`agency_ro`). Erreurs legacy `{'error': msg}`.
"""
import os
import time
import uuid

import jwt as pyjwt
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash

from semsar_auth import Principal, get_principal

from .db import get_db
from .models import AgencyRO, UserRO

router = APIRouter()

JWT_SECRET = os.environ.get("JWT_SECRET_KEY", "")
JWT_ALGO = "HS256"
ACCESS_TTL = int(os.environ.get("JWT_ACCESS_TTL", "3600"))       # 1 h (comme le monolithe)
REFRESH_TTL = int(os.environ.get("JWT_REFRESH_TTL", "2592000"))  # 30 j


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


async def _json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def _features(db: Session, agency_id: int | None) -> list[str]:
    if not agency_id:
        return []
    ag = db.get(AgencyRO, agency_id)
    return list(ag.features or []) if ag else []


def _claims(db: Session, user: UserRO) -> dict:
    return {
        "agency_id": user.agency_id,
        "is_superadmin": any(r.slug == "superadmin" for r in user.roles),
        "account_role": user.account_role,
        "features": _features(db, user.agency_id),
    }


def _token(sub: str, ttl: int, token_type: str, extra: dict | None = None) -> str:
    now = int(time.time())
    payload = {
        "fresh": False, "iat": now, "jti": uuid.uuid4().hex, "type": token_type,
        "sub": str(sub), "nbf": now, "csrf": uuid.uuid4().hex, "exp": now + ttl,
    }
    if extra:
        payload.update(extra)
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _login_blocked(db: Session, user: UserRO) -> str | None:
    """Reproduit `is_login_blocked` du monolithe (mêmes messages)."""
    if user.deleted_at is not None:
        return "Ce compte a été supprimé."
    if user.is_suspended:
        return user.suspended_reason or "Ce compte a été suspendu."
    if user.agency_id:
        ag = db.get(AgencyRO, user.agency_id)
        if ag is not None:
            if ag.is_deleted:
                return "L'agence de ce compte a été supprimée."
            if ag.is_suspended:
                return ag.suspended_reason or "L'agence de ce compte a été suspendue."
    return None


@router.post("/auth/login")
async def login(request: Request, db: Session = Depends(get_db)):
    data = await _json(request)
    if not data.get("email") or not data.get("password"):
        return _err("Email and password are required", 400)
    user = db.query(UserRO).filter(UserRO.email == data["email"]).first()
    if not user or not check_password_hash(user.password_hash, data["password"]):
        return _err("Invalid email or password", 401)
    if not user.is_active:
        return _err("Account is deactivated", 403)
    blocked = _login_blocked(db, user)
    if blocked:
        return _err(blocked, 403)
    from datetime import datetime
    user.last_login = datetime.utcnow()
    db.commit()
    claims = _claims(db, user)
    return {
        "user": user.to_dict(),
        "access_token": _token(user.id, ACCESS_TTL, "access", claims),
        "refresh_token": _token(user.id, REFRESH_TTL, "refresh"),
    }


@router.get("/auth/me")
def me(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = int(principal.sub) if principal.sub and principal.sub.isdigit() else None
    user = db.get(UserRO, uid) if uid else None
    if not user:
        return _err("User not found", 404)
    return {"user": user.to_dict()}


@router.post("/auth/refresh")
async def refresh(request: Request, db: Session = Depends(get_db)):
    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth[:7].lower() == "bearer " else auth
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except pyjwt.PyJWTError:
        return _err("Invalid token", 401)
    if payload.get("type") != "refresh":
        return _err("Only refresh tokens are allowed", 422)
    uid = payload.get("sub")
    user = db.get(UserRO, int(uid)) if uid and str(uid).isdigit() else None
    if not user:
        return _err("User not found", 404)
    blocked = _login_blocked(db, user)
    if blocked:
        return _err(blocked, 403)
    return {"access_token": _token(user.id, ACCESS_TTL, "access", _claims(db, user))}
