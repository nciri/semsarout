"""Service rental — gestion locative (schéma `rental`).

CRUD mandats de gestion + baux (back-office, gating `rental`). Émet rental.mandate.*/lease.*
(outbox) → notification (emails). Personnes = crm.Client (client_id) ; email résolu par notification.
"""
from contextlib import asynccontextmanager
from datetime import datetime
import uuid

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import Lease, Mandate
from .util import err, iso, json_body, num

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


def _gate(principal: Principal) -> JSONResponse | None:
    if principal.agency_id is None or "rental" not in principal.features:
        return err("Fonction réservée aux plans Pro et Entreprise.", 403)
    return None


def _reference(prefix: str) -> str:
    return f"{prefix}-{datetime.utcnow().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"


def _parse_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _mandate_dict(m: Mandate) -> dict:
    return {
        "id": m.id, "reference": m.reference, "agency_id": m.agency_id,
        "property_id": m.property_id, "landlord_client_id": m.landlord_client_id,
        "mandate_type": m.mandate_type, "fee_percent": num(m.fee_percent),
        "landlord_iban": m.landlord_iban, "start_date": iso(m.start_date),
        "end_date": iso(m.end_date), "status": m.status, "signed_at": iso(m.signed_at),
        "notes": m.notes, "created_at": iso(m.created_at),
    }


def _emit_mandate(db: Session, m: Mandate, event_type: str) -> None:
    enqueue(db, "mandate", m.id, event_type, {
        "id": m.id, "reference": m.reference, "agency_id": m.agency_id,
        "property_id": m.property_id, "landlord_client_id": m.landlord_client_id,
        "mandate_type": m.mandate_type, "fee_percent": num(m.fee_percent),
        "start_date": iso(m.start_date), "end_date": iso(m.end_date),
    })


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok", "service": settings.service_name}


@app.get("/backoffice/gestion-locative/mandates")
def list_mandates(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    q = db.query(Mandate).filter(Mandate.agency_id == principal.agency_id)
    return {"mandates": [_mandate_dict(m) for m in q.order_by(Mandate.created_at.desc()).all()]}


@app.get("/backoffice/gestion-locative/mandates/{mandate_id}")
def get_mandate(mandate_id: int, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    m = db.get(Mandate, mandate_id)
    if m is None or m.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    return _mandate_dict(m)


@app.post("/backoffice/gestion-locative/mandates", status_code=201)
async def create_mandate(request: Request, principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    data = await json_body(request)
    if not data.get("property_id") or not data.get("landlord_client_id"):
        return err("property_id et landlord_client_id sont requis.", 400)
    m = Mandate(
        reference=_reference("MND"), agency_id=principal.agency_id,
        property_id=data["property_id"], landlord_client_id=data["landlord_client_id"],
        mandate_type=data.get("mandate_type", "gestion"), fee_percent=data.get("fee_percent"),
        landlord_iban=data.get("landlord_iban"),
        start_date=_parse_dt(data.get("start_date")), end_date=_parse_dt(data.get("end_date")),
        notes=data.get("notes"),
    )
    db.add(m)
    db.flush()
    _emit_mandate(db, m, events.MANDATE_CREATED)
    db.commit()
    return _mandate_dict(m)


@app.patch("/backoffice/gestion-locative/mandates/{mandate_id}")
async def update_mandate(mandate_id: int, request: Request,
                         principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    m = db.get(Mandate, mandate_id)
    if m is None or m.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    data = await json_body(request)
    for field in ("mandate_type", "fee_percent", "landlord_iban", "notes"):
        if field in data:
            setattr(m, field, data[field])
    if "start_date" in data:
        m.start_date = _parse_dt(data["start_date"])
    if "end_date" in data:
        m.end_date = _parse_dt(data["end_date"])
    db.commit()
    return _mandate_dict(m)


@app.post("/backoffice/gestion-locative/mandates/{mandate_id}/sign")
def sign_mandate(mandate_id: int, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    m = db.get(Mandate, mandate_id)
    if m is None or m.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    m.status = "active"
    m.signed_at = datetime.utcnow()
    _emit_mandate(db, m, events.MANDATE_SIGNED)
    db.commit()
    return _mandate_dict(m)


@app.get("/internal/mandates/{mandate_id}", include_in_schema=False)
def internal_mandate(mandate_id: int, x_internal_token: str = Header(default=""),
                     db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    m = db.get(Mandate, mandate_id)
    return {"mandate": _mandate_dict(m) if m else None}
