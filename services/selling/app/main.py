"""Service selling — flux vente médiée (demande d'achat → offre → compromis e-signé)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from . import events  # noqa: F401
from .db import get_db, init_db  # noqa: F401
from .models import Compromis, Offer, ProcessedMessage, PurchaseInquiry, SignatureRequest  # noqa: F401
from .util import err, iso, json_body  # noqa: F401

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


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


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}
