"""Service geo — positionnement prix + référentiel prix/m² par quartier.

Reproduit à l'identique les routes du monolithe consommées par le front :
`GET /properties/{id}/price-position` (public) et l'admin
`/market/neighborhood-prices` (CRUD, super-admin). **Erreurs legacy `{'error': msg}`**.
Le positionnement s'appuie sur une projection locale des biens (`listing_ro`), maintenue
par les événements `listing.*` (worker) — aucun appel synchrone inter-service.
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import forbidden, get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from . import estimate as estimation
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
    """Références de prix par quartier — agrégats marché (analytics) et fourchettes de la page
    Biens du back-office (listing), d'où le type de bien et les bornes."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    rows = db.query(NeighborhoodPriceRef).all()
    return {"refs": [{k: r.to_dict()[k] for k in ("city", "neighborhood", "property_type", "transaction_type",
                                                   "avg_price_sqm", "min_price_sqm", "max_price_sqm")}
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


# ---- Estimation d'un bien (back-office agence) ----
# Mêmes valeurs que le référentiel du front (`constants/property.js`) et que les biens déjà
# en base : un type refusé ici serait un type que l'agence ne peut pas estimer.
PROPERTY_TYPES = {"apartment", "house", "villa", "riad", "land", "commercial", "office",
                  "garage"}
TRANSACTION_TYPES = {"sale", "rent"}
SURFACE_MIN, SURFACE_MAX = 5, 100_000   # au-delà, c'est une faute de frappe, pas un bien


def _int_or_none(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else None


@app.post("/market/estimate")
async def estimate_property(request: Request, _principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    """Estime un bien à partir de ses caractéristiques, sans qu'il soit publié.

    Réservé aux comptes connectés : c'est un outil de l'agence face à son vendeur, et la
    valeur du parc d'un quartier n'a pas à être interrogeable anonymement en masse.
    """
    data = await request.json()
    city = (data.get("city") or "").strip()
    property_type = (data.get("property_type") or "").strip()
    transaction_type = (data.get("transaction_type") or "sale").strip()
    if not city:
        return _err("La ville est requise.", 400)
    if property_type not in PROPERTY_TYPES:
        return _err("Type de bien inconnu.", 400)
    if transaction_type not in TRANSACTION_TYPES:
        return _err("Type de transaction inconnu.", 400)
    try:
        surface = float(data.get("surface"))
    except (TypeError, ValueError):
        return _err("La surface est requise.", 400)
    if not SURFACE_MIN <= surface <= SURFACE_MAX:
        return _err(f"Surface attendue entre {SURFACE_MIN} et {SURFACE_MAX} m².", 400)

    features = data.get("features")
    return estimation.estimate(
        db,
        city=city,
        neighborhood=(data.get("neighborhood") or "").strip() or None,
        property_type=property_type,
        transaction_type=transaction_type,
        surface=surface,
        condition=data.get("condition"),
        floor=_int_or_none(data.get("floor")),
        total_floors=_int_or_none(data.get("total_floors")),
        has_elevator=bool(data.get("has_elevator")),
        construction_year=_int_or_none(data.get("construction_year")),
        features=features if isinstance(features, list) else [],
        current_year=datetime.utcnow().year,
    )


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
