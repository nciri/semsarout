"""Service partner — portail partenaires/affiliés M3a-L3achrane.

Conventions du mesh : erreurs legacy {'error': msg}, identité via x-semsar-*
(BFF), outbox transactionnel. Toutes les routes métier exigent le tenant
m3a-l3achrane (défense en profondeur — le BFF route déjà par host/tenant).
"""
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .auth import PartnerCtx, PartnerForbidden, partner_ctx
from .db import get_db, init_db
from .models import Affilie, Partner
from .schemas import AFFILIE_STATUSES, AffilieCreateIn, AffilieUpdateIn

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

TENANT = "m3a-l3achrane"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


class _TenantForbidden(Exception):
    pass


def _require_tenant(request: Request) -> None:
    if request.headers.get("x-semsar-tenant", "semsar") != TENANT:
        raise _TenantForbidden()


@app.exception_handler(_TenantForbidden)
async def _tenant_handler(request: Request, exc: _TenantForbidden) -> JSONResponse:
    return _err("Tenant interdit", 403)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.exception_handler(PartnerForbidden)
async def _partner_forbidden_handler(request: Request, exc: PartnerForbidden) -> JSONResponse:
    return _err("Accès partenaire refusé", 403)


router = APIRouter(dependencies=[Depends(_require_tenant)])


@router.get("/partner/me")
async def get_partner_me(ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)) -> dict:
    partner = db.query(Partner).filter(Partner.id == ctx.partner_id).first()
    return partner.to_dict()


def _scoped(db, model, obj_id, ctx: PartnerCtx):
    """Renvoie l'objet seulement s'il appartient au partenaire du contexte
    courant, sinon None (→ 404). Patron réutilisé par toutes les ressources
    cloisonnées par partner_id."""
    obj = db.get(model, obj_id)
    return obj if obj is not None and obj.partner_id == ctx.partner_id else None


@router.get("/partner/affilies")
async def list_affilies(ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)) -> list:
    affilies = (
        db.query(Affilie)
        .filter(Affilie.partner_id == ctx.partner_id)
        .order_by(Affilie.created_at.desc())
        .all()
    )
    return [a.to_dict() for a in affilies]


@router.post("/partner/affilies", status_code=201)
async def create_affilie(body: AffilieCreateIn, ctx: PartnerCtx = Depends(partner_ctx),
                          db=Depends(get_db)) -> dict:
    affilie = Affilie(partner_id=ctx.partner_id, full_name=body.full_name,
                       email=body.email, external_ref=body.external_ref)
    db.add(affilie)
    db.flush()
    enqueue(db, "partner", affilie.id, events.AFFILIE_CREATED,
            {"affilie_id": affilie.id, "partner_id": ctx.partner_id,
             "full_name": affilie.full_name, "email": affilie.email})
    db.commit()
    db.refresh(affilie)
    return affilie.to_dict()


@router.patch("/partner/affilies/{affilie_id}")
async def update_affilie(affilie_id: str, body: AffilieUpdateIn,
                          ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)):
    affilie = _scoped(db, Affilie, affilie_id, ctx)
    if affilie is None:
        return _err("Affilié introuvable", 404)
    if body.status is not None:
        if body.status not in AFFILIE_STATUSES:
            return _err("Statut invalide", 422)
        affilie.status = body.status
    if body.full_name is not None:
        affilie.full_name = body.full_name
    db.commit()
    db.refresh(affilie)
    return affilie.to_dict()


app.include_router(router)
