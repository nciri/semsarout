"""Service listing (Stage 1) — CRUD/cycle de vie des biens (source de vérité).

Reproduit à l'identique : `GET /properties/{id}` (public, +views, **masquage des comptes
modérés**), `POST/PUT/DELETE /properties`, `/publish`, `GET /my-properties`.
La **découverte** (`GET /properties`, `/search`, `/suggestions`) reste au monolithe → Stage 2 (search).
Émet `listing.created/updated/deleted`.
"""
import math
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from statistics import median

import httpx
from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, moderation
from .db import get_db, init_db
from .models import Property, PropertyImage

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_UPDATABLE = [
    "title", "description", "property_type", "transaction_type", "price", "price_per_sqm",
    "charges", "surface", "land_surface", "rooms", "bedrooms", "bathrooms", "floor",
    "total_floors", "construction_year", "features", "energy_class", "ges_class",
    "address", "city", "neighborhood", "postal_code", "latitude", "longitude",
]
_CREATE_REQUIRED = ["title", "property_type", "transaction_type", "price", "city"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)  # Problem (require_*/get_principal) -> {'error': ...} legacy

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


def _reference() -> str:
    return f"SEM-{uuid.uuid4().hex[:8].upper()}"


def _prop_dict(db: Session, p: Property, include_images: bool = True) -> dict:
    data = {
        "id": p.id, "reference": p.reference, "title": p.title, "description": p.description,
        "property_type": p.property_type, "transaction_type": p.transaction_type,
        "price": float(p.price) if p.price is not None else None,
        "price_per_sqm": float(p.price_per_sqm) if p.price_per_sqm is not None else None,
        "charges": float(p.charges) if p.charges is not None else None,
        "surface": p.surface, "land_surface": p.land_surface, "rooms": p.rooms,
        "bedrooms": p.bedrooms, "bathrooms": p.bathrooms, "floor": p.floor,
        "total_floors": p.total_floors, "construction_year": p.construction_year,
        "features": p.features or [], "energy_class": p.energy_class, "ges_class": p.ges_class,
        "address": p.address, "city": p.city, "neighborhood": p.neighborhood,
        "postal_code": p.postal_code, "latitude": p.latitude, "longitude": p.longitude,
        "status": p.status, "is_premium": p.is_premium, "is_urgent": p.is_urgent,
        "urgent_until": p.urgent_until.isoformat() if p.urgent_until else None,
        "is_featured": p.is_featured, "views_count": p.views_count,
        "contacts_count": p.contacts_count, "favorites_count": p.favorites_count,
        "owner_id": p.owner_id, "agency_id": p.agency_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "published_at": p.published_at.isoformat() if p.published_at else None,
    }
    if include_images:
        imgs = db.query(PropertyImage).filter(PropertyImage.property_id == p.id).order_by(PropertyImage.position).all()
        data["images"] = [i.to_dict() for i in imgs]
    return data


def _event_doc(db: Session, p: Property) -> dict:
    # Doc COMPLET (+ location géo) : indexé tel quel par search → parité des réponses.
    doc = _prop_dict(db, p, include_images=True)
    doc["location"] = {"lat": p.latitude, "lon": p.longitude} if p.latitude and p.longitude else None
    return doc


def _emit(db: Session, p: Property, event_type: str) -> None:
    if event_type == events.LISTING_DELETED:
        enqueue(db, "property", p.id, event_type, {"id": p.id})
    else:
        enqueue(db, "property", p.id, event_type, _event_doc(db, p))


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/internal/properties", include_in_schema=False)
def internal_properties(request: Request, x_internal_token: str = Header(default=""),
                        db: Session = Depends(get_db)):
    """Dicts COMPLETS de biens (parité `Property.to_dict`) pour d'autres services (buyer, agency).
    `?ids=1,2,3` → liste des biens correspondants. `?agency_id=X&status=active&page&per_page` →
    biens de l'agence, masquage modération appliqué, paginé. listing possède le bien (v2-native)."""
    if x_internal_token != settings.internal_token:
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    qp = request.query_params
    if qp.get("ids"):
        ids = [int(x) for x in qp["ids"].split(",") if x.strip().isdigit()]
        props = db.query(Property).filter(Property.id.in_(ids)).all() if ids else []
        return {"properties": [_prop_dict(db, p) for p in props]}
    if qp.get("agency_id") and qp.get("all"):
        # Dump brut : TOUS les biens de l'agence (sans masquage ni pagination) — pour les agrégats
        # analytics (_prop_base du monolithe n'exclut pas les modérés).
        rows = db.query(Property).filter(Property.agency_id == int(qp["agency_id"])).all()
        # +updated_at (hors Property.to_dict) : requis par les agrégats dashboard (sold_this_month).
        return {"properties": [{**_prop_dict(db, p),
                                "updated_at": p.updated_at.isoformat() if p.updated_at else None}
                               for p in rows]}
    if qp.get("agency_id"):
        q = db.query(Property).filter(Property.agency_id == int(qp["agency_id"]))
        if qp.get("status"):
            q = q.filter(Property.status == qp["status"])
        rows = [p for p in q.order_by(Property.published_at.desc()).all()
                if not moderation.is_hidden(p.owner_id, p.agency_id)]
        page = int(qp.get("page") or 1)
        per_page = int(qp.get("per_page") or 20)
        total = len(rows)
        items = rows[(page - 1) * per_page: (page - 1) * per_page + per_page]
        return {"properties": [_prop_dict(db, p) for p in items], "total": total,
                "pages": math.ceil(total / per_page) if per_page else 1, "current_page": page}
    return {"properties": []}


# ---- Détail public (masquage modération + vues) ----
@app.get("/properties/{property_id}")
def get_property(property_id: int, db: Session = Depends(get_db)):
    p = db.get(Property, property_id)
    if p is None:
        return _err("Not found", 404)
    # Spec §6 : masquer les annonces des comptes suspendus / supprimés.
    if moderation.is_hidden(p.owner_id, p.agency_id):
        return _err("Not found", 404)
    p.views_count = (p.views_count or 0) + 1
    db.commit()
    return {"property": _prop_dict(db, p, include_images=True)}


# ---- CRUD (propriétaire) ----
@app.post("/properties", status_code=201)
async def create_property(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await _json(request)
    for field in _CREATE_REQUIRED:
        if not data.get(field):
            return _err(f"{field} is required", 400)
    p = Property(
        reference=_reference(), status="draft",
        owner_id=int(principal.sub) if principal.sub.isdigit() else None,
        agency_id=principal.agency_id,
        **{k: data.get(k) for k in _UPDATABLE},
    )
    if p.features is None:
        p.features = []
    db.add(p)
    db.flush()
    _emit(db, p, events.LISTING_CREATED)
    db.commit()
    return {"message": "Property created successfully", "property": _prop_dict(db, p)}


def _owned(db: Session, property_id: int, principal: Principal):
    p = db.get(Property, property_id)
    if p is None:
        return None, _err("Not found", 404)
    if p.owner_id != (int(principal.sub) if principal.sub.isdigit() else None):
        return None, _err("Unauthorized", 403)
    return p, None


@app.put("/properties/{property_id}")
async def update_property(property_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    p, err = _owned(db, property_id, principal)
    if err:
        return err
    data = await _json(request)
    for field in _UPDATABLE:
        if field in data:
            setattr(p, field, data[field])
    _emit(db, p, events.LISTING_UPDATED)
    db.commit()
    return {"message": "Property updated successfully", "property": _prop_dict(db, p)}


@app.delete("/properties/{property_id}")
def delete_property(property_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    p, err = _owned(db, property_id, principal)
    if err:
        return err
    _emit(db, p, events.LISTING_DELETED)
    db.delete(p)
    db.commit()
    return {"message": "Property deleted successfully"}


@app.post("/properties/{property_id}/publish")
def publish_property(property_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    p, err = _owned(db, property_id, principal)
    if err:
        return err
    p.status = "active"
    p.published_at = datetime.utcnow()
    _emit(db, p, events.LISTING_UPDATED)
    db.commit()
    return {"message": "Property published successfully", "property": _prop_dict(db, p)}


# ---- Engagement (Stage 3) : contact & reveal-phone (public) ----
# Le listing incrémente contacts_count (qu'il possède) et émet `listing.contacted` ;
# crm consomme l'événement pour créer le lead (découplage inter-domaines).
def _contact_payload(p: Property, data: dict, source: str) -> dict:
    return {
        "property_id": p.id, "agency_id": p.agency_id, "owner_id": p.owner_id,
        "name": data.get("name"), "email": data.get("email"), "phone": data.get("phone"),
        "message": data.get("message"), "source": source, "service": data.get("service"),
    }


_AGENCY_URL = os.environ.get("AGENCY_URL", "http://localhost:8512")
_IDENTITY_URL = os.environ.get("IDENTITY_URL", "http://localhost:8501")


def _fetch_contact_phone(p: Property) -> str | None:
    """Téléphone de contact (v2-native) : agence via `agency`, sinon propriétaire via `identity`.
    Le téléphone appartient aux domaines agency/identity — plus de dépendance au monolithe."""
    if p.agency_id:
        url = f"{_AGENCY_URL}/internal/agency/{p.agency_id}/phone"
    elif p.owner_id:
        url = f"{_IDENTITY_URL}/internal/user/{p.owner_id}/phone"
    else:
        return None
    try:
        resp = httpx.get(url, headers={"x-internal-token": settings.internal_token}, timeout=5.0)
    except httpx.HTTPError:
        return None
    return (resp.json() or {}).get("phone") if resp.status_code == 200 else None


@app.get("/internal/property-counts", include_in_schema=False)
def internal_property_counts(request: Request, db: Session = Depends(get_db)):
    """Nombre de biens par propriétaire et par agence (super-admin `/admin/accounts`)."""
    from sqlalchemy import func
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    by_owner = dict(db.query(Property.owner_id, func.count()).filter(
        Property.owner_id.isnot(None)).group_by(Property.owner_id).all())
    by_agency = dict(db.query(Property.agency_id, func.count()).filter(
        Property.agency_id.isnot(None)).group_by(Property.agency_id).all())
    return {"by_owner": {str(k): v for k, v in by_owner.items()},
            "by_agency": {str(k): v for k, v in by_agency.items()}}


@app.post("/estimate")
async def estimate_price(request: Request, db: Session = Depends(get_db)):
    """Estimation d'un prix de vente à partir d'annonces actives comparables (parité
    `selling.py:estimate_price`). Lecture seule sur les biens (listing les possède)."""
    data = await _json(request)
    city = data.get("city")
    property_type = data.get("property_type")
    surface = data.get("surface")
    if not city or not property_type or not surface:
        return _err("city, property_type and surface are required", 400)
    try:
        surface = float(surface)
    except (TypeError, ValueError):
        return _err("surface must be a number", 400)
    if surface <= 0:
        return _err("surface must be positive", 400)

    base = db.query(Property).filter(
        Property.transaction_type == "sale", Property.status == "active",
        Property.price.isnot(None), Property.surface.isnot(None), Property.surface > 0)
    scopes = [
        ("city_and_type", base.filter(Property.city.ilike(city), Property.property_type == property_type)),
        ("city", base.filter(Property.city.ilike(city))),
        ("type", base.filter(Property.property_type == property_type)),
    ]
    comparables, scope_used = [], None
    for scope_name, query in scopes:
        rows = query.limit(500).all()
        if len(rows) >= 3:
            comparables, scope_used = rows, scope_name
            break
    if not comparables:
        return {"available": False, "message": "Pas assez de biens comparables pour estimer"}

    ppsqm = median(float(p.price) / p.surface for p in comparables)
    estimate = ppsqm * surface
    return {
        "available": True, "scope": scope_used, "comparables_count": len(comparables),
        "price_per_sqm": round(ppsqm), "estimate": round(estimate),
        "estimate_low": round(estimate * 0.9), "estimate_high": round(estimate * 1.1),
    }


# ---- Gestion des biens en backoffice (cloisonnée agence) — parité `backoffice/properties.py` ----
_BO_WRITABLE = ["title", "description", "property_type", "transaction_type", "price", "charges",
                "surface", "land_surface", "rooms", "bedrooms", "bathrooms", "floor", "total_floors",
                "construction_year", "features", "energy_class", "address", "city", "neighborhood",
                "postal_code", "latitude", "longitude", "status", "is_premium", "is_urgent", "is_featured"]


def _bo_reference(db: Session) -> str:
    count = db.query(Property).count() + 1
    return f"PROP-{datetime.utcnow().strftime('%Y%m')}-{count:04d}"


def _bo_access(p: Property, principal: Principal):
    """Cloisonnement agence (parité) : un bien d'une autre agence → 403."""
    if principal.agency_id and p.agency_id != principal.agency_id:
        return _err("Access denied", 403)
    return None


@app.get("/backoffice/properties")
def bo_list_properties(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    q = db.query(Property)
    if principal.agency_id:
        q = q.filter(Property.agency_id == principal.agency_id)
    if qp.get("type"):
        q = q.filter(Property.property_type == qp.get("type"))
    if qp.get("transaction_type"):
        q = q.filter(Property.transaction_type == qp.get("transaction_type"))
    if qp.get("status"):
        q = q.filter(Property.status == qp.get("status"))
    if qp.get("city"):
        q = q.filter(Property.city == qp.get("city"))
    if qp.get("min_price"):
        q = q.filter(Property.price >= float(qp.get("min_price")))
    if qp.get("max_price"):
        q = q.filter(Property.price <= float(qp.get("max_price")))
    if qp.get("q"):
        t = f"%{qp.get('q')}%"
        q = q.filter(or_(Property.title.ilike(t), Property.reference.ilike(t),
                         Property.city.ilike(t), Property.neighborhood.ilike(t)))
    sort_by = qp.get("sort_by") or "created_at"
    col = getattr(Property, sort_by, None)
    if col is not None:
        q = q.order_by(col.desc() if (qp.get("sort_order") or "desc") == "desc" else col.asc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"properties": [_prop_dict(db, p, include_images=True) for p in items],
            "total": total, "pages": pages, "current_page": page}


@app.get("/backoffice/properties/{property_id}")
def bo_get_property(property_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    p = db.get(Property, property_id)
    if p is None:
        return _err("Not found", 404)
    denied = _bo_access(p, principal)
    if denied:
        return denied
    return _prop_dict(db, p, include_images=True)


@app.post("/backoffice/properties", status_code=201)
async def bo_create_property(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await _json(request)
    uid = int(principal.sub) if principal.sub and str(principal.sub).isdigit() else None
    p = Property(reference=_bo_reference(db), status=data.get("status", "draft"),
                 owner_id=uid, agency_id=principal.agency_id,
                 **{k: data.get(k) for k in _BO_WRITABLE if k in data and k != "status"})
    if p.features is None:
        p.features = data.get("features", [])
    db.add(p)
    db.flush()
    _emit(db, p, events.LISTING_CREATED)
    db.commit()
    return JSONResponse(_prop_dict(db, p, include_images=True), status_code=201)


@app.put("/backoffice/properties/{property_id}")
async def bo_update_property(property_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    p = db.get(Property, property_id)
    if p is None:
        return _err("Not found", 404)
    denied = _bo_access(p, principal)
    if denied:
        return denied
    data = await _json(request)
    for field in _BO_WRITABLE:
        if field in data:
            setattr(p, field, data[field])
    p.updated_at = datetime.utcnow()
    _emit(db, p, events.LISTING_UPDATED)
    db.commit()
    return _prop_dict(db, p, include_images=True)


@app.delete("/backoffice/properties/{property_id}")
def bo_delete_property(property_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    p = db.get(Property, property_id)
    if p is None:
        return _err("Not found", 404)
    denied = _bo_access(p, principal)
    if denied:
        return denied
    p.status = "archived"  # soft delete (parité : archivage, pas suppression)
    _emit(db, p, events.LISTING_UPDATED)
    db.commit()
    return {"message": "Property archived"}


@app.post("/properties/{property_id}/contact", status_code=201)
async def contact_property(property_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.get(Property, property_id)
    if p is None:
        return _err("Not found", 404)
    data = await _json(request)
    if not data.get("name") or not data.get("email"):
        return _err("Name and email are required", 400)
    p.contacts_count = (p.contacts_count or 0) + 1
    enqueue(db, "property", p.id, events.LISTING_CONTACTED,
            _contact_payload(p, data, data.get("source") or "contact_form"))
    db.commit()
    return {"message": "Contact request sent successfully"}


@app.post("/properties/{property_id}/reveal-phone")
async def reveal_phone(property_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.get(Property, property_id)
    if p is None:
        return _err("Not found", 404)
    phone = _fetch_contact_phone(p)
    if not phone:
        return _err("Aucun numéro de téléphone disponible pour ce bien", 404)
    data = await _json(request)
    payload = _contact_payload(
        p,
        {"name": data.get("name", "Visiteur"),
         "email": data.get("email", "non-renseigne@semsarout.ma"),
         "phone": data.get("phone"), "message": "Demande de numéro de téléphone"},
        "phone_reveal",
    )
    p.contacts_count = (p.contacts_count or 0) + 1
    enqueue(db, "property", p.id, events.LISTING_CONTACTED, payload)
    db.commit()
    return {"phone": phone}


# ---- Mes annonces ----
@app.get("/my-properties")
def my_properties(
    status: str | None = None, transaction_type: str | None = None,
    page: int = 1, per_page: int = 20,
    principal: Principal = Depends(get_principal), db: Session = Depends(get_db),
) -> dict:
    owner_id = int(principal.sub) if principal.sub.isdigit() else None
    query = db.query(Property).filter(Property.owner_id == owner_id)
    if status:
        query = query.filter(Property.status == status)
    if transaction_type:
        query = query.filter(Property.transaction_type == transaction_type)
    total = query.count()
    items = query.order_by(Property.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {
        "properties": [_prop_dict(db, p) for p in items],
        "total": total,
        "pages": math.ceil(total / per_page) if per_page else 1,
        "current_page": page,
    }
