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

from .auth import PartnerCtx, PartnerForbidden, partner_ctx
from .db import get_db, init_db
from .models import Partner

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


app.include_router(router)
