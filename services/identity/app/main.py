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

from . import auth, events, rbac, team
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
def internal_agency_members(agency_id: int, x_internal_token: str = Header(default=""),
                            db: Session = Depends(get_db)) -> dict:
    """Membres d'une agence (dicts complets, parité `User.to_dict`) — pour `/my-agency` du
    service agency. identity possède les comptes (v2-native, pas le monolithe)."""
    if x_internal_token != settings.internal_token:
        raise forbidden("Forbidden")
    from .models import UserRO
    members = db.query(UserRO).filter(UserRO.agency_id == agency_id).order_by(UserRO.id).all()
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
