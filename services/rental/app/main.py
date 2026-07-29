"""Service rental — gestion locative (schéma `rental`).

CRUD mandats de gestion + baux (back-office, gating `rental`). Émet rental.mandate.*/lease.*
(outbox) → notification (emails). Personnes = crm.Client (client_id) ; email résolu par notification.
"""
from contextlib import asynccontextmanager
from datetime import datetime
import uuid

from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import ClientRO, Lease, Mandate, PropertyRO, RentPeriod
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


def _lease_dict(l: Lease) -> dict:
    return {
        "id": l.id, "reference": l.reference, "mandate_id": l.mandate_id,
        "property_id": l.property_id, "tenant_client_id": l.tenant_client_id,
        "agency_id": l.agency_id, "rent_amount": num(l.rent_amount),
        "charges_amount": num(l.charges_amount), "deposit_amount": num(l.deposit_amount),
        "payment_day": l.payment_day, "start_date": iso(l.start_date), "end_date": iso(l.end_date),
        "irl_index_ref": l.irl_index_ref, "status": l.status, "signed_at": iso(l.signed_at),
        "notes": l.notes, "created_at": iso(l.created_at),
    }


def _emit_lease(db: Session, l: Lease, event_type: str) -> None:
    enqueue(db, "lease", l.id, event_type, {
        "id": l.id, "reference": l.reference, "mandate_id": l.mandate_id,
        "property_id": l.property_id, "tenant_client_id": l.tenant_client_id,
        "agency_id": l.agency_id, "rent_amount": num(l.rent_amount),
        "charges_amount": num(l.charges_amount), "deposit_amount": num(l.deposit_amount),
        "start_date": iso(l.start_date), "end_date": iso(l.end_date),
    })


_MONTHS_FR = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
              "Septembre", "Octobre", "Novembre", "Décembre"]


def _rent_period_dict(rp: RentPeriod) -> dict:
    return {
        "id": rp.id, "lease_id": rp.lease_id, "agency_id": rp.agency_id,
        "period_label": rp.period_label, "year": rp.year, "month": rp.month,
        "rent_amount": num(rp.rent_amount), "charges_amount": num(rp.charges_amount),
        "total_amount": num(rp.total_amount), "due_date": iso(rp.due_date), "status": rp.status,
        "paid_amount": num(rp.paid_amount), "paid_at": iso(rp.paid_at),
        "payment_method": rp.payment_method, "receipt_number": rp.receipt_number,
        "created_at": iso(rp.created_at),
    }


def _emit_rent_paid(db: Session, rp: RentPeriod, lease: Lease) -> None:
    enqueue(db, "rent_period", rp.id, events.RENT_PAID, {
        "id": rp.id, "lease_id": rp.lease_id, "agency_id": rp.agency_id,
        "tenant_client_id": lease.tenant_client_id, "property_id": lease.property_id,
        "period_label": rp.period_label, "total_amount": num(rp.total_amount),
        "paid_amount": num(rp.paid_amount), "receipt_number": rp.receipt_number,
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


@app.get("/backoffice/gestion-locative/leases")
def list_leases(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    q = db.query(Lease).filter(Lease.agency_id == principal.agency_id)
    return {"leases": [_lease_dict(l) for l in q.order_by(Lease.created_at.desc()).all()]}


@app.get("/backoffice/gestion-locative/leases/{lease_id}")
def get_lease(lease_id: int, principal: Principal = Depends(get_principal),
              db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    return _lease_dict(l)


@app.post("/backoffice/gestion-locative/leases", status_code=201)
async def create_lease(request: Request, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    data = await json_body(request)
    mandate = db.get(Mandate, data.get("mandate_id"))
    if mandate is None or mandate.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    if not data.get("tenant_client_id") or data.get("rent_amount") is None:
        return err("tenant_client_id et rent_amount sont requis.", 400)
    l = Lease(
        reference=_reference("BAIL"), mandate_id=mandate.id, property_id=mandate.property_id,
        tenant_client_id=data["tenant_client_id"], agency_id=principal.agency_id,
        rent_amount=data["rent_amount"], charges_amount=data.get("charges_amount", 0),
        deposit_amount=data.get("deposit_amount", 0), payment_day=data.get("payment_day", 1),
        start_date=_parse_dt(data.get("start_date")), end_date=_parse_dt(data.get("end_date")),
        irl_index_ref=data.get("irl_index_ref"), notes=data.get("notes"),
    )
    db.add(l)
    db.flush()
    _emit_lease(db, l, events.LEASE_CREATED)
    db.commit()
    return _lease_dict(l)


@app.patch("/backoffice/gestion-locative/leases/{lease_id}")
async def update_lease(lease_id: int, request: Request,
                       principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    data = await json_body(request)
    for field in ("rent_amount", "charges_amount", "deposit_amount", "payment_day",
                  "irl_index_ref", "notes"):
        if field in data:
            setattr(l, field, data[field])
    if "start_date" in data:
        l.start_date = _parse_dt(data["start_date"])
    if "end_date" in data:
        l.end_date = _parse_dt(data["end_date"])
    db.commit()
    return _lease_dict(l)


@app.post("/backoffice/gestion-locative/leases/{lease_id}/sign")
def sign_lease(lease_id: int, principal: Principal = Depends(get_principal),
               db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    l.status = "active"
    l.signed_at = datetime.utcnow()
    _emit_lease(db, l, events.LEASE_SIGNED)
    db.commit()
    return _lease_dict(l)


@app.get("/internal/leases/{lease_id}", include_in_schema=False)
def internal_lease(lease_id: int, x_internal_token: str = Header(default=""),
                   db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    l = db.get(Lease, lease_id)
    return {"lease": _lease_dict(l) if l else None}


@app.post("/internal/rent-periods/generate", include_in_schema=False)
def internal_generate_rent_periods(x_internal_token: str = Header(default=""),
                                   db: Session = Depends(get_db)):
    """Crée l'échéance du mois courant pour chaque bail actif (idempotent). Appelé par l'ordonnanceur."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    now = datetime.utcnow()
    y, m = now.year, now.month
    created = 0
    for l in db.query(Lease).filter(Lease.status == "active").all():
        if db.query(RentPeriod).filter(RentPeriod.lease_id == l.id, RentPeriod.year == y,
                                       RentPeriod.month == m).first():
            continue
        rent = l.rent_amount or 0
        charges = l.charges_amount or 0
        day = min(max(int(l.payment_day or 1), 1), 28)
        rp = RentPeriod(lease_id=l.id, agency_id=l.agency_id, period_label=f"{_MONTHS_FR[m]} {y}",
                        year=y, month=m, rent_amount=rent, charges_amount=charges,
                        total_amount=rent + charges, due_date=datetime(y, m, day), status="pending")
        db.add(rp)
        created += 1
    db.commit()
    return {"created": created}


@app.get("/backoffice/gestion-locative/leases/{lease_id}/rent-periods")
def list_rent_periods(lease_id: int, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    q = (db.query(RentPeriod).filter(RentPeriod.lease_id == lease_id)
         .order_by(RentPeriod.year.desc(), RentPeriod.month.desc()))
    return {"rent_periods": [_rent_period_dict(rp) for rp in q.all()]}


@app.post("/backoffice/gestion-locative/rent-periods/{period_id}/pay")
async def pay_rent_period(period_id: int, request: Request,
                          principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    rp = db.get(RentPeriod, period_id)
    if rp is None or rp.agency_id != principal.agency_id:
        return err("Échéance introuvable.", 404)
    data = await json_body(request)
    if data.get("amount") is None:
        return err("Le montant est requis.", 400)
    amount = float(data["amount"])
    rp.paid_amount = amount
    rp.payment_method = data.get("method", "virement")
    rp.paid_at = _parse_dt(data.get("paid_at")) or datetime.utcnow()
    rp.status = "paid" if amount >= float(rp.total_amount or 0) else "partial"
    if rp.status == "paid" and not rp.receipt_number:
        rp.receipt_number = _reference("QIT")
    lease = db.get(Lease, rp.lease_id)
    if rp.status == "paid":
        _emit_rent_paid(db, rp, lease)   # quittance envoyée par notification
    db.commit()
    return _rent_period_dict(rp)


@app.get("/backoffice/gestion-locative/rent-periods/{period_id}/receipt.pdf")
def rent_receipt_pdf(period_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    rp = db.get(RentPeriod, period_id)
    if rp is None or rp.agency_id != principal.agency_id:
        return err("Échéance introuvable.", 404)
    if not rp.receipt_number:
        return err("Quittance indisponible : échéance non réglée.", 400)
    lease = db.get(Lease, rp.lease_id)
    mandate = db.get(Mandate, lease.mandate_id) if lease else None
    tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
    landlord = db.get(ClientRO, mandate.landlord_client_id) if mandate else None
    prop = db.get(PropertyRO, lease.property_id) if lease else None
    from . import pdf as pdf_mod
    data = pdf_mod.render_receipt_pdf(
        rp,
        tenant_name=f"{tenant.first_name} {tenant.last_name}" if tenant else None,
        landlord_name=f"{landlord.first_name} {landlord.last_name}" if landlord else None,
        property_title=prop.title if prop else None)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={rp.receipt_number}.pdf"})
