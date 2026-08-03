"""Service geo — positionnement prix + référentiel prix/m² par quartier.

Reproduit à l'identique les routes du monolithe consommées par le front :
`GET /properties/{id}/price-position` (public) et l'admin
`/market/neighborhood-prices` (CRUD, super-admin). **Erreurs legacy `{'error': msg}`**.
Le positionnement s'appuie sur une projection locale des biens (`listing_ro`), maintenue
par les événements `listing.*` (worker) — aucun appel synchrone inter-service.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import forbidden, get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from . import pricing
from .db import get_db, init_db
from .models import ListingRO, NeighborhoodPriceRef

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


# Pas de handlers RFC 9457 : on reproduit les erreurs {'error': msg} du monolithe.
app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


async def _json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def require_admin(principal: Principal = Depends(get_principal)) -> Principal:
    """Réservé aux administrateurs plateforme (même message que le monolithe)."""
    if not principal.is_superadmin:
        raise forbidden("Accès réservé aux administrateurs")
    return principal


@app.get("/internal/neighborhood-prices", include_in_schema=False)
def internal_neighborhood_prices(x_internal_token: str = Header(default=""),
                                 db: Session = Depends(get_db)):
    """Références de prix par quartier — pour les agrégats marché du service analytics."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    rows = db.query(NeighborhoodPriceRef).all()
    return {"refs": [{"city": r.city, "neighborhood": r.neighborhood,
                      "avg_price_sqm": float(r.avg_price_sqm) if r.avg_price_sqm is not None else None}
                     for r in rows]}


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Positionnement prix (public) ----
@app.get("/properties/{property_id}/price-position")
def get_price_position(property_id: int, db: Session = Depends(get_db)):
    prop = db.get(ListingRO, property_id)
    if prop is None:
        return _err("Not found", 404)
    return pricing.price_position(db, prop)


# ---- Référentiel prix quartier (admin) ----
@app.get("/market/neighborhood-prices")
def list_neighborhood_prices(_admin: Principal = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    refs = (db.query(NeighborhoodPriceRef)
            .order_by(NeighborhoodPriceRef.city, NeighborhoodPriceRef.neighborhood).all())
    return {"references": [r.to_dict() for r in refs]}


@app.post("/market/neighborhood-prices", status_code=201)
async def create_neighborhood_price(request: Request, _admin: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    data = await _json(request)
    for field in ("city", "neighborhood", "transaction_type", "avg_price_sqm"):
        if not data.get(field):
            return _err(f"{field} requis", 400)
    if data["transaction_type"] not in ("sale", "rent"):
        return _err("transaction_type invalide", 400)
    ref = NeighborhoodPriceRef(
        city=data["city"].strip(),
        neighborhood=data["neighborhood"].strip(),
        property_type=data.get("property_type") or None,
        transaction_type=data["transaction_type"],
        avg_price_sqm=data["avg_price_sqm"],
        min_price_sqm=data.get("min_price_sqm") or None,
        max_price_sqm=data.get("max_price_sqm") or None,
        source=data.get("source") or "manuel",
    )
    db.add(ref)
    db.commit()
    return {"reference": ref.to_dict()}


@app.put("/market/neighborhood-prices/{ref_id}")
async def update_neighborhood_price(ref_id: int, request: Request, _admin: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    ref = db.get(NeighborhoodPriceRef, ref_id)
    if ref is None:
        return _err("Not found", 404)
    data = await _json(request)
    for field in ("city", "neighborhood", "transaction_type", "avg_price_sqm", "source"):
        if field in data and data[field]:
            setattr(ref, field, data[field])
    for field in ("property_type", "min_price_sqm", "max_price_sqm"):
        if field in data:
            setattr(ref, field, data[field] or None)
    db.commit()
    return {"reference": ref.to_dict()}


@app.delete("/market/neighborhood-prices/{ref_id}")
def delete_neighborhood_price(ref_id: int, _admin: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    ref = db.get(NeighborhoodPriceRef, ref_id)
    if ref is None:
        return _err("Not found", 404)
    db.delete(ref)
    db.commit()
    return {"message": "Référence supprimée"}
