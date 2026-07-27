"""Service agency — domaine agence (lecture). Reroute les routes existantes du monolithe :
`GET /agencies`, `GET /agencies/{slug}`, `GET /my-agency`. Erreurs legacy `{'error': msg}`.
`properties_count` vient d'une projection locale `listing_ro` (événements `listing.*`).
Les écritures (create/update/regenerate-api-key) restent au monolithe pour l'instant.
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, listing_client, members_client
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


@app.get("/internal/agency/{agency_id}/phone", include_in_schema=False)
def internal_agency_phone(agency_id: int, request: Request, db: Session = Depends(get_db)):
    """Téléphone d'une agence — pour reveal-phone côté listing (v2-native, remplace le monolithe)."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    a = db.get(Agency, agency_id)
    return {"phone": a.phone if a else None}


# ---- Modération de compte agence (super-admin) — déléguée par trust-safety (jeton interne) ----
# agency possède l'entité agence (modèle complet + `to_dict`). identity consomme les événements
# `agency.*` pour resynchroniser `agency_ro` (blocage login). Parité EXACTE des réponses du
# monolithe (`/admin/accounts/agencies/*`) : mêmes messages, mêmes codes, `Agency.to_dict()`.
def _agency_msg(db: Session, message: str, a: Agency, code: int = 200) -> JSONResponse:
    cnt = _counts(db, [a.id]).get(a.id, 0)
    return JSONResponse({"message": message, "agency": a.to_dict(properties_count=cnt)}, status_code=code)


def _emit_agency(db: Session, a: Agency, event_type: str) -> None:
    enqueue(db, "agency", a.id, event_type, {
        "id": a.id, "name": a.name,
        "is_suspended": bool(a.is_suspended), "is_deleted": a.deleted_at is not None,
        "suspended_reason": a.suspended_reason,
    })


def _mod_resolve(agency_id: int, token: str, db: Session):
    if token != settings.internal_token:
        return None, _err("Forbidden", 403)
    a = db.get(Agency, agency_id)
    if a is None:
        return None, _err("Agency not found", 404)
    return a, None


@app.post("/internal/accounts/agencies/{agency_id}/suspend", include_in_schema=False)
def mod_suspend(agency_id: int, reason: str | None = None, actor_id: int | None = None,
                x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    a.is_suspended = True
    a.suspended_at = datetime.utcnow()
    a.suspended_reason = reason
    _emit_agency(db, a, events.AGENCY_SUSPENDED)
    db.commit()
    return _agency_msg(db, "Agence suspendue", a)


@app.post("/internal/accounts/agencies/{agency_id}/unsuspend", include_in_schema=False)
def mod_unsuspend(agency_id: int, reason: str | None = None, actor_id: int | None = None,
                  x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    a.is_suspended = False
    a.suspended_at = None
    a.suspended_reason = None
    _emit_agency(db, a, events.AGENCY_UNSUSPENDED)
    db.commit()
    return _agency_msg(db, "Agence réactivée", a)


@app.post("/internal/accounts/agencies/{agency_id}/delete", include_in_schema=False)
def mod_delete(agency_id: int, reason: str | None = None, actor_id: int | None = None,
               x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    a.deleted_at = datetime.utcnow()
    a.is_suspended = True
    _emit_agency(db, a, events.AGENCY_DELETED)
    db.commit()
    return _agency_msg(db, "Agence supprimée", a)


@app.post("/internal/accounts/agencies/{agency_id}/restore", include_in_schema=False)
def mod_restore(agency_id: int, reason: str | None = None, actor_id: int | None = None,
                x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    a.deleted_at = None
    a.is_suspended = False
    a.suspended_at = None
    a.suspended_reason = None
    _emit_agency(db, a, events.AGENCY_RESTORED)
    db.commit()
    return _agency_msg(db, "Agence restaurée", a)


@app.post("/internal/accounts/agencies/{agency_id}/anonymize", include_in_schema=False)
def mod_anonymize(agency_id: int, reason: str | None = None, actor_id: int | None = None,
                  x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    if a.anonymized_at is not None:
        return _agency_msg(db, "Agence déjà anonymisée", a)
    a.name = "Agence supprimée"
    a.slug = f"agence-supprimee-{a.id}"
    a.description = None
    a.email = f"deleted+agency{a.id}@semsar.invalid"
    a.phone = None
    a.website = None
    a.address = None
    a.postal_code = None
    a.logo_url = None
    a.cover_image_url = None
    a.license_number = None
    a.rc_number = None
    a.ice_number = None
    a.api_key = None
    if a.deleted_at is None:
        a.deleted_at = datetime.utcnow()
    a.is_suspended = True
    a.anonymized_at = datetime.utcnow()
    _emit_agency(db, a, events.AGENCY_ANONYMIZED)
    db.commit()
    return _agency_msg(db, "Agence anonymisée", a)


def _mod_state(a: Agency) -> str:
    return "deleted" if a.deleted_at else ("suspended" if a.is_suspended else "active")


@app.get("/internal/agencies", include_in_schema=False)
def internal_agencies(request: Request, db: Session = Depends(get_db)):
    """Dump léger de toutes les agences (super-admin `/admin/accounts`) — agrégé par analytics."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    rows = db.query(Agency).all()
    return {"agencies": [{"id": a.id, "name": a.name, "email": a.email,
                          "status": _mod_state(a), "owner_id": a.owner_id} for a in rows]}


@app.get("/internal/agency/{agency_id}", include_in_schema=False)
def internal_agency_detail(agency_id: int, request: Request, db: Session = Depends(get_db)):
    """Détail d'une agence (`to_dict` complet) — pour `/admin/accounts/agencies/{id}`."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    a = db.get(Agency, agency_id)
    if a is None:
        return {"agency": None}
    cnt = _counts(db, [a.id]).get(a.id, 0)
    return {"agency": a.to_dict(properties_count=cnt)}


@app.get("/internal/agencies/stats", include_in_schema=False)
def internal_agencies_stats(request: Request, db: Session = Depends(get_db)):
    """Compteurs agences plateforme (super-admin overview) — agrégés par analytics."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    return {
        "total_agencies": db.query(Agency).filter(Agency.deleted_at.is_(None)).count(),
        "suspended_agencies": db.query(Agency).filter(Agency.is_suspended.is_(True)).count(),
        "deleted_pending_agencies": db.query(Agency).filter(
            Agency.deleted_at.isnot(None), Agency.anonymized_at.is_(None)).count(),
    }


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


@app.get("/my-agency")
def my_agency(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Agence de l'utilisateur courant, avec ses membres (parité `include_members=True`).
    Les membres viennent d'identity (propriétaire des comptes) — dicts complets `User.to_dict`."""
    if principal.agency_id is None:
        return _err("You do not belong to an agency", 404)
    agency = db.get(Agency, principal.agency_id)
    if agency is None:
        return _err("You do not belong to an agency", 404)
    cnt = _counts(db, [agency.id]).get(agency.id, 0)
    data = agency.to_dict(properties_count=cnt)
    data["members"] = members_client.members_of(agency.id)
    return {"agency": data}


@app.get("/agencies/{slug}/properties")
def agency_properties(slug: str, request: Request, db: Session = Depends(get_db)):
    """Biens actifs d'une agence — dicts COMPLETS (parité) via le service listing (propriétaire
    du bien), masquage modération inclus. agency résout le slug → agency_id (son domaine)."""
    agency = db.query(Agency).filter(Agency.slug == slug).first()
    if agency is None or agency.is_suspended or agency.deleted_at is not None:
        return _err("Not found", 404)
    qp = request.query_params
    return listing_client.by_agency(agency.id, "active",
                                    int(qp.get("page") or 1), int(qp.get("per_page") or 20))


@app.get("/agencies/{slug}")
def get_agency(slug: str, db: Session = Depends(get_db)):
    agency = db.query(Agency).filter(Agency.slug == slug).first()
    if agency is None:
        return _err("Not found", 404)
    cnt = _counts(db, [agency.id]).get(agency.id, 0)
    return {"agency": agency.to_dict(properties_count=cnt)}
