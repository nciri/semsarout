"""Service identity — 1ᵉʳ service extrait (validation du flux bout-en-bout).

Démonstration : une mutation métier (demande de vérification CIN) écrit son
événement dans l'**outbox** DANS LA MÊME TRANSACTION, puis un relais le publie sur
RabbitMQ (`identity.kyc.requested`). Le BFF route `/api/v1/identity/*` vers ce service.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header
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

from . import accounts, auth, events, rbac, team
from .db import get_db, init_db
from .models import KycVerification

# Rôles autorisés à consulter la KYC d'autrui (agents de conformité / admins).
_KYC_REVIEWER_ROLES = {"admin", "kyc_reviewer"}


def _user_id(principal: Principal) -> int:
    try:
        return int(principal.sub)
    except (TypeError, ValueError) as exc:
        raise unauthorized("Sujet du jeton invalide.") from exc

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


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
def internal_users(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)) -> dict:
    """Dump léger de tous les comptes users (super-admin `/admin/accounts`) — agrégé par analytics."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from .models import UserRO
    rows = db.query(UserRO).all()
    return {"users": [{"id": u.id, "name": u.full_name, "email": u.email,
                       "status": _mod_state(u),
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
