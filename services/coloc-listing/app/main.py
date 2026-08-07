"""Service coloc-listing — annonces de colocation M3a-L3achrane.

Port du service listing du dépôt initial, conventions mesh : erreurs legacy
{'error': msg}, identité via x-semsar-* (BFF), outbox transactionnel.
Toutes les routes métier exigent le tenant m3a-l3achrane (défense en profondeur —
le BFF route déjà par host/tenant).
"""
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import APIRouter, Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import ColocProperty, CurrentRoommates, HouseRule, Listing, ListingMedia, _now
from .schemas import HouseRulesIn, ListingCreateIn, ListingUpdateIn, MediaIn, RoommatesIn
from .state_machine import EDITABLE_STATUSES, STATUSES, TransitionError, assert_transition

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

TENANT = "m3a-l3achrane"
PUBLICATION_DAYS = 60  # durée de publication par défaut (dépôt initial)


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


@app.get("/internal/stats", include_in_schema=False)
def internal_stats(tenant: str | None = None, x_internal_token: str = Header(default=""),
                   db: Session = Depends(get_db)) -> dict:
    """Compteurs annonces (super-admin overview m3a) — agrégés par le BFF. coloc-listing
    n'a PAS de colonne tenant (service mono-tenant m3a-l3achrane) : `tenant` n'est accepté
    que pour uniformité de contrat avec identity et est ignoré s'il diffère de m3a-l3achrane
    (dans ce cas, compteurs à zéro plutôt qu'un mélange trompeur)."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    if tenant and tenant != TENANT:
        return {"total_listings": 0, "published_listings": 0, "in_moderation_listings": 0,
                "new_listings_30d": 0}
    since = _now() - timedelta(days=30)
    return {
        "total_listings": db.query(Listing).count(),
        "published_listings": db.query(Listing).filter(Listing.status == "PUBLIEE").count(),
        "in_moderation_listings": db.query(Listing).filter(Listing.status == "EN_MODERATION").count(),
        "new_listings_30d": db.query(Listing).filter(Listing.created_at >= since).count(),
    }


@app.get("/internal/listings/queue", include_in_schema=False)
def internal_listings_queue(status: str | None = None, tenant: str | None = None,
                            x_internal_token: str = Header(default=""),
                            db: Session = Depends(get_db)) -> dict:
    """File des annonces pour modération back-office (super-admin, via BFF) — statut
    `EN_MODERATION` par défaut ; `status` permet de filtrer sur un autre statut connu
    (historique : PUBLIEE, REJETEE, ...). Mono-tenant m3a-l3achrane (pas de colonne
    tenant sur Listing) : `tenant` n'est accepté que pour uniformité de contrat avec les
    autres `/internal/*` et ignoré s'il diffère de m3a-l3achrane (liste vide plutôt qu'un
    mélange trompeur)."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    if tenant and tenant != TENANT:
        return {"items": []}
    query = db.query(Listing)
    if status:
        if status not in STATUSES:
            return _err("Statut inconnu", 400)
        query = query.filter(Listing.status == status)
    else:
        query = query.filter(Listing.status == "EN_MODERATION")
    rows = query.order_by(Listing.created_at.asc()).all()
    return {"items": [
        {**listing.to_dict(), "owner_id": listing.owner_id, "created_at": listing.created_at.isoformat()}
        for listing in rows
    ]}


router = APIRouter(dependencies=[Depends(_require_tenant)])


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def _get(db: Session, listing_id: str) -> Listing | None:
    return db.get(Listing, listing_id)


def _search_doc(listing: Listing) -> dict:
    """Document d'index/événement de publication — cf. « Contrats partagés » du plan.
    Jamais d'adresse ni de coordonnées."""
    p = listing.property
    return {
        "listing_id": listing.id, "title": listing.title, "description": listing.description,
        "city": p.city, "neighborhood": p.neighborhood, "property_type": p.property_type,
        "bed_type": listing.bed_type, "housing_gender": listing.housing_gender,
        "furnished": listing.furnished, "rent": float(listing.rent),
        "currency": listing.currency, "capacity": listing.capacity,
        "available_from": listing.available_from.isoformat() if listing.available_from else None,
        "published_at": listing.published_at.isoformat() if listing.published_at else None,
        "media_urls": [m.url for m in listing.media],
        "rules": [r.value for r in listing.house_rules],
        "house_rules": {r.code: r.value for r in listing.house_rules},
        "amenities": [k for k, v in (p.amenities or {}).items() if v],
        "status": listing.status,
    }


def _change_status(db: Session, listing: Listing, target: str) -> JSONResponse | None:
    """Transition + événement coloc.listing_status_changed dans la même transaction."""
    try:
        assert_transition(listing.status, target)
    except TransitionError:
        return _err(f"Transition interdite : {listing.status} → {target}", 409)
    previous = listing.status
    listing.status = target
    enqueue(db, "coloc_listing", listing.id, events.LISTING_STATUS_CHANGED,
            {"listing_id": listing.id, "previous_status": previous, "new_status": target})
    return None


@router.post("/listings", status_code=201)
def create_listing(body: ListingCreateIn, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    if body.housing_gender == "MIXTE_FAMILIAL":
        # Non-mixité par défaut : contrainte dure (ADR 0006 du dépôt initial).
        return _err("housing_gender MIXTE_FAMILIAL non autorisé", 422)
    prop = ColocProperty(owner_id=uid, city=body.property.city,
                         neighborhood=body.property.neighborhood,
                         address=body.property.address,
                         property_type=body.property.property_type,
                         floor=body.property.floor, area_m2=body.property.area_m2,
                         amenities=body.property.amenities)
    db.add(prop)
    db.flush()
    listing = Listing(property_id=prop.id, owner_id=uid, title=body.title,
                      description=body.description, bed_type=body.bed_type, rent=body.rent,
                      charges_included=body.charges_included, charges_amount=body.charges_amount,
                      deposit=body.deposit, currency=body.currency, furnished=body.furnished,
                      housing_gender=body.housing_gender, capacity=body.capacity,
                      available_from=body.available_from,
                      duration_min_months=body.duration_min_months,
                      duration_max_months=body.duration_max_months)
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.get("/me/listings")
def my_listings(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    rows = db.query(Listing).filter(Listing.owner_id == uid).order_by(Listing.created_at.desc()).all()
    return [listing.to_dict() for listing in rows]


@router.get("/listings/{listing_id}")
def public_detail(listing_id: str, db: Session = Depends(get_db)):
    listing = _get(db, listing_id)
    if listing is None or listing.status != "PUBLIEE":
        return _err("Annonce introuvable", 404)  # ne fuit pas l'existence
    return listing.to_dict()


def _owned_editable(db: Session, listing_id: str, principal: Principal,
                    *, editable_only: bool = False):
    uid = _uid(principal)
    if uid is None:
        return None, _err("Authentification requise", 401)
    listing = _get(db, listing_id)
    if listing is None:
        return None, _err("Annonce introuvable", 404)
    if listing.owner_id != uid:
        return None, _err("Vous n'êtes pas propriétaire de cette annonce", 403)
    if editable_only and listing.status not in EDITABLE_STATUSES:
        return None, _err("Annonce non modifiable dans ce statut", 409)
    return listing, None


@router.patch("/listings/{listing_id}")
def update_listing(listing_id: str, body: ListingUpdateIn,
                   principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal, editable_only=True)
    if err is not None:
        return err
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(listing, field, value)
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.put("/listings/{listing_id}/house-rules")
def put_house_rules(listing_id: str, body: HouseRulesIn,
                    principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    from semsar_common.coloc_referential import LIFESTYLE_QUESTIONS

    listing, err = _owned_editable(db, listing_id, principal, editable_only=True)
    if err is not None:
        return err
    for rule in body.rules:
        allowed = LIFESTYLE_QUESTIONS.get(rule.code)
        if allowed is None or rule.value not in allowed:
            return _err(f"Règle de vie hors référentiel : {rule.code}={rule.value}", 400)
    db.query(HouseRule).filter(HouseRule.listing_id == listing.id).delete()
    for rule in body.rules:
        db.add(HouseRule(listing_id=listing.id, code=rule.code, value=rule.value))
    db.commit()
    db.refresh(listing)
    return listing.to_dict()["house_rules"]


@router.put("/listings/{listing_id}/roommates")
def put_roommates(listing_id: str, body: RoommatesIn,
                  principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal, editable_only=True)
    if err is not None:
        return err
    db.query(CurrentRoommates).filter(CurrentRoommates.listing_id == listing.id).delete()
    db.add(CurrentRoommates(listing_id=listing.id, total=body.total, women=body.women,
                            men=body.men, statuses=body.statuses))
    db.commit()
    db.refresh(listing)
    return listing.to_dict()["roommates"]


@router.post("/listings/{listing_id}/media", status_code=201)
def add_media(listing_id: str, body: MediaIn,
              principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal, editable_only=True)
    if err is not None:
        return err
    media = ListingMedia(listing_id=listing.id, url=body.url, position=body.position,
                         media_type=body.media_type)
    db.add(media)
    db.commit()
    return {"id": media.id, "url": media.url, "position": media.position,
            "media_type": media.media_type}


@router.post("/listings/{listing_id}/submit")
def submit(listing_id: str, principal: Principal = Depends(get_principal),
           db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal)
    if err is not None:
        return err
    err = _change_status(db, listing, "EN_MODERATION")
    if err is not None:
        return err
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.post("/listings/{listing_id}/approve")
def approve(listing_id: str, principal: Principal = Depends(get_principal),
            db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return _err("Modération réservée aux superadmins", 403)
    listing = _get(db, listing_id)
    if listing is None:
        return _err("Annonce introuvable", 404)
    err = _change_status(db, listing, "PUBLIEE")
    if err is not None:
        return err
    now = _now()
    listing.published_at = now
    listing.expires_at = now + timedelta(days=PUBLICATION_DAYS)
    # Deux événements dans la même transaction (comme le dépôt initial) :
    # status_changed (ci-dessus) + published avec le document d'index complet.
    enqueue(db, "coloc_listing", listing.id, events.LISTING_PUBLISHED, _search_doc(listing))
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.post("/listings/{listing_id}/reject")
def reject(listing_id: str, principal: Principal = Depends(get_principal),
           db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return _err("Modération réservée aux superadmins", 403)
    listing = _get(db, listing_id)
    if listing is None:
        return _err("Annonce introuvable", 404)
    err = _change_status(db, listing, "REJETEE")
    if err is not None:
        return err
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.post("/listings/{listing_id}/archive")
def archive(listing_id: str, principal: Principal = Depends(get_principal),
            db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal)
    if err is not None:
        return err
    err = _change_status(db, listing, "ARCHIVEE")
    if err is not None:
        return err
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


app.include_router(router)
