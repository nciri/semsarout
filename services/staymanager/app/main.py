"""Service staymanager — intégration StayManager.ma (liens biens, réservations, sync).

Reproduit à l'identique `/integrations/staymanager/*` (cf.
`backend/app/api/v1/integrations/staymanager.py`). Toutes les routes gatées `has_staymanager_sync`
(billing). Les appels à l'API externe StayManager passent par `app/client.py` (échec propre en dev).
Cloisonné par agence.
"""
import secrets
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from . import billing_client
from .client import StayManagerClient, StayManagerError
from .db import get_db, init_db
from .models import (
    PropertyRO, StayManagerIntegration, StayManagerPropertyLink, StayManagerReservation,
    StayManagerSyncLog,
)
from .util import err, iso, json_body

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)
WEBHOOK_EVENTS = ["reservation.created", "reservation.updated", "reservation.cancelled",
                  "guest.verified", "property.updated"]


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


def _uid(principal: Principal):
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def _gate(principal: Principal):
    """Parité require_staymanager_feature : agence + plan has_staymanager_sync."""
    if principal.agency_id is None:
        return err("Agence requise", 403)
    sub = billing_client.subscription(principal.agency_id)
    if not sub or sub.get("status") != "active" or not sub.get("has_staymanager_sync"):
        return err("Cette fonctionnalite necessite le plan Pro ou superieur", 403, upgrade_required=True)
    return None


def _integration(db: Session, agency_id: int):
    return db.query(StayManagerIntegration).filter(StayManagerIntegration.agency_id == agency_id).first()


def _int_dict(db: Session, i: StayManagerIntegration, sensitive: bool = False) -> dict:
    cnt = db.query(StayManagerPropertyLink).filter(StayManagerPropertyLink.integration_id == i.id).count()
    d = {"id": i.id, "agency_id": i.agency_id, "staymanager_email": i.staymanager_email,
         "status": i.status, "last_sync_at": iso(i.last_sync_at), "sync_error": i.sync_error,
         "auto_sync_enabled": i.auto_sync_enabled, "sync_frequency_hours": i.sync_frequency_hours,
         "linked_properties_count": cnt, "created_at": iso(i.created_at), "updated_at": iso(i.updated_at)}
    if sensitive:
        d["webhook_url"] = i.webhook_url
        d["webhook_registered"] = bool(i.staymanager_webhook_id)
        d["has_api_key"] = bool(i.api_key_encrypted)
    return d


def _link_dict(db: Session, l: StayManagerPropertyLink) -> dict:
    ro = db.get(PropertyRO, l.property_id)
    rc = db.query(StayManagerReservation).filter(StayManagerReservation.property_link_id == l.id).count()
    return {"id": l.id, "integration_id": l.integration_id, "property_id": l.property_id,
            "property": {"id": ro.id, "title": ro.title, "reference": ro.reference} if ro else None,
            "staymanager_property_id": l.staymanager_property_id,
            "staymanager_property_name": l.staymanager_property_name,
            "sync_reservations": l.sync_reservations, "sync_availability": l.sync_availability,
            "sync_guests": l.sync_guests, "last_reservation_sync": iso(l.last_reservation_sync),
            "last_availability_sync": iso(l.last_availability_sync), "sync_status": l.sync_status,
            "sync_error": l.sync_error, "ical_url": l.ical_url, "reservations_count": rc,
            "created_at": iso(l.created_at)}


def _res_dict(r: StayManagerReservation, include_raw: bool = False) -> dict:
    d = {"id": r.id, "property_link_id": r.property_link_id,
         "staymanager_reservation_id": r.staymanager_reservation_id, "external_id": r.external_id,
         "platform": r.platform, "check_in": iso(r.check_in), "check_out": iso(r.check_out),
         "nights": r.nights,
         "guest": {"name": r.guest_name, "phone": r.guest_phone, "email": r.guest_email,
                   "count": r.guest_count, "verified": r.guest_verified,
                   "verification_status": r.verification_status},
         "status": r.status, "has_access_code": r.has_access_code,
         "access_code_masked": r.access_code_masked, "contract_status": r.contract_status,
         "total_price": float(r.total_price) if r.total_price else None, "currency": r.currency,
         "guest_notes": r.guest_notes, "special_requests": r.special_requests,
         "synced_at": iso(r.synced_at), "created_at": iso(r.created_at)}
    if include_raw:
        d["raw_data"] = r.raw_data
    return d


def _log_dict(g: StayManagerSyncLog) -> dict:
    return {"id": g.id, "integration_id": g.integration_id, "property_link_id": g.property_link_id,
            "sync_type": g.sync_type, "status": g.status, "items_synced": g.items_synced,
            "items_created": g.items_created, "items_updated": g.items_updated,
            "items_deleted": g.items_deleted, "error_message": g.error_message,
            "started_at": iso(g.started_at), "completed_at": iso(g.completed_at),
            "duration_seconds": g.duration_seconds, "trigger": g.trigger}


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/integrations/staymanager/status")
def get_status(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i:
        return {"connected": False, "integration": None}
    return {"connected": i.status == "connected", "integration": _int_dict(db, i, sensitive=True)}


@app.post("/integrations/staymanager/connect", status_code=201)
async def connect(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    data = await json_body(request)
    api_key = data.get("api_key")
    if not api_key:
        return err("api_key requis", 400)
    existing = _integration(db, principal.agency_id)
    if existing and existing.status == "connected":
        return err("StayManager est deja connecte", 400)
    try:
        client = StayManagerClient(api_key=api_key)
        profile = client.get_profile()
    except StayManagerError as e:
        return err(f"Connexion echouee: {e}", 400)
    i = existing or StayManagerIntegration(agency_id=principal.agency_id)
    i.api_key_encrypted = api_key
    i.staymanager_user_id = profile.get("id")
    i.staymanager_email = data.get("email") or profile.get("email")
    i.status = "connected"
    i.last_sync_at = datetime.utcnow()
    i.sync_error = None
    i.webhook_secret = secrets.token_urlsafe(32)
    warning = None
    import os
    app_base = os.environ.get("APP_BASE_URL")
    if not app_base or not app_base.startswith("https://"):
        warning = ("APP_BASE_URL n'est pas configure en https: les webhooks StayManager "
                   "ne peuvent pas etre enregistres. Les reservations ne se synchroniseront "
                   "qu'a la demande (bouton Synchroniser).")
    else:
        try:
            wh = client.register_webhook(f"{app_base}/api/v1/integrations/staymanager/webhook",
                                         i.webhook_secret, WEBHOOK_EVENTS)
            i.staymanager_webhook_id = wh.get("id")
            i.webhook_url = f"{app_base}/api/v1/integrations/staymanager/webhook"
        except StayManagerError as e:
            warning = f"Webhook non enregistre: {e}"
    if not existing:
        db.add(i)
    db.commit()
    resp = {"message": "Connexion StayManager reussie", "integration": _int_dict(db, i, sensitive=True)}
    if warning:
        resp["warning"] = warning
    return JSONResponse(resp, status_code=201)


@app.post("/integrations/staymanager/disconnect")
def disconnect(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i:
        return err("Aucune connexion StayManager trouvee", 404)
    if i.staymanager_webhook_id and i.api_key_encrypted:
        try:
            StayManagerClient(api_key=i.api_key_encrypted).delete_webhook(i.staymanager_webhook_id)
        except StayManagerError:
            pass
    i.status = "disconnected"
    i.api_key_encrypted = None
    i.sync_error = None
    i.staymanager_webhook_id = None
    i.webhook_url = None
    db.commit()
    return {"message": "StayManager deconnecte avec succes"}


@app.put("/integrations/staymanager/settings")
async def update_settings(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i:
        return err("Aucune connexion StayManager trouvee", 404)
    data = await json_body(request)
    if "auto_sync_enabled" in data:
        i.auto_sync_enabled = bool(data["auto_sync_enabled"])
    if "sync_frequency_hours" in data:
        i.sync_frequency_hours = max(1, min(24, int(data["sync_frequency_hours"])))
    db.commit()
    return {"message": "Parametres mis a jour", "integration": _int_dict(db, i, sensitive=True)}


@app.get("/integrations/staymanager/properties")
def list_properties(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i or i.status != "connected":
        return err("StayManager non connecte", 400)
    links = db.query(StayManagerPropertyLink).filter(StayManagerPropertyLink.integration_id == i.id).all()
    return {"property_links": [_link_dict(db, l) for l in links]}


@app.get("/integrations/staymanager/properties/available")
def list_available(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i or i.status != "connected":
        return err("StayManager non connecte", 400)
    try:
        sm = StayManagerClient(api_key=i.api_key_encrypted).get_properties()
    except StayManagerError as e:
        return err(str(e), 500)
    linked = {l.staymanager_property_id for l in
              db.query(StayManagerPropertyLink).filter(StayManagerPropertyLink.integration_id == i.id).all()}
    available = [p for p in sm if p.get("id") not in linked]
    return {"staymanager_properties": available, "linked_count": len(linked)}


@app.post("/integrations/staymanager/properties/{property_id}/link", status_code=201)
async def link_property(property_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    data = await json_body(request)
    smid = data.get("staymanager_property_id")
    if not smid:
        return err("staymanager_property_id requis", 400)
    i = _integration(db, principal.agency_id)
    if not i or i.status != "connected":
        return err("StayManager non connecte", 400)
    ro = db.get(PropertyRO, property_id)
    if ro is None:
        return err("Bien non trouve", 404)
    if db.query(StayManagerPropertyLink).filter(StayManagerPropertyLink.property_id == property_id).first():
        return err("Ce bien est deja lie a StayManager", 400)
    try:
        client = StayManagerClient(api_key=i.api_key_encrypted)
        sm_prop = client.get_property(smid)
    except StayManagerError as e:
        return err(f"Propriete StayManager non trouvee: {e}", 400)
    ical = None
    try:
        ical = client.get_ical_url(smid)
    except Exception:  # noqa: BLE001
        pass
    l = StayManagerPropertyLink(integration_id=i.id, property_id=property_id,
                                staymanager_property_id=smid, staymanager_property_name=sm_prop.get("name"),
                                ical_url=ical, sync_status="pending")
    db.add(l)
    db.commit()
    return JSONResponse({"message": "Bien lie avec succes", "property_link": _link_dict(db, l)}, status_code=201)


@app.post("/integrations/staymanager/properties/{property_id}/unlink")
def unlink_property(property_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i:
        return err("StayManager non connecte", 400)
    l = db.query(StayManagerPropertyLink).filter(
        StayManagerPropertyLink.integration_id == i.id, StayManagerPropertyLink.property_id == property_id).first()
    if not l:
        return err("Lien non trouve", 404)
    db.delete(l)
    db.commit()
    return {"message": "Lien supprime avec succes"}


@app.post("/integrations/staymanager/properties/{property_id}/sync")
def sync_property(property_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i or i.status != "connected":
        return err("StayManager non connecte", 400)
    l = db.query(StayManagerPropertyLink).filter(
        StayManagerPropertyLink.integration_id == i.id, StayManagerPropertyLink.property_id == property_id).first()
    if not l:
        return err("Lien non trouve", 404)
    log = StayManagerSyncLog(integration_id=i.id, property_link_id=l.id, sync_type="reservations",
                             status="started", trigger="manual")
    db.add(log)
    l.sync_status = "syncing"
    db.commit()
    try:
        StayManagerClient(api_key=i.api_key_encrypted).get_reservations(property_id=l.staymanager_property_id)
    except StayManagerError as e:
        l.sync_status = "error"
        l.sync_error = str(e)
        log.status = "failed"
        log.error_message = str(e)
        log.completed_at = datetime.utcnow()
        db.commit()
        return err(str(e), 500)
    l.last_reservation_sync = datetime.utcnow()
    l.sync_status = "synced"
    log.status = "completed"
    log.completed_at = datetime.utcnow()
    db.commit()
    return {"message": "Synchronisation terminee", "items_created": 0, "items_updated": 0}


@app.get("/integrations/staymanager/reservations")
def list_reservations(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i:
        return err("StayManager non connecte", 400)
    qp = request.query_params
    q = (db.query(StayManagerReservation).join(StayManagerPropertyLink)
         .filter(StayManagerPropertyLink.integration_id == i.id))
    if qp.get("property_id"):
        q = q.filter(StayManagerPropertyLink.property_id == int(qp.get("property_id")))
    if qp.get("status"):
        q = q.filter(StayManagerReservation.status == qp.get("status"))
    if (qp.get("upcoming") or "false").lower() == "true":
        q = q.filter(StayManagerReservation.check_in >= datetime.utcnow())
    rows = q.order_by(StayManagerReservation.check_in.asc()).all()
    return {"reservations": [_res_dict(r) for r in rows]}


@app.get("/integrations/staymanager/reservations/{reservation_id}")
def get_reservation(reservation_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i:
        return err("StayManager non connecte", 400)
    r = (db.query(StayManagerReservation).join(StayManagerPropertyLink)
         .filter(StayManagerReservation.id == reservation_id,
                 StayManagerPropertyLink.integration_id == i.id).first())
    if not r:
        return err("Reservation non trouvee", 404)
    return {"reservation": _res_dict(r, include_raw=True)}


@app.get("/integrations/staymanager/calendar/{property_id}")
def get_calendar(property_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i or i.status != "connected":
        return err("StayManager non connecte", 400)
    l = db.query(StayManagerPropertyLink).filter(
        StayManagerPropertyLink.integration_id == i.id, StayManagerPropertyLink.property_id == property_id).first()
    if not l:
        return err("Bien non lie a StayManager", 404)
    qp = request.query_params
    start = qp.get("start_date") or datetime.utcnow().strftime("%Y-%m-%d")
    end = qp.get("end_date") or (datetime.utcnow().replace(day=1)).strftime("%Y-%m-%d")
    try:
        availability = StayManagerClient(api_key=i.api_key_encrypted).get_availability(
            l.staymanager_property_id, start, end)
    except StayManagerError as e:
        return err(str(e), 500)
    res = (db.query(StayManagerReservation)
           .filter(StayManagerReservation.property_link_id == l.id,
                   StayManagerReservation.status != "cancelled").all())
    return {"availability": availability, "reservations": [_res_dict(r) for r in res], "ical_url": l.ical_url}


@app.get("/integrations/staymanager/sync-logs")
def list_sync_logs(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    i = _integration(db, principal.agency_id)
    if not i:
        return err("StayManager non connecte", 400)
    logs = (db.query(StayManagerSyncLog).filter(StayManagerSyncLog.integration_id == i.id)
            .order_by(StayManagerSyncLog.started_at.desc()).limit(50).all())
    return {"sync_logs": [_log_dict(g) for g in logs]}


@app.post("/integrations/staymanager/webhook")
async def handle_webhook(request: Request, db: Session = Depends(get_db)):
    # Réception passerelle (signature vérifiée en cible) — no-op tolérant en l'absence d'intégration.
    await json_body(request)
    return {"received": True}
