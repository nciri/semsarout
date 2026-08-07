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
from .config import get_coloc_settings
from .db import get_db, init_db
from .models import (
    Candidature, CANDIDATURE_ACTIVE_STATUSES, ColocLease, ColocPayment, ColocProperty,
    CurrentRoommates, EtatDesLieux, HouseRule, Listing, ListingMedia, _now,
)
from .payment_provider import get_payment_provider, verify_webhook_signature
from .payment_state_machine import PaymentTransitionError, assert_payment_transition
from .schemas import (
    CandidatureCreateIn, EtatDesLieuxCreateIn, EtatDesLieuxUpdateIn, HouseRulesIn, LeaseCreateIn,
    ListingCreateIn, ListingUpdateIn, MediaIn, RoommateDecisionIn, RoommatesIn, WebhookIn,
)
from .state_machine import EDITABLE_STATUSES, STATUSES, TransitionError, assert_transition

settings = get_settings()
coloc_settings = get_coloc_settings()
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


@app.get("/internal/leases", include_in_schema=False)
def internal_leases(tenant: str | None = None, x_internal_token: str = Header(default=""),
                    db: Session = Depends(get_db)) -> dict:
    """Baux + paiements pour la vue back-office « Contrats & paiements » (super-admin,
    via BFF). Cadrage : ÉTATS de séquestre modélisés, aucun PSP réel intégré — voir README."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    if tenant and tenant != TENANT:
        return {"items": []}
    rows = db.query(ColocLease).order_by(ColocLease.created_at.desc()).all()
    return {"items": [lease.to_dict() for lease in rows]}


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


def _is_current_roommate(db: Session, listing_id: str, uid: int) -> bool:
    """« Colocataire en place » = titulaire d'un bail (pending ou active) sur cette annonce.
    `CurrentRoommates` est un agrégat NON NOMINATIF (total/women/men, aucune identité) —
    la seule source de vérité nominative pour « qui habite déjà ici » est `ColocLease`."""
    return db.query(ColocLease).filter(
        ColocLease.listing_id == listing_id, ColocLease.tenant_user_id == uid,
        ColocLease.status.in_(("pending", "active")),
    ).first() is not None


@router.post("/candidatures", status_code=201)
def apply_to_listing(body: CandidatureCreateIn, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    """Le candidat postule à une annonce publiée. Dédupe : une seule candidature ACTIVE
    (non rejetée) par (candidat, annonce)."""
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    listing = _get(db, body.listing_id)
    if listing is None or listing.status != "PUBLIEE":
        return _err("Annonce introuvable", 404)
    existing = db.query(Candidature).filter(
        Candidature.listing_id == listing.id, Candidature.candidate_user_id == uid,
        Candidature.status.in_(CANDIDATURE_ACTIVE_STATUSES),
    ).first()
    if existing is not None:
        return _err("Vous avez déjà une candidature active pour cette annonce", 409)
    candidature = Candidature(listing_id=listing.id, candidate_user_id=uid,
                              owner_id=listing.owner_id, message=body.message)
    db.add(candidature)
    db.flush()
    enqueue(db, "coloc_listing", candidature.id, events.CANDIDATURE_RECEIVED,
            {"candidature_id": candidature.id, "listing_id": listing.id,
             "owner_id": listing.owner_id, "candidate_user_id": uid,
             "listing_title": listing.title})
    db.commit()
    db.refresh(candidature)
    return candidature.to_dict()


@router.get("/candidatures/mine")
def my_candidatures(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    rows = db.query(Candidature).filter(Candidature.candidate_user_id == uid) \
        .order_by(Candidature.created_at.desc()).all()
    return [c.to_dict() for c in rows]


@router.get("/candidatures/received")
def received_candidatures(listing_id: str | None = None,
                          principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    """Candidatures reçues par le propriétaire appelant, toutes annonces confondues ou
    filtrées sur une annonce (`listing_id`)."""
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    query = db.query(Candidature).filter(Candidature.owner_id == uid)
    if listing_id:
        query = query.filter(Candidature.listing_id == listing_id)
    rows = query.order_by(Candidature.created_at.desc()).all()
    return [c.to_dict() for c in rows]


@router.get("/candidatures/roommate-pending")
def roommate_pending_candidatures(principal: Principal = Depends(get_principal),
                                  db: Session = Depends(get_db)):
    """Candidatures `pending_roommate` en attente de la décision de l'appelant — restreint
    aux annonces où il est colocataire en place (titulaire d'un bail pending/active)."""
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    listing_ids = [row[0] for row in db.query(ColocLease.listing_id).filter(
        ColocLease.tenant_user_id == uid, ColocLease.status.in_(("pending", "active")),
    ).distinct().all()]
    if not listing_ids:
        return []
    rows = db.query(Candidature).filter(
        Candidature.listing_id.in_(listing_ids), Candidature.status == "pending_roommate",
    ).order_by(Candidature.created_at.desc()).all()
    return [c.to_dict() for c in rows]


def _owned_candidature(db: Session, candidature_id: str, principal: Principal):
    uid = _uid(principal)
    if uid is None:
        return None, _err("Authentification requise", 401)
    candidature = db.get(Candidature, candidature_id)
    if candidature is None:
        return None, _err("Candidature introuvable", 404)
    if candidature.owner_id != uid and not principal.is_superadmin:
        return None, _err("Réservé au propriétaire de l'annonce ou à l'admin", 403)
    return candidature, None


@router.post("/candidatures/{candidature_id}/shortlist")
def shortlist_candidature(candidature_id: str, principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    candidature, err = _owned_candidature(db, candidature_id, principal)
    if err is not None:
        return err
    if candidature.status != "received":
        return _err(f"Transition interdite : {candidature.status} → shortlisted", 409)
    candidature.status = "shortlisted"
    db.commit()
    db.refresh(candidature)
    return candidature.to_dict()


@router.post("/candidatures/{candidature_id}/accept")
def accept_candidature(candidature_id: str, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    """Accepte une candidature présélectionnée : si la chambre a déjà des colocataires en
    place, passe en `pending_roommate` (validation à partager) ; sinon accepte directement."""
    candidature, err = _owned_candidature(db, candidature_id, principal)
    if err is not None:
        return err
    if candidature.status != "shortlisted":
        return _err(f"Transition interdite : {candidature.status} → accepted", 409)
    listing = candidature.listing
    room_occupied = bool(listing and listing.roommates and listing.roommates.total > 0)
    if room_occupied:
        candidature.status = "pending_roommate"
    else:
        candidature.status = "accepted"
        enqueue(db, "coloc_listing", candidature.id, events.CANDIDATURE_ACCEPTED,
                {"candidature_id": candidature.id, "listing_id": candidature.listing_id,
                 "owner_id": candidature.owner_id, "candidate_user_id": candidature.candidate_user_id})
    db.commit()
    db.refresh(candidature)
    return candidature.to_dict()


@router.post("/candidatures/{candidature_id}/reject")
def reject_candidature(candidature_id: str, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    candidature, err = _owned_candidature(db, candidature_id, principal)
    if err is not None:
        return err
    if candidature.status in ("accepted", "rejected"):
        return _err(f"Transition interdite : {candidature.status} → rejected", 409)
    candidature.status = "rejected"
    db.commit()
    db.refresh(candidature)
    return candidature.to_dict()


@router.post("/candidatures/{candidature_id}/roommate-decision")
def roommate_decision(candidature_id: str, body: RoommateDecisionIn,
                      principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Le·s colocataire·s en place valident ou refusent une candidature `pending_roommate`.
    Garde : l'appelant doit être colocataire en place (titulaire d'un bail actif/pending)
    de l'annonce concernée."""
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    candidature = db.get(Candidature, candidature_id)
    if candidature is None:
        return _err("Candidature introuvable", 404)
    if candidature.status != "pending_roommate":
        return _err("Cette candidature n'attend pas de validation colocataire", 409)
    if not _is_current_roommate(db, candidature.listing_id, uid):
        return _err("Réservé aux colocataires en place de cette annonce", 403)
    if body.decision == "validated":
        candidature.status = "accepted"
        enqueue(db, "coloc_listing", candidature.id, events.CANDIDATURE_ACCEPTED,
                {"candidature_id": candidature.id, "listing_id": candidature.listing_id,
                 "owner_id": candidature.owner_id, "candidate_user_id": candidature.candidate_user_id})
    else:
        candidature.status = "rejected"
    db.commit()
    db.refresh(candidature)
    return candidature.to_dict()


def _lease_authorized_read(lease: ColocLease, principal: Principal) -> bool:
    uid = _uid(principal)
    return principal.is_superadmin or (
        uid is not None and uid in (lease.owner_id, lease.tenant_user_id)
    )


def _lease_authorized_write(lease: ColocLease, principal: Principal) -> bool:
    """Actions de séquestre : réservées au propriétaire (bailleur) ou à l'admin."""
    uid = _uid(principal)
    return principal.is_superadmin or (uid is not None and uid == lease.owner_id)


@router.post("/leases", status_code=201)
def create_lease(body: LeaseCreateIn, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    """Crée un bail pour une annonce détenue par l'appelant (ou par un admin) : initialise
    aussi les paiements caution + 1er loyer en statut `pending` (cadre séquestre, pas de
    mouvement d'argent réel)."""
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    listing = _get(db, body.listing_id)
    if listing is None:
        return _err("Annonce introuvable", 404)
    if listing.owner_id != uid and not principal.is_superadmin:
        return _err("Vous n'êtes pas propriétaire de cette annonce", 403)
    lease = ColocLease(listing_id=listing.id, tenant_user_id=body.tenant_user_id,
                       owner_id=listing.owner_id, rent_amount=body.rent_amount,
                       deposit_amount=body.deposit_amount, start_date=body.start_date,
                       end_date=body.end_date)
    db.add(lease)
    db.flush()
    db.add(ColocPayment(lease_id=lease.id, type="deposit", amount=body.deposit_amount))
    db.add(ColocPayment(lease_id=lease.id, type="rent", amount=body.rent_amount,
                        period=body.start_date.strftime("%Y-%m")))
    db.flush()
    enqueue(db, "coloc_listing", lease.id, events.LEASE_CREATED,
            {"lease_id": lease.id, "listing_id": listing.id, "owner_id": listing.owner_id,
             "tenant_user_id": body.tenant_user_id})
    db.commit()
    db.refresh(lease)
    return lease.to_dict()


@router.get("/leases/mine")
def my_leases(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Baux où l'appelant est bailleur OU locataire."""
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    rows = db.query(ColocLease).filter(
        (ColocLease.tenant_user_id == uid) | (ColocLease.owner_id == uid)
    ).order_by(ColocLease.created_at.desc()).all()
    return [lease.to_dict() for lease in rows]


@router.get("/me/leases")
def my_leases_tenant(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Tous les baux du LOCATAIRE courant (le plus récent en premier) — support multi-bail
    pour l'écran Paiement (sélecteur si plusieurs baux)."""
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    rows = db.query(ColocLease).filter(ColocLease.tenant_user_id == uid) \
        .order_by(ColocLease.created_at.desc()).all()
    return [lease.to_dict() for lease in rows]


@router.get("/me/lease")
def my_lease(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Bail le plus pertinent du LOCATAIRE courant (actif en priorité, sinon le plus
    récent) — alimente l'écran Paiement/séquestre. `null` si l'utilisateur n'a aucun bail.
    Conservée pour compat ; préférer `/me/leases` (liste complète) côté nouveaux clients."""
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    rows = db.query(ColocLease).filter(ColocLease.tenant_user_id == uid).all()
    if not rows:
        return None
    active = [lease for lease in rows if lease.status == "active"]
    pool = active or rows
    chosen = max(pool, key=lambda lease: lease.created_at)
    return chosen.to_dict()


@router.get("/leases/{lease_id}")
def lease_detail(lease_id: str, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    lease = db.get(ColocLease, lease_id)
    if lease is None:
        return _err("Bail introuvable", 404)
    if not _lease_authorized_read(lease, principal):
        return _err("Accès refusé", 403)
    return lease.to_dict()


def _payment_transition(db: Session, lease_id: str, payment_id: str, principal: Principal,
                        target: str):
    lease = db.get(ColocLease, lease_id)
    if lease is None:
        return None, _err("Bail introuvable", 404)
    if not _lease_authorized_write(lease, principal):
        return None, _err("Action séquestre réservée au bailleur ou à l'admin", 403)
    payment = next((p for p in lease.payments if p.id == payment_id), None)
    if payment is None:
        return None, _err("Paiement introuvable", 404)
    try:
        assert_payment_transition(payment.status, target)
    except PaymentTransitionError:
        return None, _err(f"Transition interdite : {payment.status} → {target}", 409)
    previous = payment.status
    payment.status = target
    if target == "escrowed" and lease.status == "pending":
        lease.status = "active"
    enqueue(db, "coloc_listing", payment.id, events.PAYMENT_STATUS_CHANGED,
            {"lease_id": lease.id, "payment_id": payment.id, "previous_status": previous,
             "new_status": target, "owner_id": lease.owner_id,
             "tenant_user_id": lease.tenant_user_id, "payment_type": payment.type,
             "amount": float(payment.amount)})
    return lease, None


@router.post("/leases/{lease_id}/payments/{payment_id}/escrow")
def escrow_payment(lease_id: str, payment_id: str, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    """Place le paiement en séquestre (`pending` → `escrowed`). Modélise l'état ; aucun
    mouvement d'argent réel (pas de PSP intégré)."""
    lease, err = _payment_transition(db, lease_id, payment_id, principal, "escrowed")
    if err is not None:
        return err
    db.commit()
    db.refresh(lease)
    return lease.to_dict()


@router.post("/leases/{lease_id}/payments/{payment_id}/release")
def release_payment(lease_id: str, payment_id: str, principal: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    """Libère le séquestre (`escrowed` → `released`) : modélise le paiement final au bailleur."""
    lease, err = _payment_transition(db, lease_id, payment_id, principal, "released")
    if err is not None:
        return err
    db.commit()
    db.refresh(lease)
    return lease.to_dict()


@router.post("/leases/{lease_id}/payments/{payment_id}/refund")
def refund_payment(lease_id: str, payment_id: str, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    """Rembourse le séquestre (`escrowed` → `refunded`) : modélise le retour au locataire."""
    lease, err = _payment_transition(db, lease_id, payment_id, principal, "refunded")
    if err is not None:
        return err
    db.commit()
    db.refresh(lease)
    return lease.to_dict()


# --- Paiement : intent (port PaymentProvider) + webhook simulé ------------------------

def _lease_authorized_intent(lease: ColocLease, principal: Principal) -> bool:
    """Créer un intent de paiement : réservé au LOCATAIRE du bail (c'est lui qui paie)."""
    uid = _uid(principal)
    return uid is not None and uid == lease.tenant_user_id


@router.post("/leases/{lease_id}/payments/{payment_id}/intent", status_code=201)
def create_payment_intent(lease_id: str, payment_id: str,
                          principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    """Crée un intent de paiement via le port `PaymentProvider` (simulé par défaut,
    aucun mouvement d'argent réel). Le paiement reste `pending` tant que le webhook
    simulé n'a pas confirmé l'intent (flux asynchrone réaliste, cf. payment_provider.py)."""
    lease = db.get(ColocLease, lease_id)
    if lease is None:
        return _err("Bail introuvable", 404)
    if not _lease_authorized_intent(lease, principal):
        return _err("Seul le locataire du bail peut initier ce paiement", 403)
    payment = next((p for p in lease.payments if p.id == payment_id), None)
    if payment is None:
        return _err("Paiement introuvable", 404)
    if payment.status != "pending":
        return _err(f"Paiement non initiable dans le statut {payment.status}", 409)
    provider = get_payment_provider()
    intent = provider.create_intent(payment_id=payment.id, amount=float(payment.amount))
    payment.provider = provider.name
    payment.intent_id = intent["intent_id"]
    payment.intent_status = intent["status"]
    enqueue(db, "coloc_listing", payment.id, events.PAYMENT_INTENT_CREATED,
            {"lease_id": lease.id, "payment_id": payment.id, "intent_id": intent["intent_id"],
             "provider": provider.name})
    db.commit()
    db.refresh(payment)
    return payment.to_dict()


def _apply_intent_event(db: Session, payment: ColocPayment, event: str) -> JSONResponse | None:
    """Applique l'issue d'un intent (succeeded/failed) à un `ColocPayment` — logique
    partagée par le webhook (signé, source de vérité) et l'endpoint de confirmation démo
    (cf. `confirm_payment_intent`, réservé au provider simulé). Retourne une erreur ou None."""
    payment.intent_status = event
    enqueue(db, "coloc_listing", payment.id, events.PAYMENT_WEBHOOK_RECEIVED,
            {"payment_id": payment.id, "intent_id": payment.intent_id, "event": event})
    if event == "succeeded":
        lease = db.get(ColocLease, payment.lease_id)
        try:
            assert_payment_transition(payment.status, "escrowed")
        except PaymentTransitionError:
            return _err(f"Transition interdite : {payment.status} → escrowed", 409)
        previous = payment.status
        payment.status = "escrowed"
        if lease is not None and lease.status == "pending":
            lease.status = "active"
        enqueue(db, "coloc_listing", payment.id, events.PAYMENT_STATUS_CHANGED,
                {"lease_id": payment.lease_id, "payment_id": payment.id,
                 "previous_status": previous, "new_status": "escrowed"})
    return None


@app.post("/internal/payments/webhook", include_in_schema=False)
async def payments_webhook(request: Request, db: Session = Depends(get_db)):
    """Webhook (simulé) du provider de paiement : fait avancer `ColocPayment` selon
    l'issue de l'intent. Signature HMAC (`x-webhook-signature`) plutôt que le jeton
    interne inter-services classique : c'est la couture destinée à recevoir un vrai
    callback PSP demain (schéma générique, à adapter au prestataire réel — voir
    payment_provider.py)."""
    raw_body = await request.body()
    signature = request.headers.get("x-webhook-signature", "")
    if not verify_webhook_signature(raw_body, signature):
        return _err("Signature invalide", 403)
    try:
        body = WebhookIn.model_validate_json(raw_body)
    except Exception:  # noqa: BLE001
        return _err("Payload invalide", 400)
    if body.event not in ("succeeded", "failed"):
        return _err("Événement inconnu", 400)
    payment = db.query(ColocPayment).filter(ColocPayment.intent_id == body.intent_id).first()
    if payment is None:
        return _err("Intent introuvable", 404)
    err = _apply_intent_event(db, payment, body.event)
    if err is not None:
        return err
    db.commit()
    db.refresh(payment)
    return payment.to_dict()


@router.post("/leases/{lease_id}/payments/{payment_id}/intent/confirm")
def confirm_payment_intent_demo(lease_id: str, payment_id: str,
                                principal: Principal = Depends(get_principal),
                                db: Session = Depends(get_db)):
    """DÉMO UNIQUEMENT (provider simulé) : déclenche côté locataire la confirmation de son
    propre intent, comme le ferait le webhook du PSP une fois le paiement réellement
    traité. N'existe QUE pour `PAYMENT_PROVIDER=simulated` — un vrai provider ne serait
    JAMAIS confirmé ainsi (uniquement par son webhook signé, cf. `payments_webhook`).
    Permet à Paiement.jsx de dérouler intent → confirmation sans exposer le secret
    webhook au client."""
    if coloc_settings.payment_provider != "simulated":
        return _err("Confirmation démo indisponible (provider réel configuré)", 403)
    lease = db.get(ColocLease, lease_id)
    if lease is None:
        return _err("Bail introuvable", 404)
    if not _lease_authorized_intent(lease, principal):
        return _err("Seul le locataire du bail peut confirmer ce paiement", 403)
    payment = next((p for p in lease.payments if p.id == payment_id), None)
    if payment is None:
        return _err("Paiement introuvable", 404)
    if not payment.intent_id:
        return _err("Aucun intent à confirmer pour ce paiement", 409)
    provider = get_payment_provider()
    outcome = provider.confirm(payment.intent_id)
    err = _apply_intent_event(db, payment, outcome["status"])
    if err is not None:
        return err
    db.commit()
    db.refresh(payment)
    return payment.to_dict()


# --- État des lieux ---------------------------------------------------------------------

def _edl_authorized_read(lease: ColocLease, principal: Principal) -> bool:
    return _lease_authorized_read(lease, principal)


@router.post("/leases/{lease_id}/etat-des-lieux", status_code=201)
def create_etat_des_lieux(lease_id: str, body: EtatDesLieuxCreateIn,
                          principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    """Crée l'état des lieux (entrée ou sortie) d'un bail — réservé au bailleur/admin.
    Au plus un par (bail, type) : voir contrainte d'unicité du modèle."""
    lease = db.get(ColocLease, lease_id)
    if lease is None:
        return _err("Bail introuvable", 404)
    if not _lease_authorized_write(lease, principal):
        return _err("Réservé au bailleur ou à l'admin", 403)
    existing = next((e for e in lease.etats_des_lieux if e.type == body.type), None)
    if existing is not None:
        return _err(f"État des lieux « {body.type} » déjà créé pour ce bail", 409)
    edl = EtatDesLieux(lease_id=lease.id, type=body.type,
                       items=[item.model_dump() for item in body.items])
    db.add(edl)
    db.flush()
    enqueue(db, "coloc_listing", edl.id, events.ETAT_DES_LIEUX_CREATED,
            {"lease_id": lease.id, "etat_des_lieux_id": edl.id, "type": edl.type})
    db.commit()
    db.refresh(edl)
    return edl.to_dict()


@router.get("/leases/{lease_id}/etat-des-lieux")
def list_etat_des_lieux(lease_id: str, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    """Liste les états des lieux (entrée/sortie) d'un bail — bailleur, locataire ou admin."""
    lease = db.get(ColocLease, lease_id)
    if lease is None:
        return _err("Bail introuvable", 404)
    if not _edl_authorized_read(lease, principal):
        return _err("Accès refusé", 403)
    return [e.to_dict() for e in lease.etats_des_lieux]


def _get_edl(db: Session, lease_id: str, edl_id: str) -> EtatDesLieux | None:
    edl = db.get(EtatDesLieux, edl_id)
    if edl is None or edl.lease_id != lease_id:
        return None
    return edl


@router.patch("/leases/{lease_id}/etat-des-lieux/{edl_id}")
def update_etat_des_lieux(lease_id: str, edl_id: str, body: EtatDesLieuxUpdateIn,
                          principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    """Met à jour les items (pièces) d'un état des lieux — bailleur/admin, tant qu'il est
    en brouillon (verrouillé une fois signé par les deux parties)."""
    lease = db.get(ColocLease, lease_id)
    if lease is None:
        return _err("Bail introuvable", 404)
    if not _lease_authorized_write(lease, principal):
        return _err("Réservé au bailleur ou à l'admin", 403)
    edl = _get_edl(db, lease_id, edl_id)
    if edl is None:
        return _err("État des lieux introuvable", 404)
    if edl.status != "draft":
        return _err("État des lieux déjà signé, non modifiable", 409)
    edl.items = [item.model_dump() for item in body.items]
    db.commit()
    db.refresh(edl)
    return edl.to_dict()


@router.post("/leases/{lease_id}/etat-des-lieux/{edl_id}/sign")
def sign_etat_des_lieux(lease_id: str, edl_id: str, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    """Signature d'une partie (bailleur ou locataire). Passe en `signed` quand les deux
    parties ont signé."""
    lease = db.get(ColocLease, lease_id)
    if lease is None:
        return _err("Bail introuvable", 404)
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    is_tenant = uid == lease.tenant_user_id
    is_owner = uid == lease.owner_id or (principal.is_superadmin and not is_tenant)
    if not (is_owner or is_tenant):
        return _err("Accès refusé", 403)
    edl = _get_edl(db, lease_id, edl_id)
    if edl is None:
        return _err("État des lieux introuvable", 404)
    if edl.status == "signed":
        return _err("Déjà signé par les deux parties", 409)
    now = _now()
    if is_owner and edl.owner_signed_at is None:
        edl.owner_signed_at = now
    if is_tenant and edl.tenant_signed_at is None:
        edl.tenant_signed_at = now
    if edl.owner_signed_at is not None and edl.tenant_signed_at is not None:
        edl.status = "signed"
        enqueue(db, "coloc_listing", edl.id, events.ETAT_DES_LIEUX_SIGNED,
                {"lease_id": lease_id, "etat_des_lieux_id": edl.id})
    db.commit()
    db.refresh(edl)
    return edl.to_dict()


app.include_router(router)
