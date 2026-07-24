"""Service analytics — API de lecture des agrégats (k-anonymisés).

Métriques plateforme : réservé aux rôles admin/analyst (le super-admin passe toujours).
Le worker (`python -m app.worker`) maintient les compteurs ; cette API les restitue.
"""
from fastapi import Depends, FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, require_roles
from semsar_common import get_settings, install_error_handlers, setup_logging, setup_tracing

from .db import SessionLocal, init_db
from .models import MetricCounter

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

app = FastAPI(title=f"SemsarOut — {settings.service_name}")
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def _startup() -> None:
    if settings.database_url:
        try:
            init_db()
        except Exception:  # noqa: BLE001
            pass


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/analytics/overview")
def overview(
    _principal: Principal = Depends(require_roles("admin", "analyst")),
    db: Session = Depends(get_db),
) -> dict:
    metrics = {row.name: row.value for row in db.query(MetricCounter).all()}
    created = metrics.get("listings.created", 0)
    deleted = metrics.get("listings.deleted", 0)
    return {
        "metrics": metrics,
        "summary": {
            "listings_net": created - deleted,
            "kyc_requested": metrics.get("kyc.requested", 0),
            "kyc_verified": metrics.get("kyc.verified", 0),
        },
    }
