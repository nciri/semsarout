"""Router auth d'identity — **émission des JWT** (login/me/refresh), à parité avec le monolithe.

identity devient l'émetteur des jetons : il forge des JWT compatibles flask-jwt-extended
(même secret HS256, même structure) avec les **claims d'identité** embarqués, à partir de sa
projection compte (`user_ro`/`role_ro`/`agency_ro`). Erreurs legacy `{'error': msg}`.
"""
import os
import time
import uuid

from datetime import datetime

import jwt as pyjwt
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from semsar_auth import Principal, get_principal
from semsar_events import enqueue

from . import audit
from .db import get_db
from .models import AgencyRO, UserRO

_VALID_INTERESTS = {"vente", "mise-en-location", "gestion-locative", "courte-duree", "estimation", "autre"}


def _user_event_doc(u: UserRO) -> dict:
    """Payload user.* (toutes les colonnes de public.users) pour resync du monolithe."""
    def iso(v):
        return v.isoformat() if v else None
    return {
        "id": u.id, "email": u.email, "tenant": u.tenant, "password_hash": u.password_hash,
        "first_name": u.first_name, "last_name": u.last_name, "phone": u.phone,
        "avatar_url": u.avatar_url, "user_type": u.user_type, "account_role": u.account_role,
        "interest": u.interest, "is_active": u.is_active, "is_verified": u.is_verified,
        "created_at": iso(u.created_at), "last_login": iso(u.last_login),
        "is_suspended": bool(u.is_suspended), "suspended_at": iso(u.suspended_at),
        "suspended_reason": u.suspended_reason, "deleted_at": iso(u.deleted_at),
        "anonymized_at": iso(u.anonymized_at), "dashboard_config": u.dashboard_config,
        "agency_id": u.agency_id, "team_id": u.team_id,
        "role_ids": [r.id for r in u.roles],  # resync public.user_roles côté monolithe
    }

router = APIRouter()

JWT_SECRET = os.environ.get("JWT_SECRET_KEY", "")
JWT_ALGO = "HS256"
ACCESS_TTL = int(os.environ.get("JWT_ACCESS_TTL", "3600"))       # 1 h (comme le monolithe)
REFRESH_TTL = int(os.environ.get("JWT_REFRESH_TTL", "2592000"))  # 30 j


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


_KNOWN_TENANTS = {"semsar", "m3a-l3achrane"}


def _tenant(request: Request) -> str:
    """Tenant de la requête, posé par le BFF (x-semsar-tenant). Défaut : semsar."""
    t = request.headers.get("x-semsar-tenant", "semsar")
    return t if t in _KNOWN_TENANTS else "semsar"


async def _json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def _features(db: Session, agency_id: int | None) -> list[str]:
    """Features (entitlements de plan) de l'agence, source des claims JWT. Repli auto-réparateur :
    si la projection locale (`AgencyRO.features_synced_at`) n'a JAMAIS été renseignée, interroge
    billing directement — nécessaire pour tout abonnement déjà actif avant l'ajout de la
    projection événementielle (aucun événement ne sera rejoué pour lui). Best-effort, ne doit
    jamais faire échouer le login.

    `features_synced_at` (pas `features` seul) est le marqueur : une agence dont le plan
    n'accorde légitimement AUCUNE feature a `features == []` en régime permanent, et ce repli
    ne doit se déclencher qu'une fois pour elle — pas à chaque login et chaque /auth/refresh,
    pour toujours (I7)."""
    if not agency_id:
        return []
    ag = db.get(AgencyRO, agency_id)
    # Échéance dépassée : la période payée d'un abonnement résilié est terminée, donc la
    # projection ne dit plus la vérité. Elle est traitée comme non synchronisée, ce qui
    # réinterroge billing une fois — et cet appel est justement ce qui déclenche enfin
    # `_reconcile_expired` côté billing, qu'aucun balayage n'appelait (A3).
    expired = ag is not None and ag.features_until is not None and ag.features_until <= datetime.utcnow()
    if ag and ag.features_synced_at is not None and not expired:
        return list(ag.features)
    from . import billing_client
    answer = billing_client.features_of(agency_id)
    if answer is None:
        # L'appel n'a pas abouti (billing injoignable, délai dépassé, 5xx) : on ne sait RIEN des
        # droits de l'agence. Ne rien persister et surtout ne pas estampiller
        # `features_synced_at` — sinon ce repli, seul chemin capable de réparer la projection,
        # s'éteint définitivement sur une simple panne de facturation (et notamment pendant la
        # fenêtre où deploy-remote.sh a redémarré le mesh mais pas encore joué les migrations de
        # facturation). Le login continue, avec la projection locale telle quelle — SAUF si
        # son échéance est dépassée : une panne de facturation ne doit jamais prolonger un
        # droit échu, sans quoi une agence résiliée resterait entitlée aussi longtemps que
        # billing est indisponible. La résiliation porte sur tout, le module payant compris :
        # l'échéance l'emporte sur l'indisponibilité.
        if expired:
            return []
        return list(ag.features or []) if ag is not None else []
    features = answer["features"]
    if ag is not None:
        # Appel abouti — y compris quand il renvoie une liste vide, ce qui est légitime pour une
        # offre gratuite : on estampille, et le prochain login ne rappellera plus billing (I7).
        ag.features = features  # auto-répare la projection pour les prochains logins
        ag.features_synced_at = datetime.utcnow()
        ag.features_until = answer["until"]
        db.commit()
    return features


def _claims(db: Session, user: UserRO) -> dict:
    return {
        "agency_id": user.agency_id,
        "is_superadmin": any(r.slug == "superadmin" for r in user.roles),
        "account_role": user.account_role,
        "features": _features(db, user.agency_id),
        "tenant": user.tenant,
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
    user = db.query(UserRO).filter(UserRO.email == data["email"],
                                   UserRO.tenant == _tenant(request)).first()
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
        "refresh_token": _token(user.id, REFRESH_TTL, "refresh", {"tenant": user.tenant}),
    }


@router.get("/auth/me")
def me(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = int(principal.sub) if principal.sub and principal.sub.isdigit() else None
    user = db.get(UserRO, uid) if uid else None
    if not user:
        return _err("User not found", 404)
    # `features` accompagne le profil : le front en a besoin pour n'afficher les
    # entrées d'un module (conception 3D…) qu'aux comptes qui y ont droit. Même
    # source que les claims du jeton, pour qu'un rafraîchissement de profil ne
    # puisse pas contredire la passerelle.
    return {"user": {**user.to_dict(), "features": _features(db, user.agency_id)}}


@router.post("/auth/register", status_code=201)
async def register(request: Request, db: Session = Depends(get_db)):
    data = await _json(request)
    for field in ("email", "password", "first_name", "last_name"):
        if not data.get(field):
            return _err(f"{field} is required", 400)
    tenant = _tenant(request)
    if db.query(UserRO).filter(UserRO.email == data["email"], UserRO.tenant == tenant).first():
        return _err("Email already registered", 409)
    interest = data.get("interest") if data.get("interest") in _VALID_INTERESTS else None
    user = UserRO(
        email=data["email"], password_hash=generate_password_hash(data["password"]),
        first_name=data["first_name"], last_name=data["last_name"], phone=data.get("phone"),
        user_type=data.get("user_type", "particular"), account_role="buyer",
        interest=interest, is_active=True, is_verified=False, created_at=datetime.utcnow(),
        tenant=tenant,
    )
    db.add(user)
    db.flush()  # obtenir l'id
    enqueue(db, "user", user.id, "user.created", _user_event_doc(user))
    db.commit()
    claims = _claims(db, user)
    return {
        "message": "User registered successfully", "user": user.to_dict(),
        "access_token": _token(user.id, ACCESS_TTL, "access", claims),
        "refresh_token": _token(user.id, REFRESH_TTL, "refresh", {"tenant": user.tenant}),
    }


def _current(principal: Principal, db: Session) -> UserRO | None:
    uid = int(principal.sub) if principal.sub and principal.sub.isdigit() else None
    return db.get(UserRO, uid) if uid else None


@router.put("/auth/me")
async def update_me(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user = _current(principal, db)
    if not user:
        return _err("User not found", 404)
    data = await _json(request)
    for field in ("first_name", "last_name", "phone", "avatar_url"):
        if field in data:
            setattr(user, field, data[field])
    enqueue(db, "user", user.id, "user.updated", _user_event_doc(user))
    db.commit()
    return {"user": user.to_dict()}


@router.delete("/auth/me")
async def delete_me(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user = _current(principal, db)
    if not user:
        return _err("User not found", 404)
    data = await _json(request)
    if not data.get("password") or not check_password_hash(user.password_hash, data["password"]):
        return _err("Mot de passe requis pour confirmer la suppression", 401)
    user.is_active = False
    user.email = f"deleted-{user.id}-{user.email}"
    enqueue(db, "user", user.id, "user.updated", _user_event_doc(user))
    db.commit()
    return {"message": "Compte supprimé"}


# Config des widgets du tableau de bord (portée depuis backoffice/analytics.py du monolithe).
# Stockée sur le compte (dashboard_config) → identity en est propriétaire.
_WIDGET_IDS = ["financial", "pipeline", "hot_leads", "listings", "market", "team_seats",
               "subscription", "alerts"]
_DEFAULT_WIDGETS = [{"id": wid, "order": i, "hidden": False} for i, wid in enumerate(_WIDGET_IDS)]


@router.get("/backoffice/dashboard/config")
def get_dashboard_config(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user = _current(principal, db)
    if not user:
        return _err("User not found", 404)
    return user.dashboard_config or {"widgets": _DEFAULT_WIDGETS}


@router.put("/backoffice/dashboard/config")
async def put_dashboard_config(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user = _current(principal, db)
    if not user:
        return _err("User not found", 404)
    data = await _json(request)
    widgets = data.get("widgets", [])
    if not isinstance(widgets, list):
        return _err("widgets doit être une liste", 400)
    for w in widgets:
        if not isinstance(w, dict) or w.get("id") not in _WIDGET_IDS:
            bad = w if not isinstance(w, dict) else w.get("id")
            return _err(f"Widget invalide : {bad}", 400)
    user.dashboard_config = {"widgets": widgets}
    enqueue(db, "user", user.id, "user.updated", _user_event_doc(user))
    db.commit()
    return user.dashboard_config


@router.post("/auth/change-password")
async def change_password(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user = _current(principal, db)
    if not user:
        return _err("User not found", 404)
    data = await _json(request)
    if not data.get("current_password") or not data.get("new_password"):
        return _err("Current and new password are required", 400)
    if not check_password_hash(user.password_hash, data["current_password"]):
        return _err("Current password is incorrect", 401)
    user.password_hash = generate_password_hash(data["new_password"])
    enqueue(db, "user", user.id, "user.updated", _user_event_doc(user))
    db.commit()
    return {"message": "Password changed successfully"}


@router.post("/auth/forgot-password")
async def forgot_password(request: Request, db: Session = Depends(get_db)):
    """Demande de réinitialisation (parité `auth.py:forgot_password`). Réponse générique
    (anti-énumération). Stocke le SHA256 du jeton + expiration 1 h. Pas d'envoi email (comme le
    monolithe : provider non configuré ; le lien n'est journalisé qu'en dev)."""
    import hashlib
    import secrets
    from datetime import timedelta
    data = await _json(request)
    email = (data.get("email") or "").strip().lower()
    generic = {"message": "Si un compte existe avec cet email, un lien de réinitialisation a été envoyé."}
    if not email:
        return _err("Email requis", 400)
    user = db.query(UserRO).filter(UserRO.email == email,
                                   UserRO.tenant == _tenant(request)).first()
    if user is None:
        return generic  # ne révèle pas l'existence du compte
    token = secrets.token_urlsafe(32)
    user.reset_token = hashlib.sha256(token.encode()).hexdigest()
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    # notification consomme cet événement → envoie le mail avec le lien. Le jeton BRUT ne transite
    # que sur le bus interne (jamais renvoyé au client). SHA256 seul est stocké en base.
    enqueue(db, "user", user.id, "identity.password_reset", {
        "user_id": user.id, "email": user.email,
        "name": (user.first_name or "").strip(), "token": token,
    })
    db.commit()
    return generic


@router.post("/auth/reset-password")
async def reset_password(request: Request, db: Session = Depends(get_db)):
    """Réinitialise le mot de passe via un jeton valide (parité `auth.py:reset_password`)."""
    import hashlib
    data = await _json(request)
    token = data.get("token")
    new_password = data.get("new_password")
    if not token or not new_password:
        return _err("Token et nouveau mot de passe requis", 400)
    if len(new_password) < 8:
        return _err("Le mot de passe doit contenir au moins 8 caractères", 400)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    user = db.query(UserRO).filter(UserRO.reset_token == token_hash).first()
    if user is None or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        return _err("Lien de réinitialisation invalide ou expiré", 400)
    user.password_hash = generate_password_hash(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    enqueue(db, "user", user.id, "user.updated", _user_event_doc(user))
    db.commit()
    return {"message": "Mot de passe réinitialisé avec succès"}


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
    if user.tenant != _tenant(request):
        return _err("Tenant mismatch", 403)
    blocked = _login_blocked(db, user)
    if blocked:
        return _err(blocked, 403)
    return {"access_token": _token(user.id, ACCESS_TTL, "access", _claims(db, user))}


# Impersonation super-admin — émet un JWT complet AU NOM d'un autre compte (30 min), avec le
# claim `impersonated_by`. identity possède l'émission des jetons ; parité exacte du monolithe
# (`admin/impersonation.py`). Audit via `audit.logged`. Le BFF route `.../impersonate` ici.
_IMPERSONATE_TTL = 1800  # 30 min (comme le monolithe)


@router.post("/admin/accounts/users/{user_id}/impersonate")
def impersonate(user_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return _err("Super-admin access required", 403)
    target = db.get(UserRO, user_id)
    if target is None:
        return _err("User not found", 404)
    if target.deleted_at is not None:
        return _err("Compte supprimé : impersonation impossible.", 403)
    if target.is_suspended:
        return _err("Compte suspendu : impersonation impossible.", 403)
    if any(r.slug == "superadmin" for r in target.roles):
        return _err("Impossible de se faire passer pour un super-admin.", 409)
    actor = int(principal.sub) if principal.sub and principal.sub.isdigit() else None
    token = _token(target.id, _IMPERSONATE_TTL, "access",
                   {**_claims(db, target), "impersonated_by": actor})
    audit.emit(db, actor_id=actor, action="impersonate_start", entity_type="user",
               entity_id=target.id, agency_id=target.agency_id)
    db.commit()
    return {"access_token": token, "user": target.to_dict()}
