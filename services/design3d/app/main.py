"""Service design3d — conception intérieure : plans 2D (brique 1), scènes 3D et rendus (briques 2-3).

Routes `/design3d/*` gatées par l'entitlement `design3d` (patron directory/`require_feature`).
Cloisonnement : agence → même agency_id ; sans agence → owner_id (patron listing/_bo_access).
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal, require_feature
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import DesignLevel, DesignLevelShelf, DesignProject

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)
_design3d = require_feature("design3d")


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


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and str(principal.sub).isdigit() else None


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}
