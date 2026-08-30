"""Service identity — 1ᵉʳ service extrait (validation du flux bout-en-bout).

Démonstration : une mutation métier (demande de vérification CIN) écrit son
événement dans l'**outbox** DANS LA MÊME TRANSACTION, puis un relais le publie sur
RabbitMQ (`identity.kyc.requested`). Le BFF route `/api/v1/identity/*` vers ce service.
"""
import json as _json
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import (
    forbidden,
    get_settings,
    install_error_handlers,
    not_found,
    setup_logging,
    setup_tracing,
    unauthorized,
)
from semsar_events import enqueue

from . import accounts, auth, didit_client, events, rbac, team
from .db import get_db, init_db
from .models import KycVerification

_WEBHOOK_SECRET = os.environ.get("DIDIT_WEBHOOK_SECRET", "")
_DECISION_MAP = {"Approved": "verified", "Declined": "rejected", "Abandoned": "rejected"}
_TERMINAL_KYC = {"verified", "rejected"}

# Rôles autorisés à consulter la KYC d'autrui (agents de conformité / admins).
_KYC_REVIEWER_ROLES = {"admin", "kyc_reviewer"}


def _user_id(principal: Principal) -> int:
    try:
        return int(principal.sub)
    except (TypeError, ValueError) as exc:
        raise unauthorized("Sujet du jeton invalide.") from exc

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

if not _WEBHOOK_SECRET:
    import logging
    logging.getLogger("semsar-service").warning(
        "DIDIT_WEBHOOK_SECRET non configuré — le webhook KYC rejettera TOUTES les requêtes "
        "(fail-closed, aucune vérification KYC ne pourra être appliquée via Didit tant que "
        "ce secret n'est pas défini)."
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# Auth (émission des JWT) + RBAC lecture — routes legacy `{'error'}`, à part du KYC (RFC 9457).
app.include_router(auth.router)
app.include_router(rbac.router)
app.include_router(team.router)
app.include_router(accounts.router)  # modération de compte utilisateur (délégué par trust-safety)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/internal/agency/{agency_id}/seats", include_in_schema=False)
def internal_agency_seats(agency_id: int, x_internal_token: str = Header(default=""),
                          db: Session = Depends(get_db)) -> dict:
    """Décompte sièges/équipes d'une agence — pour le garde-fou de rétrogradation de plan
    (service billing). identity est propriétaire des membres/équipes (v2-native, pas le monolithe)."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from . import seats
    from .models import AgencyRO
    ag = db.get(AgencyRO, agency_id)
    if ag is None:
        return {"active_member_seats": 0, "teams_used": 0, "member_count": 0,
                "seats_used": 0, "seats_limit": 0}
    return {"active_member_seats": seats.active_member_seats(db, ag),
            "teams_used": seats.teams_used(db, ag), "member_count": seats.member_count(db, ag),
            "seats_used": seats.seats_used(db, ag), "seats_limit": seats.seats_limit(ag)}


@app.get("/internal/agency/{agency_id}/members", include_in_schema=False)
def internal_agency_members(agency_id: int, active_only: int = 0, x_internal_token: str = Header(default=""),
                            db: Session = Depends(get_db)) -> dict:
    """Membres d'une agence (dicts complets, parité `User.to_dict`) — pour `/my-agency` (agency) et
    la résolution de noms (users_client de crm/transactions/contract). `active_only=1` → uniquement
    les comptes actifs (parité `/internal/agency/users` du monolithe). identity possède les comptes."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from .models import UserRO
    q = db.query(UserRO).filter(UserRO.agency_id == agency_id)
    if active_only:
        q = q.filter(UserRO.is_active.is_(True))
    members = q.order_by(UserRO.id).all()
    return {"members": [m.to_dict() for m in members]}


@app.get("/internal/agency/{agency_id}/analytics-scope", include_in_schema=False)
def internal_analytics_scope(agency_id: int, user_id: int, x_internal_token: str = Header(default=""),
                             db: Session = Depends(get_db)) -> dict:
    """Portée analytics (parité `analytics_scope`) : agence entière si propriétaire de l'agence ou
    permission `analytics.view_all` ; sinon cloisonné à l'agent. identity possède comptes/rôles."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from .models import AgencyRO, UserRO
    ag = db.get(AgencyRO, agency_id)
    user = db.get(UserRO, user_id)
    cfg = user.dashboard_config if user is not None else None
    all_ = bool(
        (ag is not None and ag.owner_id and ag.owner_id == user_id)
        or (user is not None and any(
            any(p.slug == "analytics.view_all" for p in r.permissions) for r in user.roles))
    )
    return {"all": all_, "agent_id": None if all_ else user_id, "dashboard_config": cfg}


def _mod_state(u) -> str:
    return "deleted" if u.deleted_at else ("suspended" if u.is_suspended else "active")


@app.get("/internal/users", include_in_schema=False)
def internal_users(tenant: str | None = None, x_internal_token: str = Header(default=""),
                   db: Session = Depends(get_db)) -> dict:
    """Dump léger des comptes users (super-admin `/admin/accounts`) — agrégé par analytics.

    `tenant` optionnel : filtre `UserRO.tenant` (parité `/internal/users/stats`). Absent →
    comportement historique (tous tenants), pour ne pas casser les appelants existants."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from .models import UserRO
    q = db.query(UserRO)
    if tenant:
        q = q.filter(UserRO.tenant == tenant)
    rows = q.all()
    return {"users": [{"id": u.id, "name": u.full_name, "email": u.email,
                       "tenant": u.tenant, "status": _mod_state(u),
                       "account_role": u.account_role, "user_type": u.user_type,
                       "is_verified": bool(u.is_verified),
                       "created_at": u.created_at.isoformat() if u.created_at else None,
                       "last_login": u.last_login.isoformat() if u.last_login else None}
                      for u in rows]}


@app.get("/internal/user/{user_id}", include_in_schema=False)
def internal_user_detail(user_id: int, x_internal_token: str = Header(default=""),
                         db: Session = Depends(get_db)):
    """Détail d'un compte user (`to_dict` complet + agency_id) — pour `/admin/accounts/users/{id}`."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from .models import UserRO
    u = db.get(UserRO, user_id)
    if u is None:
        return {"user": None}
    return {"user": u.to_dict(), "agency_id": u.agency_id}


@app.get("/internal/users/stats", include_in_schema=False)
def internal_users_stats(tenant: str | None = None, x_internal_token: str = Header(default=""),
                         db: Session = Depends(get_db)) -> dict:
    """Compteurs users plateforme (super-admin overview) — agrégés par analytics. identity possède
    les comptes (parité des sous-comptes de `admin/overview.py`).

    `tenant` optionnel : filtre `UserRO.tenant` (m3a-l3achrane vs semsar). Absent → comportement
    historique (tous tenants confondus), pour ne pas casser les appelants existants."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from datetime import datetime, timedelta

    from .models import UserRO
    since = datetime.utcnow() - timedelta(days=30)

    def _scoped(q):
        return q.filter(UserRO.tenant == tenant) if tenant else q

    return {
        "total_users": _scoped(db.query(UserRO)).filter(UserRO.deleted_at.is_(None)).count(),
        "signups_last_30d": _scoped(db.query(UserRO)).filter(UserRO.created_at >= since).count(),
        "suspended_users": _scoped(db.query(UserRO)).filter(UserRO.is_suspended.is_(True)).count(),
        "deleted_pending_users": _scoped(db.query(UserRO)).filter(
            UserRO.deleted_at.isnot(None), UserRO.anonymized_at.is_(None)).count(),
    }


@app.get("/internal/user/{user_id}/phone", include_in_schema=False)
def internal_user_phone(user_id: int, x_internal_token: str = Header(default=""),
                        db: Session = Depends(get_db)) -> dict:
    """Téléphone d'un utilisateur (propriétaire d'un bien) — pour reveal-phone côté listing."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from .models import UserRO
    u = db.get(UserRO, user_id)
    return {"phone": u.phone if u else None}


class KycRequest(BaseModel):
    cin: str


@app.post("/identity/kyc", status_code=201)
def request_kyc(
    body: KycRequest,
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
) -> dict:
    # L'identité vient du jeton vérifié, jamais du corps de la requête (anti-IDOR).
    user_id = _user_id(principal)
    record = KycVerification(user_id=user_id, cin=body.cin, status="pending")
    db.add(record)
    db.flush()  # obtient l'id sans commit
    # Événement écrit dans la MÊME transaction que la donnée (outbox) :
    enqueue(
        db,
        aggregate_type="kyc_verification",
        aggregate_id=record.id,
        event_type=events.KYC_REQUESTED,
        payload={"user_id": user_id, "cin_last4": body.cin[-4:]},
    )
    db.commit()
    return {"id": record.id, "status": record.status}


@app.get("/identity/kyc/{kyc_id}")
def get_kyc(
    kyc_id: int,
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
) -> dict:
    record = db.get(KycVerification, kyc_id)
    if record is None:
        raise not_found("Vérification introuvable.")
    # Seul le propriétaire (ou un réviseur/super-admin) peut consulter (anti-IDOR).
    is_reviewer = principal.is_superadmin or bool(_KYC_REVIEWER_ROLES & set(principal.roles))
    if record.user_id != _user_id(principal) and not is_reviewer:
        raise forbidden("Accès non autorisé à cette vérification.")
    return {"id": record.id, "user_id": record.user_id, "status": record.status}


def _kyc_to_dict(record: KycVerification, user) -> dict:
    return {
        "id": record.id, "user_id": record.user_id, "status": record.status,
        "cin_last4": record.cin[-4:] if record.cin else None,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "full_name": user.full_name if user is not None else None,
        "email": user.email if user is not None else None,
    }


@app.get("/internal/kyc/queue", include_in_schema=False)
def internal_kyc_queue(tenant: str | None = None, x_internal_token: str = Header(default=""),
                       db: Session = Depends(get_db)) -> dict:
    """File de vérification KYC en attente (statut `pending`), cloisonnée tenant via jointure
    `UserRO.tenant` — alimente la vue back-office Vérifications (fan-out BFF super-admin)."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from .models import UserRO
    q = (
        db.query(KycVerification, UserRO)
        .join(UserRO, UserRO.id == KycVerification.user_id)
        .filter(KycVerification.status == "pending")
    )
    if tenant:
        q = q.filter(UserRO.tenant == tenant)
    rows = q.order_by(KycVerification.created_at.asc()).all()
    return {"items": [_kyc_to_dict(record, user) for record, user in rows]}


def _resolve_kyc(db: Session, kyc_id: int, x_internal_token: str) -> KycVerification | None:
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    return db.get(KycVerification, kyc_id)


def _apply_kyc_decision(db: Session, record: KycVerification, decision: str) -> None:
    """decision ∈ 'verified'|'rejected'. Ne touche `UserRO.is_verified` que sur 'verified'
    (un rejet n'annule pas une vérification déjà acquise ailleurs — parité comportement
    historique). Réutilisée par le repli manuel admin ET le flux Didit (session/webhook/pull)."""
    from .models import UserRO
    record.status = decision
    user = db.get(UserRO, record.user_id)
    if decision == "verified" and user is not None:
        user.is_verified = True
    if decision == "verified":
        enqueue(db, aggregate_type="kyc_verification", aggregate_id=record.id,
               event_type=events.KYC_VERIFIED, payload={"user_id": record.user_id})


@app.post("/internal/kyc/{kyc_id}/verify", include_in_schema=False)
def internal_kyc_verify(kyc_id: int, x_internal_token: str = Header(default=""),
                        db: Session = Depends(get_db)) -> dict:
    """Valide une vérification KYC : passe la file en `verified` + marque le compte vérifié
    (`UserRO.is_verified`). Jeton interne (le BFF a déjà vérifié superadmin/kyc_reviewer)."""
    record = _resolve_kyc(db, kyc_id, x_internal_token)
    if record is None:
        raise not_found("Vérification introuvable.")
    from .models import UserRO
    _apply_kyc_decision(db, record, "verified")
    user = db.get(UserRO, record.user_id)
    db.commit()
    return _kyc_to_dict(record, user)


@app.post("/internal/kyc/{kyc_id}/reject", include_in_schema=False)
def internal_kyc_reject(kyc_id: int, x_internal_token: str = Header(default=""),
                        db: Session = Depends(get_db)) -> dict:
    """Refuse une vérification KYC : passe la file en `rejected` (ne touche pas
    `UserRO.is_verified` — un refus n'annule pas une vérification déjà acquise ailleurs)."""
    record = _resolve_kyc(db, kyc_id, x_internal_token)
    if record is None:
        raise not_found("Vérification introuvable.")
    from .models import UserRO
    _apply_kyc_decision(db, record, "rejected")
    user = db.get(UserRO, record.user_id)
    db.commit()
    return _kyc_to_dict(record, user)


@app.post("/identity/kyc/session", status_code=201)
def create_kyc_session(principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)) -> dict:
    """Crée une session Didit hébergée et renvoie l'URL de redirection. Remplace la saisie
    manuelle du CIN (`POST /identity/kyc`) comme chemin principal — celui-ci reste en repli."""
    user_id = _user_id(principal)
    try:
        session = didit_client.create_session(vendor_data=str(user_id))
    except didit_client.DiditUnavailable:
        return JSONResponse({"error": "Service de vérification indisponible."}, status_code=502)
    record = KycVerification(user_id=user_id, cin=None, status="pending",
                             didit_session_id=session["session_id"])
    db.add(record)
    db.commit()
    return {"id": record.id, "status": record.status, "url": session["url"]}


def _apply_didit_payload(db: Session, session_id: str, decision_payload: dict):
    """Résout la session par `didit_session_id`, applique la décision si pas déjà terminale
    (anti-rejeu). Renvoie `(record | None, applied: bool)`."""
    record = db.query(KycVerification).filter(
        KycVerification.didit_session_id == session_id).order_by(
        KycVerification.id.desc()).first()
    if record is None:
        return None, False
    if record.status in _TERMINAL_KYC:
        return record, False
    status = decision_payload.get("status")
    decision = _DECISION_MAP.get(status)
    record.decision = decision_payload
    if decision is not None:
        _apply_kyc_decision(db, record, decision)
    return record, decision is not None


@app.post("/identity/kyc/webhook", include_in_schema=False)
async def kyc_webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    """Réception des événements Didit (`status.updated`). Public (pas de jeton utilisateur) :
    la signature `X-Signature-V2` fait foi, comme le webhook paiement (`services/payment`)."""
    raw = await request.body()
    sig = request.headers.get("x-signature-v2", "")
    if not didit_client.verify_signature(raw, sig, secret=_WEBHOOK_SECRET):
        raise unauthorized("Signature invalide.")
    payload = _json.loads(raw) if raw else {}
    session_id = payload.get("session_id")
    if not session_id:
        return {"ok": True}
    record, _applied = _apply_didit_payload(db, session_id, payload.get("decision") or {})
    if record is None:
        raise not_found("Session inconnue.")
    db.commit()
    return {"ok": True}


@app.post("/identity/kyc/{kyc_id}/refresh")
def refresh_kyc_session(kyc_id: int, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)) -> dict:
    """Filet de sécurité manuel : pull de la décision Didit si le webhook n'est jamais arrivé.
    Déclenché par le front (bouton « Actualiser mon statut »), pas de tâche planifiée."""
    record = db.get(KycVerification, kyc_id)
    if record is None:
        raise not_found("Vérification introuvable.")
    if record.user_id != _user_id(principal):
        raise forbidden("Accès non autorisé à cette vérification.")
    if record.status in _TERMINAL_KYC or not record.didit_session_id:
        return {"id": record.id, "status": record.status}
    try:
        decision_payload = didit_client.fetch_decision(record.didit_session_id)
    except didit_client.DiditUnavailable:
        return JSONResponse({"error": "Service de vérification indisponible."}, status_code=502)
    _apply_didit_payload(db, record.didit_session_id, decision_payload)
    db.commit()
    return {"id": record.id, "status": record.status}


@app.get("/internal/kyc/status/{user_id}", include_in_schema=False)
def internal_kyc_status(user_id: int, x_internal_token: str = Header(default=""),
                        db: Session = Depends(get_db)) -> dict:
    """Statut KYC le plus récent d'un utilisateur — consommé par `rental`/`selling` comme
    verrou avant signature électronique."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    record = db.query(KycVerification).filter(
        KycVerification.user_id == user_id).order_by(KycVerification.id.desc()).first()
    return {"status": record.status if record is not None else "none"}
