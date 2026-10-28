"""Service staymanager — séjours courte durée et intégration StayManager.ma.

Deux périmètres, une seule table de réservations :

- `/integrations/staymanager/*` : miroir d'un compte StayManager externe (historique).
- `/backoffice/sejours/*` : séjours **natifs**, importés des calendriers iCal des
  plateformes (Airbnb, Booking, VRBO) sans compte tiers. Voir
  `docs/integration-staymanager.md`.

Reproduit à l'identique `/integrations/staymanager/*` (cf.
`backend/app/api/v1/integrations/staymanager.py`). Toutes les routes gatées `has_staymanager_sync`
(billing). Les appels à l'API externe StayManager passent par `app/client.py` (échec propre en dev).
Cloisonné par agence.
"""
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from . import agency_client, billing_client, ical, messages, stays
from .cleaning import router as cleaning_router
from .gate import gate
from .client import StayManagerClient, StayManagerError
from .db import get_db, init_db
from .models import (
    IcalSource, PropertyRO, StayManagerIntegration, StayManagerPropertyLink,
    StayManagerReservation, StayManagerSyncLog, StayMessage, StayMessageTemplate,
)
from .util import err, iso, json_body

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)
logger = logging.getLogger("staymanager")
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

# Ménage de rotation (voir app/cleaning.py) — mêmes routes /backoffice/sejours, gate incluse.
app.include_router(cleaning_router)


def _uid(principal: Principal):
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


_gate = gate


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
    if ro is None or ro.agency_id != principal.agency_id:  # parité : bien de l'agence uniquement (anti-IDOR)
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


# ---- Séjours courte durée : calendriers iCal et planning --------------------------------

def _source_dict(db: Session, src: IcalSource) -> dict:
    ro = db.get(PropertyRO, src.property_id)
    return {"id": src.id, "property_id": src.property_id,
            "property_title": ro.title if ro else None,
            "platform": src.platform, "ical_url": src.ical_url, "status": src.status,
            "last_error": src.last_error, "last_synced_at": iso(src.last_synced_at),
            "reservations_count": src.reservations_count or 0}


def _stay_dict(db: Session, r: StayManagerReservation) -> dict:
    ro = db.get(PropertyRO, r.property_id) if r.property_id else None
    return {"id": r.id, "property_id": r.property_id,
            "property_title": ro.title if ro else None,
            "platform": r.platform, "source": r.source, "external_id": r.external_id,
            "guest_name": r.guest_name, "guest_phone": r.guest_phone,
            "guest_count": r.guest_count, "check_in": iso(r.check_in),
            "check_out": iso(r.check_out), "nights": r.nights, "status": r.status,
            "has_conflict": bool(r.has_conflict), "synced_at": iso(r.synced_at)}


def _own_source(db: Session, source_id: int, principal: Principal):
    src = db.get(IcalSource, source_id)
    if src is None or src.agency_id != principal.agency_id:
        return None, err("Calendrier introuvable", 404)
    return src, None


@app.get("/backoffice/sejours/calendriers")
def list_ical_sources(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    rows = (db.query(IcalSource).filter(IcalSource.agency_id == principal.agency_id)
            .order_by(IcalSource.property_id, IcalSource.platform).all())
    return {"sources": [_source_dict(db, s) for s in rows]}


@app.post("/backoffice/sejours/calendriers", status_code=201)
async def add_ical_source(request: Request, principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    """Ajoute un calendrier et le synchronise aussitôt : l'agence doit voir s'il répond."""
    if (g := _gate(principal)) is not None:
        return g
    data = await json_body(request)
    try:
        property_id = int(data.get("property_id") or 0)
    except (TypeError, ValueError):
        return err("Bien invalide", 400)
    if property_id <= 0:
        return err("Bien obligatoire", 400)
    platform = (data.get("platform") or "autre").strip().lower()
    if platform not in ical.PLATFORMS:
        return err("Plateforme inconnue", 400)
    ro = db.get(PropertyRO, property_id)
    if ro is None or (ro.agency_id and ro.agency_id != principal.agency_id):
        return err("Bien introuvable dans votre portefeuille", 400)
    try:
        url = ical.safe_ical_url(data.get("ical_url") or "")
    except ical.IcalError as exc:
        return err(str(exc), 400)
    if db.query(IcalSource).filter(IcalSource.property_id == property_id,
                                   IcalSource.platform == platform).first():
        return err("Ce bien a déjà un calendrier pour cette plateforme", 400)

    src = IcalSource(agency_id=principal.agency_id, property_id=property_id,
                     platform=platform, ical_url=url)
    db.add(src)
    db.flush()
    try:
        result = stays.sync_source(db, src)
    except ical.IcalError as exc:
        stays.mark_failure(src, str(exc))
        db.commit()
        return err(str(exc), 400)
    db.commit()
    return {"source": _source_dict(db, src), "sync": result}


@app.post("/backoffice/sejours/calendriers/{source_id}/sync")
def sync_ical_source(source_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    src, e = _own_source(db, source_id, principal)
    if e:
        return e
    try:
        result = stays.sync_source(db, src)
    except ical.IcalError as exc:
        stays.mark_failure(src, str(exc))
        db.commit()
        return err(str(exc), 400)
    db.commit()
    return {"source": _source_dict(db, src), "sync": result}


@app.delete("/backoffice/sejours/calendriers/{source_id}")
def delete_ical_source(source_id: int, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    """Retire le calendrier ; les séjours déjà importés restent, l'historique a servi."""
    if (g := _gate(principal)) is not None:
        return g
    src, e = _own_source(db, source_id, principal)
    if e:
        return e
    db.query(StayManagerReservation).filter(
        StayManagerReservation.ical_source_id == src.id).update({"ical_source_id": None})
    db.delete(src)
    db.commit()
    return {"message": "Calendrier retiré"}


@app.post("/backoffice/sejours/sync")
def sync_all_sources(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Rejoue tous les calendriers de l'agence ; l'échec d'un canal n'arrête pas les autres."""
    if (g := _gate(principal)) is not None:
        return g
    rows = db.query(IcalSource).filter(IcalSource.agency_id == principal.agency_id).all()
    totals = {"sources": len(rows), "ok": 0, "failed": 0, "created": 0, "cancelled": 0,
              "conflicts": 0}
    for src in rows:
        try:
            result = stays.sync_source(db, src)
        except ical.IcalError as exc:
            stays.mark_failure(src, str(exc))
            totals["failed"] += 1
            continue
        totals["ok"] += 1
        totals["created"] += result["created"]
        totals["cancelled"] += result["cancelled"]
        totals["conflicts"] += result["conflicts"]
    db.commit()
    return totals


@app.get("/backoffice/sejours")
def list_stays(request: Request, principal: Principal = Depends(get_principal),
               db: Session = Depends(get_db)):
    """Planning des séjours de l'agence. `from`/`to` en ISO, `property_id`, `status`."""
    if (g := _gate(principal)) is not None:
        return g
    qp = request.query_params
    q = db.query(StayManagerReservation).filter(
        StayManagerReservation.agency_id == principal.agency_id)
    if qp.get("property_id", "").isdigit():
        q = q.filter(StayManagerReservation.property_id == int(qp["property_id"]))
    if qp.get("status"):
        q = q.filter(StayManagerReservation.status == qp["status"])
    if qp.get("from"):
        try:
            q = q.filter(StayManagerReservation.check_out >= datetime.fromisoformat(qp["from"]))
        except ValueError:
            return err("Date de début invalide", 400)
    if qp.get("to"):
        try:
            q = q.filter(StayManagerReservation.check_in <= datetime.fromisoformat(qp["to"]))
        except ValueError:
            return err("Date de fin invalide", 400)
    rows = q.order_by(StayManagerReservation.check_in).all()
    return {"stays": [_stay_dict(db, r) for r in rows],
            "conflicts": sum(1 for r in rows if r.has_conflict)}


@app.get("/backoffice/sejours/apercu")
def stays_overview(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Ce qui demande une action aujourd'hui : arrivées, départs, conflits, canaux en panne."""
    if (g := _gate(principal)) is not None:
        return g
    now = datetime.utcnow()
    today = datetime(now.year, now.month, now.day)
    rows = (db.query(StayManagerReservation)
            .filter(StayManagerReservation.agency_id == principal.agency_id,
                    StayManagerReservation.status == "confirmed").all())
    sources = db.query(IcalSource).filter(IcalSource.agency_id == principal.agency_id).all()
    nights = sum(r.nights or 0 for r in rows if r.check_in >= today)
    return {
        "arrivals_today": sum(1 for r in rows if r.check_in.date() == today.date()),
        "departures_today": sum(1 for r in rows if r.check_out.date() == today.date()),
        "in_house": sum(1 for r in rows if r.check_in <= now < r.check_out),
        "upcoming": sum(1 for r in rows if r.check_in > now),
        "conflicts": sum(1 for r in rows if r.has_conflict),
        "nights_booked": nights,
        "sources": {"total": len(sources),
                    "in_error": sum(1 for s in sources if s.status == "error")},
    }


# --- Messagerie de séjour ---------------------------------------------------------------
# Les gabarits appartiennent à l'agence ; l'envoi reste au service notification, qui vient
# chercher ce qui est dû (`/internal/sejours/messages/due`). Voir app/messages.py.

def _template_dict(tpl: StayMessageTemplate) -> dict:
    return {"id": tpl.id, "property_id": tpl.property_id, "name": tpl.name,
            "trigger": tpl.trigger_event, "offset_hours": tpl.offset_hours or 0,
            "subject": tpl.subject, "body": tpl.body, "active": bool(tpl.active)}


def _message_dict(db: Session, m: StayMessage) -> dict:
    res = db.get(StayManagerReservation, m.reservation_id)
    ro = db.get(PropertyRO, res.property_id) if res and res.property_id else None
    return {"id": m.id, "reservation_id": m.reservation_id, "template_id": m.template_id,
            "property_title": ro.title if ro else None,
            "guest_name": res.guest_name if res else None,
            "recipient": m.recipient, "subject": m.subject, "status": m.status,
            "error": m.error, "due_at": iso(m.due_at), "sent_at": iso(m.sent_at)}


def _template_payload(data: dict) -> tuple[dict | None, JSONResponse | None]:
    name = (data.get("name") or "").strip()
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()
    trigger = (data.get("trigger") or "").strip()
    if not name or not subject or not body:
        return None, err("Nom, objet et message sont obligatoires", 400)
    if trigger not in messages.TRIGGERS:
        return None, err("Déclencheur inconnu", 400)
    try:
        offset = int(data.get("offset_hours") or 0)
    except (TypeError, ValueError):
        return None, err("Délai invalide", 400)
    if not 0 <= offset <= messages.MAX_OFFSET_HOURS:
        return None, err("Délai hors limites", 400)
    unknown = messages.unknown_placeholders(f"{subject} {body}")
    if unknown:
        return None, err(f"Variables inconnues : {', '.join(unknown)}", 400)
    property_id = data.get("property_id")
    try:
        property_id = int(property_id) if property_id not in (None, "", 0) else None
    except (TypeError, ValueError):
        return None, err("Bien invalide", 400)
    return {"name": name, "subject": subject, "body": body, "trigger_event": trigger,
            "offset_hours": offset, "property_id": property_id,
            "active": bool(data.get("active", True))}, None


@app.get("/backoffice/sejours/messages/modeles")
def list_message_templates(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    rows = (db.query(StayMessageTemplate)
            .filter(StayMessageTemplate.agency_id == principal.agency_id)
            .order_by(StayMessageTemplate.trigger_event, StayMessageTemplate.name).all())
    return {"templates": [_template_dict(t) for t in rows],
            "placeholders": list(messages.PLACEHOLDERS), "triggers": list(messages.TRIGGERS)}


@app.post("/backoffice/sejours/messages/modeles", status_code=201)
async def create_message_template(request: Request, principal: Principal = Depends(get_principal),
                                  db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    payload, e = _template_payload(await json_body(request))
    if e:
        return e
    tpl = StayMessageTemplate(agency_id=principal.agency_id, **payload)
    db.add(tpl)
    db.commit()
    return {"template": _template_dict(tpl)}


@app.put("/backoffice/sejours/messages/modeles/{template_id}")
async def update_message_template(template_id: int, request: Request,
                                  principal: Principal = Depends(get_principal),
                                  db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    tpl = db.get(StayMessageTemplate, template_id)
    if tpl is None or tpl.agency_id != principal.agency_id:
        return err("Modèle introuvable", 404)
    payload, e = _template_payload(await json_body(request))
    if e:
        return e
    for key, value in payload.items():
        setattr(tpl, key, value)
    db.commit()
    return {"template": _template_dict(tpl)}


@app.delete("/backoffice/sejours/messages/modeles/{template_id}")
def delete_message_template(template_id: int, principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    """Le modèle part, son journal reste : savoir ce qui a été écrit au voyageur a de la valeur."""
    if (g := _gate(principal)) is not None:
        return g
    tpl = db.get(StayMessageTemplate, template_id)
    if tpl is None or tpl.agency_id != principal.agency_id:
        return err("Modèle introuvable", 404)
    tpl.active = False
    db.commit()
    return {"message": "Modèle désactivé"}


@app.get("/backoffice/sejours/messages")
def list_messages(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    rows = (db.query(StayMessage).filter(StayMessage.agency_id == principal.agency_id)
            .order_by(StayMessage.due_at.desc()).limit(200).all())
    return {"messages": [_message_dict(db, m) for m in rows],
            "pending": sum(1 for m in rows if m.status == "pending"),
            "no_recipient": sum(1 for m in rows if m.status == "no_recipient")}


@app.patch("/backoffice/sejours/{stay_id}/contact")
async def update_stay_contact(stay_id: int, request: Request,
                              principal: Principal = Depends(get_principal),
                              db: Session = Depends(get_db)):
    """Complète la fiche du voyageur : Airbnb ne publie pas son email, l'agence le saisit."""
    if (g := _gate(principal)) is not None:
        return g
    res = db.get(StayManagerReservation, stay_id)
    if res is None or res.agency_id != principal.agency_id:
        return err("Séjour introuvable", 404)
    data = await json_body(request)
    if "guest_email" in data:
        email = (data.get("guest_email") or "").strip()
        if email and not messages.valid_address(email):
            return err("Email invalide", 400)
        res.guest_email = email or None
    if "guest_name" in data:
        res.guest_name = (data.get("guest_name") or "").strip()[:255] or None
    if "guest_phone" in data:
        res.guest_phone = (data.get("guest_phone") or "").strip()[:50] or None
    db.commit()
    return {"stay": _stay_dict(db, res)}


def _prepare_due(db: Session, now: datetime) -> list[StayMessage]:
    """Crée les lignes des messages devenus dus. Idempotent par (modèle, séjour)."""
    templates = db.query(StayMessageTemplate).filter(StayMessageTemplate.active.is_(True)).all()
    if not templates:
        return []
    stays_rows = (db.query(StayManagerReservation)
                  .filter(StayManagerReservation.status == "confirmed",
                          StayManagerReservation.agency_id.isnot(None)).all())
    done = {(m.template_id, m.reservation_id) for m in db.query(StayMessage).all()}
    created: list[StayMessage] = []
    for res in stays_rows:
        for tpl in templates:
            if tpl.agency_id != res.agency_id:
                continue
            if tpl.property_id and tpl.property_id != res.property_id:
                continue
            # Un gabarit propre au bien remplace le gabarit général du même déclencheur.
            if not tpl.property_id and any(
                    o.agency_id == res.agency_id and o.property_id == res.property_id
                    and o.trigger_event == tpl.trigger_event for o in templates):
                continue
            if (tpl.id, res.id) in done or not messages.is_due(tpl, res, now):
                continue
            ro = db.get(PropertyRO, res.property_id) if res.property_id else None
            values = messages.variables(res, ro.title if ro else None,
                                        agency_client.name_of(res.agency_id))
            ready = messages.valid_address(res.guest_email or "")
            msg = StayMessage(
                agency_id=res.agency_id, template_id=tpl.id, reservation_id=res.id,
                recipient=res.guest_email,
                subject=messages.render(tpl.subject, values)[:messages.SUBJECT_MAX],
                body=messages.render(tpl.body, values), due_at=messages.due_at(tpl, res),
                status="pending" if ready else "no_recipient")
            done.add((tpl.id, res.id))
            # Une ligne par transaction : un séjour bancal ne doit pas emporter la fournée
            # entière, qui porte les messages de toutes les agences.
            try:
                with db.begin_nested():
                    db.add(msg)
                created.append(msg)
            except SQLAlchemyError:
                logger.warning("message de séjour non préparé", extra={"reservation_id": res.id,
                                                                      "template_id": tpl.id})
    db.commit()
    return created


@app.get("/internal/sejours/messages/due", include_in_schema=False)
def internal_due_messages(x_internal_token: str = Header(default=""),
                          db: Session = Depends(get_db)):
    """Messages à envoyer maintenant — pour l'ordonnanceur de notification."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    _prepare_due(db, datetime.utcnow())
    rows = db.query(StayMessage).filter(StayMessage.status == "pending").limit(200).all()
    return {"messages": [{"id": m.id, "agency_id": m.agency_id, "recipient": m.recipient,
                          "subject": m.subject, "body": m.body} for m in rows]}


@app.post("/internal/sejours/messages/{message_id}/sent", include_in_schema=False)
async def internal_mark_message(message_id: int, request: Request,
                                x_internal_token: str = Header(default=""),
                                db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    msg = db.get(StayMessage, message_id)
    if msg is not None:
        data = await json_body(request)
        failure = (data.get("error") or "").strip() if isinstance(data, dict) else ""
        msg.status = "failed" if failure else "sent"
        msg.error = failure[:255] or None
        msg.sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}
