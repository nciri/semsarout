"""Service listing (Stage 1) — CRUD/cycle de vie des biens (source de vérité).

Reproduit à l'identique : `GET /properties/{id}` (public, +views, **masquage des comptes
modérés**), `POST/PUT/DELETE /properties`, `/publish`, `GET /my-properties`.
La **découverte** (`GET /properties`, `/search`, `/suggestions`) reste au monolithe → Stage 2 (search).
Émet `listing.created/updated/deleted`.
"""
import math
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
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


def _fetch_contact_phone(property_id: int) -> str | None:
    """Téléphone agence/propriétaire via l'endpoint interne du monolithe (transition)."""
    try:
        resp = httpx.get(
            f"{moderation.MONOLITH_URL}/api/v1/internal/properties/{property_id}/contact-phone",
            headers={"x-internal-token": settings.internal_token}, timeout=5.0,
        )
    except httpx.HTTPError:
        return None
    return (resp.json() or {}).get("phone") if resp.status_code == 200 else None


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
    phone = _fetch_contact_phone(p.id)
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
