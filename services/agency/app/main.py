"""Service agency — domaine agence (lecture). Reroute les routes existantes du monolithe :
`GET /agencies`, `GET /agencies/{slug}`, `GET /my-agency`. Erreurs legacy `{'error': msg}`.
`properties_count` vient d'une projection locale `listing_ro` (événements `listing.*`).
Les écritures (create/update/regenerate-api-key) restent au monolithe pour l'instant.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .db import get_db, init_db
from .models import Agency, ListingRO

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


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


def _counts(db: Session, agency_ids: list[int]) -> dict[int, int]:
    if not agency_ids:
        return {}
    rows = (db.query(ListingRO.agency_id, func.count())
            .filter(ListingRO.agency_id.in_(agency_ids))
            .group_by(ListingRO.agency_id).all())
    return dict(rows)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/agencies")
def list_agencies(request: Request, db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    q = db.query(Agency).filter(
        Agency.is_active.is_(True), Agency.is_verified.is_(True),
        Agency.is_suspended.is_(False), Agency.deleted_at.is_(None))
    if qp.get("city"):
        q = q.filter(Agency.city.ilike(f"%{qp.get('city')}%"))
    if qp.get("q"):
        q = q.filter(Agency.name.ilike(f"%{qp.get('q')}%"))
    q = q.order_by(Agency.name.asc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    counts = _counts(db, [a.id for a in items])
    return {
        "agencies": [a.to_dict(properties_count=counts.get(a.id, 0)) for a in items],
        "total": total, "pages": pages, "current_page": page,
    }


@app.get("/agencies/{slug}")
def get_agency(slug: str, db: Session = Depends(get_db)):
    agency = db.query(Agency).filter(Agency.slug == slug).first()
    if agency is None:
        return _err("Not found", 404)
    cnt = _counts(db, [agency.id]).get(agency.id, 0)
    return {"agency": agency.to_dict(properties_count=cnt)}
