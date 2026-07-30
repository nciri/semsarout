"""Service rental — gestion locative (schéma `rental`).

CRUD mandats de gestion + baux (back-office, gating `rental`). Émet rental.mandate.*/lease.*
(outbox) → notification (emails). Personnes = crm.Client (client_id) ; email résolu par notification.
"""
from contextlib import asynccontextmanager
from datetime import datetime
import json
import os
import uuid

import httpx
from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, signing
from .db import get_db, init_db
from .models import (ApplicationDocument, ChargeRegularization, ClientRO, CrgReport,
                     DeductionLine, DepositSettlement, Inventory, InventoryItem, InventoryPhoto,
                     InventoryRoom, Lease, Mandate, PropertyRO, RentPeriod, SignatureRequest,
                     TenantApplication)
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


def _mandate_pdf_bytes(db, mandate):
    landlord = db.get(ClientRO, mandate.landlord_client_id)
    prop = db.get(PropertyRO, mandate.property_id)
    from . import pdf as pdf_mod
    return pdf_mod.render_mandate_pdf(
        mandate, landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        property_title=(prop.title if prop else None))


@app.get("/backoffice/gestion-locative/mandates/{mandate_id}.pdf")
def mandate_pdf(mandate_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    m = db.get(Mandate, mandate_id)
    if m is None or m.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    return Response(_mandate_pdf_bytes(db, m), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=mandat-{mandate_id}.pdf"})


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


@app.get("/internal/mandates/due-crg", include_in_schema=False)
def internal_mandates_due_crg(x_internal_token: str = Header(default=""),
                              db: Session = Depends(get_db)):
    """Mandats actifs avec des loyers encaissés le mois dernier, sans CRG encore émis pour ce mois."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    y, m = _prev_period(datetime.utcnow())
    out = []
    for mnd in db.query(Mandate).filter(Mandate.status == "active").all():
        if db.query(CrgReport).filter(CrgReport.mandate_id == mnd.id, CrgReport.year == y,
                                      CrgReport.month == m).first():
            continue
        agg = _crg_aggregate(db, mnd, y, m)
        if agg["rent_collected"] <= 0:
            continue
        out.append({"mandate_id": mnd.id, "landlord_client_id": mnd.landlord_client_id,
                    "period_label": f"{_MONTHS_FR[m]} {y}", "year": y, "month": m, **agg})
    return {"reports": out}


@app.get("/internal/mandates/due-expiry", include_in_schema=False)
def internal_mandates_due_expiry(x_internal_token: str = Header(default=""),
                                 db: Session = Depends(get_db)):
    """Mandats actifs arrivant à échéance dans ≤ 60 j, sans avis encore envoyé."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    from datetime import timedelta
    now = datetime.utcnow()
    horizon = now + timedelta(days=60)
    rows = (db.query(Mandate)
            .filter(Mandate.status == "active", Mandate.expiry_notice_sent_at.is_(None),
                    Mandate.end_date.isnot(None), Mandate.end_date > now,
                    Mandate.end_date <= horizon).all())
    return {"mandates": [{"id": m.id, "landlord_client_id": m.landlord_client_id,
                          "reference": m.reference, "end_date": iso(m.end_date)} for m in rows]}


@app.post("/internal/mandates/{mandate_id}/expiry-notice-sent", include_in_schema=False)
def internal_mandate_expiry_sent(mandate_id: int, x_internal_token: str = Header(default=""),
                                 db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    m = db.get(Mandate, mandate_id)
    if m is not None:
        m.expiry_notice_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


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


def _lease_pdf_bytes(db, lease):
    mandate = db.get(Mandate, lease.mandate_id)
    tenant = db.get(ClientRO, lease.tenant_client_id)
    landlord = db.get(ClientRO, mandate.landlord_client_id) if mandate else None
    prop = db.get(PropertyRO, lease.property_id)
    from . import pdf as pdf_mod
    return pdf_mod.render_lease_pdf(
        lease, mandate,
        tenant_name=(f"{tenant.first_name} {tenant.last_name}" if tenant else None),
        landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        property_title=(prop.title if prop else None))


@app.get("/backoffice/gestion-locative/leases/{lease_id}.pdf")
def lease_pdf(lease_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    return Response(_lease_pdf_bytes(db, l), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=bail-{lease_id}.pdf"})


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


@app.post("/backoffice/gestion-locative/leases/{lease_id}/deposit-return")
async def deposit_return(lease_id: int, request: Request,
                         principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    if l.deposit_returned_at is not None:
        return err("Dépôt déjà restitué.", 400)
    data = await json_body(request)
    amount = data.get("amount") or l.deposit_amount
    l.deposit_returned_at = datetime.utcnow()
    l.deposit_return_amount = amount
    enqueue(db, "lease", l.id, events.DEPOSIT_RETURNED, {
        "id": l.id, "tenant_client_id": l.tenant_client_id, "property_id": l.property_id,
        "deposit_amount": num(l.deposit_amount), "return_amount": num(amount)})
    db.commit()
    return _lease_dict(l)


@app.post("/backoffice/gestion-locative/leases/{lease_id}/revise")
async def revise_lease(lease_id: int, request: Request,
                       principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    data = await json_body(request)
    if data.get("new_rent") is None:
        return err("new_rent est requis.", 400)
    old_rent = num(l.rent_amount)
    l.rent_amount = data["new_rent"]
    l.last_revision_at = datetime.utcnow()
    effective = _parse_dt(data.get("effective_date"))
    enqueue(db, "lease", l.id, events.LEASE_REVISED, {
        "id": l.id, "tenant_client_id": l.tenant_client_id, "property_id": l.property_id,
        "old_rent": old_rent, "new_rent": num(l.rent_amount),
        "effective_date": iso(effective)})
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


_RENT_FIRST_REMINDER_DAYS = 3
_RENT_REMINDER_INTERVAL_DAYS = 7
_RENT_MAX_REMINDERS = 3


@app.get("/internal/rent-periods/due-reminders", include_in_schema=False)
def internal_rent_due_reminders(x_internal_token: str = Header(default=""),
                                db: Session = Depends(get_db)):
    """Échéances impayées dues pour une relance (J+3 après échéance, puis toutes les 7 j, max 3)."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    from datetime import timedelta
    now = datetime.utcnow()
    out = []
    rows = (db.query(RentPeriod)
            .filter(RentPeriod.status.in_(["pending", "partial", "late"]),
                    RentPeriod.due_date.isnot(None)).all())
    for rp in rows:
        count = rp.reminder_count or 0
        if count >= _RENT_MAX_REMINDERS:
            continue
        if count == 0:
            due = rp.due_date <= now - timedelta(days=_RENT_FIRST_REMINDER_DAYS)
        else:
            due = rp.last_reminder_at is not None and \
                rp.last_reminder_at <= now - timedelta(days=_RENT_REMINDER_INTERVAL_DAYS)
        if not due:
            continue
        lease = db.get(Lease, rp.lease_id)
        out.append({"id": rp.id, "tenant_client_id": lease.tenant_client_id if lease else None,
                    "period_label": rp.period_label, "total_amount": num(rp.total_amount),
                    "reminder_count": count})
    return {"rent_periods": out}


@app.post("/internal/rent-periods/{period_id}/reminder-sent", include_in_schema=False)
def internal_rent_reminder_sent(period_id: int, x_internal_token: str = Header(default=""),
                                db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    rp = db.get(RentPeriod, period_id)
    if rp is not None and rp.status in ("pending", "partial", "late"):
        rp.reminder_count = (rp.reminder_count or 0) + 1
        rp.last_reminder_at = datetime.utcnow()
        if rp.status == "pending":
            rp.status = "late"
        db.commit()
    return {"ok": True}


@app.get("/internal/rent-periods/due-payouts", include_in_schema=False)
def internal_rent_due_payouts(x_internal_token: str = Header(default=""),
                              db: Session = Depends(get_db)):
    """Loyers encaissés à reverser au propriétaire (avis de virement non encore envoyé)."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    out = []
    rows = (db.query(RentPeriod)
            .filter(RentPeriod.status == "paid", RentPeriod.payout_sent_at.is_(None)).all())
    for rp in rows:
        lease = db.get(Lease, rp.lease_id)
        mandate = db.get(Mandate, lease.mandate_id) if lease else None
        if mandate is None:
            continue
        fee = float(mandate.fee_percent or 0)
        gross = min(float(rp.paid_amount or rp.total_amount or 0), float(rp.total_amount or 0))
        net = round(gross * (1 - fee / 100.0), 2)
        out.append({"id": rp.id, "landlord_client_id": mandate.landlord_client_id,
                    "period_label": rp.period_label, "gross_amount": gross,
                    "fee_percent": fee, "net_amount": net})
    return {"rent_periods": out}


@app.post("/internal/rent-periods/{period_id}/payout-sent", include_in_schema=False)
def internal_rent_payout_sent(period_id: int, x_internal_token: str = Header(default=""),
                              db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    rp = db.get(RentPeriod, period_id)
    if rp is not None:
        rp.payout_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


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
    was_paid = rp.status == "paid"
    data = await json_body(request)
    if data.get("amount") is None:
        return err("Le montant est requis.", 400)
    amount = float(data["amount"])
    if amount <= 0:
        return err("Le montant doit être positif.", 400)
    rp.paid_amount = amount
    rp.payment_method = data.get("method", "virement")
    rp.paid_at = _parse_dt(data.get("paid_at")) or datetime.utcnow()
    rp.status = "paid" if amount >= float(rp.total_amount or 0) else "partial"
    if rp.status == "paid" and not rp.receipt_number:
        rp.receipt_number = _reference("QIT")
    lease = db.get(Lease, rp.lease_id)
    if rp.status == "paid" and not was_paid:
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


@app.get("/internal/rent-periods/{period_id}/receipt.pdf", include_in_schema=False)
def internal_receipt_pdf(period_id: int, x_internal_token: str = Header(default=""),
                         db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    rp = db.get(RentPeriod, period_id)
    if rp is None or not rp.receipt_number:
        return err("Quittance indisponible.", 404)
    lease = db.get(Lease, rp.lease_id)
    mandate = db.get(Mandate, lease.mandate_id) if lease else None
    tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
    landlord = db.get(ClientRO, mandate.landlord_client_id) if mandate else None
    prop = db.get(PropertyRO, lease.property_id) if lease else None
    from . import pdf as pdf_mod
    data = pdf_mod.render_receipt_pdf(
        rp, tenant_name=(f"{tenant.first_name} {tenant.last_name}" if tenant else None),
        landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        property_title=(prop.title if prop else None))
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={rp.receipt_number}.pdf"})


def _prev_period(now: datetime) -> tuple[int, int]:
    """Mois précédent (couvert par le CRG émis en début de mois courant)."""
    return (now.year - 1, 12) if now.month == 1 else (now.year, now.month - 1)


def _crg_aggregate(db, mandate, y: int, m: int) -> dict:
    """Agrège les loyers encaissés des baux d'un mandat pour un mois donné."""
    lease_ids = [l.id for l in db.query(Lease).filter(Lease.mandate_id == mandate.id).all()]
    collected = 0.0
    if lease_ids:
        rows = (db.query(RentPeriod)
                .filter(RentPeriod.lease_id.in_(lease_ids), RentPeriod.year == y,
                        RentPeriod.month == m, RentPeriod.status == "paid").all())
        collected = sum(float(rp.paid_amount or rp.total_amount or 0) for rp in rows)
    fee_pct = float(mandate.fee_percent or 0)
    fees = round(collected * fee_pct / 100.0, 2)
    return {"rent_collected": round(collected, 2), "fees": fees,
            "net": round(collected - fees, 2)}


@app.post("/internal/mandates/{mandate_id}/crg-sent", include_in_schema=False)
async def internal_mandate_crg_sent(mandate_id: int, request: Request,
                                    x_internal_token: str = Header(default=""),
                                    db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    mnd = db.get(Mandate, mandate_id)
    if mnd is None:
        return {"ok": True}
    data = await json_body(request)
    y, m = _prev_period(datetime.utcnow())
    if not db.query(CrgReport).filter(CrgReport.mandate_id == mnd.id, CrgReport.year == y,
                                      CrgReport.month == m).first():
        db.add(CrgReport(mandate_id=mnd.id, agency_id=mnd.agency_id,
                         period_label=f"{_MONTHS_FR[m]} {y}", year=y, month=m,
                         rent_collected=data.get("rent_collected", 0), fees=data.get("fees", 0),
                         net=data.get("net", 0), sent_at=datetime.utcnow()))
        db.commit()
    return {"ok": True}


@app.get("/backoffice/gestion-locative/mandates/{mandate_id}/crg")
def list_crg(mandate_id: int, principal: Principal = Depends(get_principal),
             db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    mnd = db.get(Mandate, mandate_id)
    if mnd is None or mnd.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    q = (db.query(CrgReport).filter(CrgReport.mandate_id == mandate_id)
         .order_by(CrgReport.year.desc(), CrgReport.month.desc()))
    return {"reports": [{"id": c.id, "period_label": c.period_label, "year": c.year,
                         "month": c.month, "rent_collected": num(c.rent_collected),
                         "fees": num(c.fees), "net": num(c.net), "sent_at": iso(c.sent_at)}
                        for c in q.all()]}


@app.get("/backoffice/gestion-locative/mandates/{mandate_id}/crg/{crg_id}.pdf")
def crg_pdf(mandate_id: int, crg_id: int, principal: Principal = Depends(get_principal),
            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    crg = db.get(CrgReport, crg_id)
    if crg is None or crg.mandate_id != mandate_id or crg.agency_id != principal.agency_id:
        return err("CRG introuvable.", 404)
    mnd = db.get(Mandate, mandate_id)
    landlord = db.get(ClientRO, mnd.landlord_client_id) if mnd else None
    from . import pdf as pdf_mod
    data = pdf_mod.render_crg_pdf(
        crg, landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        mandate_reference=mnd.reference if mnd else None)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=CRG-{crg.year}-{crg.month:02d}.pdf"})


def _charge_reg_dict(cr: ChargeRegularization) -> dict:
    return {"id": cr.id, "lease_id": cr.lease_id, "year": cr.year,
            "provisions_total": num(cr.provisions_total), "actual_total": num(cr.actual_total),
            "balance": num(cr.balance), "status": cr.status,
            "statement_sent_at": iso(cr.statement_sent_at), "created_at": iso(cr.created_at)}


@app.post("/backoffice/gestion-locative/leases/{lease_id}/charge-regularizations", status_code=201)
async def create_charge_reg(lease_id: int, request: Request,
                            principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    data = await json_body(request)
    if data.get("year") is None or data.get("actual_total") is None:
        return err("year et actual_total sont requis.", 400)
    year = int(data["year"])
    provisions = sum(float(rp.charges_amount or 0) for rp in db.query(RentPeriod).filter(
        RentPeriod.lease_id == lease_id, RentPeriod.year == year, RentPeriod.status == "paid").all())
    actual = float(data["actual_total"])
    cr = ChargeRegularization(lease_id=lease_id, agency_id=principal.agency_id, year=year,
                              provisions_total=round(provisions, 2), actual_total=actual,
                              balance=round(actual - provisions, 2))
    db.add(cr)
    db.commit()
    return _charge_reg_dict(cr)


@app.get("/backoffice/gestion-locative/leases/{lease_id}/charge-regularizations")
def list_charge_reg(lease_id: int, principal: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    q = (db.query(ChargeRegularization).filter(ChargeRegularization.lease_id == lease_id)
         .order_by(ChargeRegularization.year.desc()))
    return {"charge_regularizations": [_charge_reg_dict(cr) for cr in q.all()]}


@app.post("/backoffice/gestion-locative/charge-regularizations/{reg_id}/send")
def send_charge_reg(reg_id: int, principal: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    cr = db.get(ChargeRegularization, reg_id)
    if cr is None or cr.agency_id != principal.agency_id:
        return err("Régularisation introuvable.", 404)
    if cr.status == "sent":
        return err("Régularisation déjà envoyée.", 400)
    lease = db.get(Lease, cr.lease_id)
    cr.status = "sent"
    cr.statement_sent_at = datetime.utcnow()
    enqueue(db, "charge_regularization", cr.id, events.CHARGE_REGULARIZED, {
        "id": cr.id, "tenant_client_id": lease.tenant_client_id if lease else None,
        "year": cr.year, "provisions_total": num(cr.provisions_total),
        "actual_total": num(cr.actual_total), "balance": num(cr.balance)})
    db.commit()
    return _charge_reg_dict(cr)


def _property_lookup(property_id: int) -> dict:
    """Bien -> agence/propriétaire via l'endpoint interne listing (aiguillage)."""
    base = os.environ.get("LISTING_URL", "http://localhost:8012")
    try:
        r = httpx.get(f"{base}/internal/property/{property_id}",
                      headers={"x-internal-token": settings.internal_token}, timeout=5.0)
        return (r.json().get("property") or {}) if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return {}


def _user_lookup(user_id: int) -> dict:
    """Utilisateur (email/nom) via l'endpoint interne identity — pour l'email authentifié du candidat."""
    base = os.environ.get("IDENTITY_URL", "http://localhost:8501")
    try:
        r = httpx.get(f"{base}/internal/user/{user_id}",
                      headers={"x-internal-token": settings.internal_token}, timeout=5.0)
        return (r.json().get("user") or {}) if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return {}


def _client_lookup(client_id: int) -> dict:
    """Client CRM -> email/nom via l'endpoint interne crm (dossiers déposés par l'agence)."""
    base = os.environ.get("CRM_URL", "http://localhost:8013")
    try:
        r = httpx.get(f"{base}/internal/client/{client_id}",
                      headers={"x-internal-token": settings.internal_token}, timeout=5.0)
        return (r.json().get("client") or {}) if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return {}


def _application_dict(db, a: TenantApplication, docs=None) -> dict:
    ro = db.get(PropertyRO, a.property_id)
    out = {
        "id": a.id, "property_id": a.property_id, "agency_id": a.agency_id,
        "applicant_user_id": a.applicant_user_id,
        "submitted_by_agent_id": a.submitted_by_agent_id, "client_id": a.client_id,
        "applicant_name": a.applicant_name,
        "applicant_email": a.applicant_email, "applicant_phone": a.applicant_phone,
        "monthly_income": num(a.monthly_income), "guarantor_name": a.guarantor_name,
        "guarantor_income": num(a.guarantor_income), "status": a.status,
        "submitted_at": iso(a.submitted_at), "decided_at": iso(a.decided_at),
        "decision_reason": a.decision_reason, "created_at": iso(a.created_at),
        "property_title": (ro.title if ro else None),
    }
    if docs is not None:
        out["documents"] = [{"id": d.id, "doc_type": d.doc_type, "status": d.status,
                             "filename": d.filename, "created_at": iso(d.created_at)} for d in docs]
    return out


@app.post("/gestion-locative/applications", status_code=201)
async def submit_application(request: Request, principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    """Candidature d'un utilisateur connecté (grand public) sur un bien. PAS de gating agence."""
    if not principal.sub:
        return err("Authentification requise.", 401)
    data = await json_body(request)
    if not data.get("property_id"):
        return err("property_id est requis.", 400)
    try:
        property_id = int(data["property_id"])
    except (TypeError, ValueError):
        return err("property_id invalide.", 400)
    prop = _property_lookup(property_id)
    account = _user_lookup(int(principal.sub))
    applicant_email = account.get("email") or data.get("applicant_email")
    applicant_name = data.get("applicant_name") or account.get("name")
    a = TenantApplication(
        property_id=property_id, agency_id=prop.get("agency_id"),
        owner_id=prop.get("owner_id"), applicant_user_id=int(principal.sub),
        applicant_name=applicant_name, applicant_email=applicant_email,
        applicant_phone=data.get("applicant_phone"), monthly_income=data.get("monthly_income"),
        guarantor_name=data.get("guarantor_name"), guarantor_income=data.get("guarantor_income"),
        status="received")
    db.add(a)
    db.flush()
    enqueue(db, "tenant_application", a.id, events.APPLICATION_RECEIVED, {
        "id": a.id, "applicant_email": a.applicant_email, "applicant_name": a.applicant_name,
        "property_id": a.property_id, "property_title": prop.get("title")})
    db.commit()
    return _application_dict(db, a)


@app.post("/backoffice/gestion-locative/applications", status_code=201)
async def create_application_for_client(request: Request, principal: Principal = Depends(get_principal),
                                        db: Session = Depends(get_db)):
    """Dépôt d'un dossier de candidature par l'agence, pour le compte d'un crm.Client."""
    if (g := _gate(principal)) is not None:
        return g
    data = await json_body(request)
    if not data.get("property_id") or not data.get("client_id"):
        return err("property_id et client_id sont requis.", 400)
    try:
        property_id = int(data["property_id"])
        client_id = int(data["client_id"])
    except (TypeError, ValueError):
        return err("property_id/client_id invalide.", 400)
    client = _client_lookup(client_id)
    if not client or client.get("agency_id") != principal.agency_id:
        return err("Client introuvable.", 404)
    prop = _property_lookup(property_id)
    if not prop or prop.get("agency_id") != principal.agency_id:
        return err("Bien introuvable.", 404)
    a = TenantApplication(
        property_id=property_id, agency_id=principal.agency_id,
        owner_id=prop.get("owner_id"), applicant_user_id=None, client_id=client_id,
        submitted_by_agent_id=int(principal.sub),
        applicant_name=client.get("name"), applicant_email=client.get("email"),
        applicant_phone=client.get("phone"), monthly_income=data.get("monthly_income"),
        guarantor_name=data.get("guarantor_name"), guarantor_income=data.get("guarantor_income"),
        status="received")
    db.add(a)
    db.flush()
    enqueue(db, "tenant_application", a.id, events.APPLICATION_RECEIVED, {
        "id": a.id, "applicant_email": a.applicant_email, "applicant_name": a.applicant_name,
        "property_id": a.property_id, "property_title": prop.get("title"), "by_agent": True})
    db.commit()
    return _application_dict(db, a)


def _own_application(db, application_id: int, principal: Principal):
    a = db.get(TenantApplication, application_id)
    if a is None or a.applicant_user_id != int(principal.sub):
        return None
    return a


@app.get("/gestion-locative/applications")
def my_applications(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    q = (db.query(TenantApplication)
         .filter(TenantApplication.applicant_user_id == int(principal.sub))
         .order_by(TenantApplication.created_at.desc()))
    return {"applications": [_application_dict(db, a) for a in q.all()]}


@app.get("/gestion-locative/applications/{application_id}")
def my_application(application_id: int, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    a = _own_application(db, application_id, principal)
    if a is None:
        return err("Candidature introuvable.", 404)
    docs = db.query(ApplicationDocument).filter(
        ApplicationDocument.application_id == a.id).all()
    return _application_dict(db, a, docs=docs)


@app.post("/gestion-locative/applications/{application_id}/withdraw")
def withdraw_application(application_id: int, principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    a = _own_application(db, application_id, principal)
    if a is None:
        return err("Candidature introuvable.", 404)
    if a.status in ("accepted", "rejected"):
        return err("Candidature déjà traitée.", 400)
    a.status = "withdrawn"
    db.commit()
    return _application_dict(db, a)


@app.post("/backoffice/gestion-locative/applications/{application_id}/shortlist")
def shortlist_application(application_id: int, principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    a = db.get(TenantApplication, application_id)
    if a is None or a.agency_id != principal.agency_id:
        return err("Candidature introuvable.", 404)
    if a.status not in ("received", "reviewing", "shortlist"):
        return err("Candidature déjà traitée.", 400)
    a.status = "shortlist"
    db.commit()
    return _application_dict(db, a)


@app.get("/internal/applications/due-missing-docs-reminders", include_in_schema=False)
def internal_apps_due_missing_docs(x_internal_token: str = Header(default=""),
                                   db: Session = Depends(get_db)):
    """Candidatures actives, soumises il y a ≥ 3 j, sans aucune pièce, non encore relancées."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=3)
    out = []
    rows = (db.query(TenantApplication)
            .filter(TenantApplication.status.in_(["received", "reviewing", "shortlist"]),
                    TenantApplication.missing_docs_reminder_sent_at.is_(None),
                    TenantApplication.submitted_at <= cutoff).all())
    for a in rows:
        doc_count = db.query(ApplicationDocument).filter(
            ApplicationDocument.application_id == a.id).count()
        if doc_count == 0:
            out.append({"id": a.id, "applicant_email": a.applicant_email,
                        "applicant_name": a.applicant_name})
    return {"applications": out}


@app.post("/internal/applications/{application_id}/missing-docs-reminder-sent", include_in_schema=False)
def internal_app_missing_docs_sent(application_id: int, x_internal_token: str = Header(default=""),
                                   db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    a = db.get(TenantApplication, application_id)
    if a is not None:
        a.missing_docs_reminder_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


@app.post("/gestion-locative/applications/{application_id}/documents", status_code=201)
async def upload_document(application_id: int, request: Request,
                          principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    a = _own_application(db, application_id, principal)
    if a is None:
        return err("Candidature introuvable.", 404)
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    body = await request.body()
    if not body:
        return err("Fichier vide.", 400)
    if len(body) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    doc_type = request.query_params.get("doc_type", "autre")
    filename = request.query_params.get("filename", "piece")
    content_type = request.headers.get("content-type", "application/octet-stream")
    from . import storage
    key = f"applications/{a.id}/{uuid.uuid4().hex}"
    storage.docs_storage().put(key, body, content_type)
    d = ApplicationDocument(application_id=a.id, doc_type=doc_type, status="received",
                            file_key=key, filename=filename, content_type=content_type)
    db.add(d)
    db.commit()
    return {"id": d.id, "doc_type": d.doc_type, "status": d.status, "filename": d.filename}


@app.post("/backoffice/gestion-locative/applications/{application_id}/documents", status_code=201)
async def upload_document_agency(application_id: int, request: Request,
                                 principal: Principal = Depends(get_principal),
                                 db: Session = Depends(get_db)):
    """Dépôt d'une pièce par l'agence sur un dossier de candidature de son périmètre."""
    if (g := _gate(principal)) is not None:
        return g
    a = db.get(TenantApplication, application_id)
    if a is None or a.agency_id != principal.agency_id:
        return err("Candidature introuvable.", 404)
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    body = await request.body()
    if not body:
        return err("Fichier vide.", 400)
    if len(body) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    doc_type = request.query_params.get("doc_type", "autre")
    filename = request.query_params.get("filename", "piece")
    content_type = request.headers.get("content-type", "application/octet-stream")
    from . import storage
    key = f"applications/{a.id}/{uuid.uuid4().hex}"
    storage.docs_storage().put(key, body, content_type)
    d = ApplicationDocument(application_id=a.id, doc_type=doc_type, status="received",
                            file_key=key, filename=filename, content_type=content_type)
    db.add(d)
    db.commit()
    return {"id": d.id, "doc_type": d.doc_type, "status": d.status, "filename": d.filename}


@app.get("/gestion-locative/applications/{application_id}/documents/{doc_id}")
def download_document(application_id: int, doc_id: int,
                      principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    a = db.get(TenantApplication, application_id)
    d = db.get(ApplicationDocument, doc_id)
    if a is None or d is None or d.application_id != a.id:
        return err("Pièce introuvable.", 404)
    is_owner = a.applicant_user_id == int(principal.sub)
    is_agency = principal.agency_id is not None and a.agency_id == principal.agency_id
    if not (is_owner or is_agency):
        return err("Accès refusé.", 403)
    from . import storage
    data = storage.docs_storage().get(d.file_key)
    return Response(data, media_type=d.content_type or "application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename={d.filename or 'piece'}",
                             "X-Content-Type-Options": "nosniff"})


@app.patch("/backoffice/gestion-locative/applications/{application_id}/documents/{doc_id}")
async def validate_document(application_id: int, doc_id: int, request: Request,
                            principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    a = db.get(TenantApplication, application_id)
    d = db.get(ApplicationDocument, doc_id)
    if a is None or d is None or d.application_id != a.id or a.agency_id != principal.agency_id:
        return err("Pièce introuvable.", 404)
    data = await json_body(request)
    status = data.get("status")
    if status not in ("validated", "rejected", "received"):
        return err("Statut invalide.", 400)
    d.status = status
    db.commit()
    return {"id": d.id, "status": d.status}


@app.get("/backoffice/gestion-locative/applications")
def agency_applications(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    q = (db.query(TenantApplication)
         .filter(TenantApplication.agency_id == principal.agency_id)
         .order_by(TenantApplication.created_at.desc()))
    return {"applications": [_application_dict(db, a) for a in q.all()]}


@app.get("/backoffice/gestion-locative/applications/{application_id}")
def agency_application(application_id: int, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    a = db.get(TenantApplication, application_id)
    if a is None or a.agency_id != principal.agency_id:
        return err("Candidature introuvable.", 404)
    docs = db.query(ApplicationDocument).filter(ApplicationDocument.application_id == a.id).all()
    return _application_dict(db, a, docs=docs)


@app.post("/backoffice/gestion-locative/applications/{application_id}/decide")
async def decide_application(application_id: int, request: Request,
                             principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    a = db.get(TenantApplication, application_id)
    if a is None or a.agency_id != principal.agency_id:
        return err("Candidature introuvable.", 404)
    if a.status in ("accepted", "rejected", "withdrawn"):
        return err("Candidature déjà traitée.", 400)
    data = await json_body(request)
    decision = data.get("decision")
    if decision not in ("accepted", "rejected"):
        return err("decision doit être 'accepted' ou 'rejected'.", 400)
    a.status = decision
    a.decided_at = datetime.utcnow()
    a.decision_reason = data.get("reason")
    ro = db.get(PropertyRO, a.property_id)
    enqueue(db, "tenant_application", a.id, events.APPLICATION_DECIDED, {
        "id": a.id, "applicant_email": a.applicant_email, "applicant_name": a.applicant_name,
        "property_id": a.property_id, "property_title": (ro.title if ro else None),
        "decision": decision, "reason": a.decision_reason})
    db.commit()
    return _application_dict(db, a)


# --- État des lieux (EDL) --------------------------------------------------

_DEFAULT_EDL = [
    ("Entrée", ["Murs", "Sol", "Plafond", "Porte", "Interrupteurs"]),
    ("Séjour", ["Murs", "Sol", "Plafond", "Fenêtres", "Volets", "Électricité"]),
    ("Cuisine", ["Murs", "Sol", "Plan de travail", "Évier", "Robinetterie", "Placards", "Électroménager"]),
    ("Chambre", ["Murs", "Sol", "Plafond", "Fenêtres", "Placards"]),
    ("Salle de bain", ["Murs", "Sol", "Douche/Baignoire", "Lavabo", "Robinetterie", "WC"]),
]


def _photo_dict(p: InventoryPhoto) -> dict:
    return {"id": p.id, "filename": p.filename, "content_type": p.content_type, "created_at": iso(p.created_at)}


def _inventory_dict(db: Session, inv: Inventory, full: bool = False) -> dict:
    out = {"id": inv.id, "lease_id": inv.lease_id, "type": inv.type, "status": inv.status,
           "general_notes": inv.general_notes, "conducted_at": iso(inv.conducted_at),
           "finalized_at": iso(inv.finalized_at), "signed_at": iso(inv.signed_at),
           "has_pdf": bool(inv.pdf_key), "created_at": iso(inv.created_at)}
    if full:
        rooms = (db.query(InventoryRoom).filter(InventoryRoom.inventory_id == inv.id)
                 .order_by(InventoryRoom.position, InventoryRoom.id).all())
        out["rooms"] = []
        for r in rooms:
            items = (db.query(InventoryItem).filter(InventoryItem.room_id == r.id)
                     .order_by(InventoryItem.position, InventoryItem.id).all())
            out["rooms"].append({"id": r.id, "name": r.name, "position": r.position, "items": [
                {"id": it.id, "label": it.label, "condition": it.condition, "comment": it.comment,
                 "photos": [_photo_dict(p) for p in db.query(InventoryPhoto).filter(
                     InventoryPhoto.item_id == it.id).order_by(InventoryPhoto.id).all()]}
                for it in items]})
    return out


@app.post("/backoffice/gestion-locative/leases/{lease_id}/inventories", status_code=201)
async def create_inventory(lease_id: int, request: Request,
                           principal: Principal = Depends(get_principal),
                           db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    data = await json_body(request)
    edl_type = data.get("type")
    if edl_type not in ("entree", "sortie"):
        return err("type doit être 'entree' ou 'sortie'.", 400)
    if db.query(Inventory).filter(Inventory.lease_id == lease_id, Inventory.type == edl_type).first():
        return err("Un état des lieux de ce type existe déjà pour ce bail.", 400)
    inv = Inventory(lease_id=lease_id, agency_id=principal.agency_id, type=edl_type,
                    conducted_by_id=int(principal.sub) if principal.sub else None,
                    conducted_at=datetime.utcnow())
    db.add(inv)
    db.flush()
    if data.get("prefill", True):   # pré-remplir avec le jeu par défaut
        for ri, (rname, items) in enumerate(_DEFAULT_EDL):
            room = InventoryRoom(inventory_id=inv.id, name=rname, position=ri)
            db.add(room)
            db.flush()
            for ii, label in enumerate(items):
                db.add(InventoryItem(room_id=room.id, label=label, position=ii))
    db.commit()
    return _inventory_dict(db, inv, full=True)


@app.get("/backoffice/gestion-locative/leases/{lease_id}/inventories")
def list_inventories(lease_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    rows = db.query(Inventory).filter(Inventory.lease_id == lease_id).order_by(Inventory.type).all()
    return {"inventories": [_inventory_dict(db, i) for i in rows]}


def _inventory_pdf_bytes(db, inv):
    from . import storage
    if inv.pdf_key:
        return storage.docs_storage().get(inv.pdf_key)
    rooms = _inventory_dict(db, inv, full=True)["rooms"]   # PDF à la volée si pas encore finalisé
    lease = db.get(Lease, inv.lease_id)
    prop = db.get(PropertyRO, lease.property_id) if lease else None
    tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
    from . import pdf as pdf_mod
    return pdf_mod.render_inventory_pdf(inv, rooms, prop.title if prop else None,
                                        f"{tenant.first_name} {tenant.last_name}" if tenant else None)


@app.get("/backoffice/gestion-locative/inventories/{inv_id}.pdf")
def inventory_pdf(inv_id: int, principal: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    data = _inventory_pdf_bytes(db, inv)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=EDL-{inv.type}-{inv.id}.pdf"})


@app.get("/backoffice/gestion-locative/inventories/{inv_id}")
def get_inventory(inv_id: int, principal: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = db.get(Inventory, inv_id)
    if inv is None or inv.agency_id != principal.agency_id:
        return err("État des lieux introuvable.", 404)
    return _inventory_dict(db, inv, full=True)


def _owned_inventory(db, inv_id: int, principal: Principal):
    inv = db.get(Inventory, inv_id)
    if inv is None or inv.agency_id != principal.agency_id:
        return None
    return inv


def _owned_room(db, room_id: int, principal: Principal):
    r = db.get(InventoryRoom, room_id)
    if r is None:
        return None, None
    inv = _owned_inventory(db, r.inventory_id, principal)
    return (r, inv) if inv is not None else (None, None)


def _owned_item(db, item_id: int, principal: Principal):
    it = db.get(InventoryItem, item_id)
    if it is None:
        return None, None
    r, inv = _owned_room(db, it.room_id, principal)
    return (it, inv) if inv is not None else (None, None)


def _owned_settlement(db, sid: int, principal: Principal):
    s = db.get(DepositSettlement, sid)
    if s is None or s.agency_id != principal.agency_id:
        return None
    return s


def _settlement_dict(db: Session, s: DepositSettlement) -> dict:
    lines = (db.query(DeductionLine).filter(DeductionLine.settlement_id == s.id)
             .order_by(DeductionLine.id).all())
    total = sum(float(l.amount or 0) for l in lines)
    deposit = float(s.deposit_amount or 0)
    refunded = deposit - total if deposit > total else 0
    balance = total - deposit if total > deposit else 0
    return {"id": s.id, "lease_id": s.lease_id, "status": s.status,
            "deposit_amount": num(deposit), "total_deductions": num(total),
            "refunded_amount": num(refunded), "balance_due": num(balance),
            "finalized_at": iso(s.finalized_at),
            "lines": [{"id": l.id, "label": l.label, "amount": num(l.amount),
                       "item_id": l.item_id} for l in lines]}


@app.post("/backoffice/gestion-locative/leases/{lease_id}/settlement", status_code=201)
def create_settlement(lease_id: int, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    if db.query(DepositSettlement).filter(DepositSettlement.lease_id == lease_id).first():
        return err("Un décompte existe déjà pour ce bail.", 400)
    s = DepositSettlement(lease_id=lease_id, agency_id=principal.agency_id,
                          deposit_amount=l.deposit_amount or 0)
    db.add(s)
    db.commit()
    return _settlement_dict(db, s)


@app.get("/backoffice/gestion-locative/leases/{lease_id}/settlement")
def get_settlement(lease_id: int, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    s = db.query(DepositSettlement).filter(DepositSettlement.lease_id == lease_id).first()
    if s is None:
        return err("Aucun décompte pour ce bail.", 404)
    return _settlement_dict(db, s)


@app.post("/backoffice/gestion-locative/settlements/{sid}/lines", status_code=201)
async def add_deduction_line(sid: int, request: Request,
                             principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    s = _owned_settlement(db, sid, principal)
    if s is None:
        return err("Décompte introuvable.", 404)
    if s.status != "draft":
        return err("Décompte verrouillé (finalisé).", 400)
    data = await json_body(request)
    label = (data.get("label") or "").strip()
    if not label:
        return err("Le libellé de la retenue est requis.", 400)
    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        return err("Montant invalide.", 400)
    if amount <= 0:
        return err("Le montant doit être positif.", 400)
    item_id = data.get("item_id")
    if item_id is not None:   # rattachement facultatif : l'élément doit appartenir à un EDL de ce bail
        it, inv = _owned_item(db, item_id, principal)
        if it is None or inv.lease_id != s.lease_id:
            return err("Élément invalide pour ce bail.", 400)
    line = DeductionLine(settlement_id=s.id, label=label, amount=amount, item_id=item_id)
    db.add(line)
    db.commit()
    return _settlement_dict(db, s)


@app.delete("/backoffice/gestion-locative/deduction-lines/{line_id}")
def delete_deduction_line(line_id: int, principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    line = db.get(DeductionLine, line_id)
    s = _owned_settlement(db, line.settlement_id, principal) if line else None
    if line is None or s is None:
        return err("Ligne introuvable.", 404)
    if s.status != "draft":
        return err("Décompte verrouillé.", 400)
    db.delete(line)
    db.commit()
    return _settlement_dict(db, s)


@app.post("/backoffice/gestion-locative/settlements/{sid}/finalize")
def finalize_settlement(sid: int, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    s = _owned_settlement(db, sid, principal)
    if s is None:
        return err("Décompte introuvable.", 404)
    if s.status != "draft":
        return err("Décompte déjà finalisé.", 400)
    lease = db.get(Lease, s.lease_id)
    if lease is None:
        return err("Bail introuvable.", 404)
    if lease.deposit_returned_at is not None:
        return err("Dépôt déjà restitué pour ce bail.", 400)
    lines = db.query(DeductionLine).filter(DeductionLine.settlement_id == s.id).all()
    total = sum(float(l.amount or 0) for l in lines)
    deposit = float(s.deposit_amount or 0)
    refunded = deposit - total if deposit > total else 0
    balance = total - deposit if total > deposit else 0
    s.total_deductions = total
    s.refunded_amount = refunded
    s.balance_due = balance
    s.status = "finalized"
    s.finalized_at = datetime.utcnow()
    s.sent_at = datetime.utcnow()
    lease.deposit_returned_at = datetime.utcnow()
    lease.deposit_return_amount = refunded
    enqueue(db, "lease", lease.id, events.DEPOSIT_SETTLED, {
        "id": s.id, "lease_id": lease.id, "tenant_client_id": lease.tenant_client_id,
        "property_id": lease.property_id, "deposit_amount": num(deposit),
        "total_deductions": num(total), "refunded_amount": num(refunded),
        "balance_due": num(balance)})
    db.commit()
    return _settlement_dict(db, s)


def _settlement_pdf_bytes(db, s):
    lines = db.query(DeductionLine).filter(DeductionLine.settlement_id == s.id).order_by(DeductionLine.id).all()
    lease = db.get(Lease, s.lease_id)
    mandate = db.get(Mandate, lease.mandate_id) if lease else None
    tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
    landlord = db.get(ClientRO, mandate.landlord_client_id) if mandate else None
    prop = db.get(PropertyRO, lease.property_id) if lease else None
    from . import pdf as pdf_mod
    return pdf_mod.render_settlement_pdf(
        s, lines,
        tenant_name=(f"{tenant.first_name} {tenant.last_name}" if tenant else None),
        landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        property_title=(prop.title if prop else None))


@app.get("/backoffice/gestion-locative/settlements/{sid}.pdf")
def settlement_pdf(sid: int, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    s = _owned_settlement(db, sid, principal)
    if s is None:
        return err("Décompte introuvable.", 404)
    data = _settlement_pdf_bytes(db, s)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=decompte-caution-{sid}.pdf"})


@app.get("/internal/settlements/{sid}.pdf", include_in_schema=False)
def internal_settlement_pdf(sid: int, x_internal_token: str = Header(default=""),
                            db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    s = db.get(DepositSettlement, sid)
    if s is None:
        return err("Décompte introuvable.", 404)
    data = _settlement_pdf_bytes(db, s)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=decompte-caution-{sid}.pdf"})


def _crm_client(client_id) -> dict:
    """{email, name} d'un client crm — délègue à _client_lookup (même patron que notification)."""
    return _client_lookup(client_id)


def _sig_context_by_agency(db, doc_type: str, doc_id: int, agency_id: int):
    """Retourne dict{entity, ready, pdf_bytes_fn, counterparty_client_id, title, ext_ref,
    mark_signed_fn, event} ou None si introuvable/mauvaise agence. `ready` False si le doc doit
    d'abord être finalisé. Contrepartie = locataire (EDL/décompte/bail) ou bailleur (mandat)."""
    if doc_type == "inventory":
        inv = db.get(Inventory, doc_id)
        if inv is None or inv.agency_id != agency_id:
            return None
        lease = db.get(Lease, inv.lease_id)

        def mark(signed_key):
            inv.status = "signed"
            inv.signed_at = datetime.utcnow()
            inv.pdf_key = signed_key or inv.pdf_key
        return {"entity": inv, "ready": inv.status in ("finalized", "signed"),
                "pdf_bytes_fn": lambda: _inventory_pdf_bytes(db, inv),
                "counterparty_client_id": lease.tenant_client_id if lease else None,
                "title": f"État des lieux {inv.type} — bail {inv.lease_id}",
                "ext_ref": f"rental:inventory:{inv.id}:{agency_id}",
                "mark_signed_fn": mark, "event": events.INVENTORY_SIGNED,
                "signed_payload": {"tenant_client_id": lease.tenant_client_id if lease else None}}
    if doc_type == "settlement":
        s = db.get(DepositSettlement, doc_id)
        if s is None or s.agency_id != agency_id:
            return None
        lease = db.get(Lease, s.lease_id)

        def mark(signed_key):
            s.signed_at = datetime.utcnow()
            s.signed_pdf_key = signed_key
        return {"entity": s, "ready": s.status == "finalized",
                "pdf_bytes_fn": lambda: _settlement_pdf_bytes(db, s),
                "counterparty_client_id": lease.tenant_client_id if lease else None,
                "title": f"Décompte de caution — bail {s.lease_id}",
                "ext_ref": f"rental:settlement:{s.id}:{agency_id}",
                "mark_signed_fn": mark, "event": events.SETTLEMENT_SIGNED,
                "signed_payload": {"tenant_client_id": lease.tenant_client_id if lease else None}}
    if doc_type == "lease":
        l = db.get(Lease, doc_id)
        if l is None or l.agency_id != agency_id:
            return None

        def mark(signed_key):
            l.status = "active"
            l.signed_at = datetime.utcnow()
            l.signed_pdf_key = signed_key
        return {"entity": l, "ready": True, "pdf_bytes_fn": lambda: _lease_pdf_bytes(db, l),
                "counterparty_client_id": l.tenant_client_id,
                "title": f"Bail {l.reference or l.id}",
                "ext_ref": f"rental:lease:{l.id}:{agency_id}",
                "mark_signed_fn": mark, "event": events.LEASE_SIGNED,
                "signed_payload": {"tenant_client_id": l.tenant_client_id, "rent_amount": num(l.rent_amount),
                                    "charges_amount": num(l.charges_amount),
                                    "deposit_amount": num(l.deposit_amount)}}
    if doc_type == "mandate":
        m = db.get(Mandate, doc_id)
        if m is None or m.agency_id != agency_id:
            return None

        def mark(signed_key):
            m.status = "active"
            m.signed_at = datetime.utcnow()
            m.signed_pdf_key = signed_key
        return {"entity": m, "ready": True, "pdf_bytes_fn": lambda: _mandate_pdf_bytes(db, m),
                "counterparty_client_id": m.landlord_client_id,   # bailleur, pas locataire
                "title": f"Mandat {m.reference or m.id}",
                "ext_ref": f"rental:mandate:{m.id}:{agency_id}",
                "mark_signed_fn": mark, "event": events.MANDATE_SIGNED,
                "signed_payload": {"landlord_client_id": m.landlord_client_id, "reference": m.reference,
                                    "mandate_type": m.mandate_type, "fee_percent": num(m.fee_percent)}}
    return None


def _sig_context(db, doc_type: str, doc_id: int, principal: Principal):
    return _sig_context_by_agency(db, doc_type, doc_id, principal.agency_id)


_DOC_TYPES = ("inventory", "settlement", "lease", "mandate")


def _sig_dict(db, sig) -> dict:
    return {"id": sig.id, "doc_type": sig.doc_type, "doc_ref_id": sig.doc_ref_id,
            "status": sig.status, "has_signed_pdf": bool(sig.signed_pdf_key),
            "signers": json.loads(sig.signers) if sig.signers else [], "error": sig.error}


@app.post("/backoffice/gestion-locative/{doc_type}/{doc_id}/request-signature")
async def request_signature(doc_type: str, doc_id: int, request: Request,
                            principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    if doc_type not in _DOC_TYPES:
        return err("Type de document invalide.", 400)
    if not signing.signing_enabled():
        return err("Signature électronique non configurée.", 400)
    ctx = _sig_context(db, doc_type, doc_id, principal)
    if ctx is None:
        return err("Document introuvable.", 404)
    if not ctx["ready"]:
        return err("Le document doit être finalisé avant signature.", 400)
    existing = (db.query(SignatureRequest)
                .filter(SignatureRequest.doc_type == doc_type, SignatureRequest.doc_ref_id == doc_id).first())
    if existing is not None and existing.status not in ("declined", "voided", "expired"):
        return err("Signature déjà demandée pour ce document.", 400)
    data = await json_body(request)
    manager_email = (data.get("manager_email") or "").strip()
    manager_name = (data.get("manager_name") or "Gestionnaire").strip()
    if not manager_email:
        return err("Email du gestionnaire requis.", 400)
    cp = _crm_client(ctx["counterparty_client_id"])   # {email, name}
    if not cp.get("email"):
        return err("Email de la contrepartie introuvable.", 400)
    try:
        env = signing.create_envelope(ctx["title"], ctx["ext_ref"])
        pdf_bytes = ctx["pdf_bytes_fn"]()
        docid, pages = signing.add_document(env, f"{doc_type}-{doc_id}.pdf", pdf_bytes)
        r1 = signing.add_recipient(env, manager_email, manager_name, 1)
        r2 = signing.add_recipient(env, cp["email"], cp.get("name") or "Signataire", 2)
        signing.place_signature_field(env, docid, r1, pages, 72, 72)
        signing.place_signature_field(env, docid, r2, pages, 340, 72)
        signing.send_envelope(env)
    except signing.SigningError as e:
        return err(f"Échec de l'envoi en signature : {e}", 502)
    signers = [{"name": manager_name, "email": manager_email, "order": 1},
               {"name": cp.get("name"), "email": cp["email"], "order": 2}]
    if existing is not None:
        sig = existing
        sig.envelope_id, sig.document_id, sig.status, sig.error = env, docid, "sent", None
        sig.signers, sig.signed_pdf_key = json.dumps(signers), None
    else:
        sig = SignatureRequest(doc_type=doc_type, doc_ref_id=doc_id, agency_id=principal.agency_id,
                               envelope_id=env, document_id=docid, status="sent", signers=json.dumps(signers))
        db.add(sig)
    db.commit()
    return _sig_dict(db, sig)


@app.get("/backoffice/gestion-locative/signatures/{sig_id}/signed.pdf")
def signed_pdf(sig_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    # Enregistrée AVANT /signatures/{doc_type}/{doc_id} : Starlette matche par ordre d'enregistrement,
    # pas par spécificité — sinon "signed.pdf" serait capturé comme doc_id (échec de parsing int).
    if (g := _gate(principal)) is not None:
        return g
    sig = db.get(SignatureRequest, sig_id)
    if sig is None or sig.agency_id != principal.agency_id:
        return err("Signature introuvable.", 404)
    if not sig.signed_pdf_key:
        return err("Document signé indisponible.", 404)
    from . import storage
    data = storage.docs_storage().get(sig.signed_pdf_key)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=signe-{sig.doc_type}-{sig.doc_ref_id}.pdf"})


@app.get("/backoffice/gestion-locative/signatures/{doc_type}/{doc_id}")
def get_signature(doc_type: str, doc_id: int, principal: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    sig = (db.query(SignatureRequest).filter(SignatureRequest.doc_type == doc_type,
           SignatureRequest.doc_ref_id == doc_id, SignatureRequest.agency_id == principal.agency_id).first())
    if sig is None:
        return err("Aucune demande de signature.", 404)
    return _sig_dict(db, sig)


@app.get("/internal/signatures/{sig_id}/signed.pdf", include_in_schema=False)
def internal_signed_pdf(sig_id: int, x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    sig = db.get(SignatureRequest, sig_id)
    if sig is None or not sig.signed_pdf_key:
        return err("Indisponible.", 404)
    from . import storage
    data = storage.docs_storage().get(sig.signed_pdf_key)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=signe-{sig_id}.pdf"})


@app.post("/internal/signatures/poll", include_in_schema=False)
def poll_signatures(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Interroge 3a9dSign pour les demandes en cours ; sur complétion, récupère le PDF signé,
    le stocke en S3, marque le document local signé et émet l'événement "signé" (appelé par
    l'ordonnanceur du service notification, toutes les ~60 s)."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    if not signing.signing_enabled():
        return {"checked": 0}
    pending = db.query(SignatureRequest).filter(SignatureRequest.status.in_(("sent", "in_progress"))).all()
    updated = 0
    for sig in pending:
        try:
            st = signing.get_status(sig.envelope_id)
        except signing.SigningError:
            continue
        if st == sig.status:
            continue
        if st == "completed":
            ctx = _sig_context_by_agency(db, sig.doc_type, sig.doc_ref_id, sig.agency_id)
            signed_key = None
            try:
                data = signing.fetch_signed_pdf(sig.envelope_id, sig.document_id)
                signed_key = f"signatures/{sig.id}/signed.pdf"
                from . import storage
                storage.docs_storage().put(signed_key, data, "pdf")
            except signing.SigningError:
                signed_key = None
            sig.signed_pdf_key = signed_key
            sig.status = "completed"
            if ctx is not None:
                ctx["mark_signed_fn"](signed_key)
                enqueue(db, sig.doc_type, sig.doc_ref_id, ctx["event"], {
                    "id": sig.doc_ref_id, "signature_id": sig.id, "doc_type": sig.doc_type,
                    **ctx["signed_payload"]})
            updated += 1
        elif st in ("in_progress", "declined", "voided", "expired"):
            sig.status = st
            updated += 1
    db.commit()
    return {"checked": len(pending), "updated": updated}


_COND_RANK = {"bon": 0, "moyen": 1, "mauvais": 2}


@app.get("/backoffice/gestion-locative/leases/{lease_id}/inventories/compare")
def compare_inventories(lease_id: int, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    invs = {i.type: i for i in db.query(Inventory).filter(Inventory.lease_id == lease_id).all()}
    entree, sortie = invs.get("entree"), invs.get("sortie")

    def _by_room(inv):
        out = {}
        if inv is None:
            return out
        rooms = db.query(InventoryRoom).filter(InventoryRoom.inventory_id == inv.id).all()
        for r in rooms:
            items = db.query(InventoryItem).filter(InventoryItem.room_id == r.id).all()
            out[r.name] = {it.label: it for it in items}
        return out

    e_rooms, s_rooms = _by_room(entree), _by_room(sortie)
    room_names = list(dict.fromkeys(list(e_rooms.keys()) + list(s_rooms.keys())))
    rooms = []
    for rname in room_names:
        e_items, s_items = e_rooms.get(rname, {}), s_rooms.get(rname, {})
        labels = list(dict.fromkeys(list(e_items.keys()) + list(s_items.keys())))
        items = []
        for label in labels:
            ei, si = e_items.get(label), s_items.get(label)
            degraded = bool(ei and si and _COND_RANK.get(si.condition, 0) > _COND_RANK.get(ei.condition, 0))
            items.append({"label": label,
                          "entree": ei.condition if ei else None,
                          "sortie": si.condition if si else None,
                          "sortie_comment": si.comment if si else None,
                          "sortie_item_id": si.id if si else None,
                          "degraded": degraded})
        rooms.append({"name": rname, "items": items})
    return {"has_entree": entree is not None, "has_sortie": sortie is not None, "rooms": rooms}


@app.patch("/backoffice/gestion-locative/inventories/{inv_id}")
async def update_inventory(inv_id: int, request: Request,
                           principal: Principal = Depends(get_principal),
                           db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé (finalisé).", 400)
    data = await json_body(request)
    if "general_notes" in data:
        inv.general_notes = data["general_notes"]
    db.commit()
    return _inventory_dict(db, inv)


@app.post("/backoffice/gestion-locative/inventories/{inv_id}/rooms", status_code=201)
async def add_room(inv_id: int, request: Request, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    data = await json_body(request)
    if not data.get("name"):
        return err("Le nom de la pièce est requis.", 400)
    n = db.query(InventoryRoom).filter(InventoryRoom.inventory_id == inv.id).count()
    r = InventoryRoom(inventory_id=inv.id, name=data["name"], position=n)
    db.add(r)
    db.commit()
    return {"id": r.id, "name": r.name, "position": r.position, "items": []}


@app.delete("/backoffice/gestion-locative/rooms/{room_id}")
def delete_room(room_id: int, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    r, inv = _owned_room(db, room_id, principal)
    if r is None:
        return err("Pièce introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    items = db.query(InventoryItem).filter(InventoryItem.room_id == r.id).all()
    for it in items:
        db.query(InventoryPhoto).filter(InventoryPhoto.item_id == it.id).delete()
        db.delete(it)
    db.delete(r)
    db.commit()
    return {"ok": True}


@app.post("/backoffice/gestion-locative/rooms/{room_id}/items", status_code=201)
async def add_item(room_id: int, request: Request, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    r, inv = _owned_room(db, room_id, principal)
    if r is None:
        return err("Pièce introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    data = await json_body(request)
    if not data.get("label"):
        return err("Le libellé de l'élément est requis.", 400)
    if "condition" in data and data["condition"] not in ("bon", "moyen", "mauvais"):
        return err("État invalide.", 400)
    n = db.query(InventoryItem).filter(InventoryItem.room_id == r.id).count()
    it = InventoryItem(room_id=r.id, label=data["label"], condition=data.get("condition", "bon"),
                       comment=data.get("comment"), position=n)
    db.add(it)
    db.commit()
    return {"id": it.id, "label": it.label, "condition": it.condition, "comment": it.comment, "photos": []}


@app.patch("/backoffice/gestion-locative/items/{item_id}")
async def update_item(item_id: int, request: Request, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    it, inv = _owned_item(db, item_id, principal)
    if it is None:
        return err("Élément introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    data = await json_body(request)
    if "condition" in data:
        if data["condition"] not in ("bon", "moyen", "mauvais"):
            return err("État invalide.", 400)
        it.condition = data["condition"]
    if "comment" in data:
        it.comment = data["comment"]
    if "label" in data and data["label"]:
        it.label = data["label"]
    db.commit()
    return {"id": it.id, "label": it.label, "condition": it.condition, "comment": it.comment}


@app.delete("/backoffice/gestion-locative/items/{item_id}")
def delete_item(item_id: int, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    it, inv = _owned_item(db, item_id, principal)
    if it is None:
        return err("Élément introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    db.query(InventoryPhoto).filter(InventoryPhoto.item_id == it.id).delete()
    db.delete(it)
    db.commit()
    return {"ok": True}


@app.post("/backoffice/gestion-locative/items/{item_id}/photos", status_code=201)
async def upload_item_photo(item_id: int, request: Request,
                            principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    it, inv = _owned_item(db, item_id, principal)
    if it is None:
        return err("Élément introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    body = await request.body()
    if not body:
        return err("Fichier vide.", 400)
    if len(body) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    filename = request.query_params.get("filename", "photo")
    content_type = request.headers.get("content-type", "application/octet-stream")
    from . import storage
    key = f"inventories/{inv.id}/{uuid.uuid4().hex}"
    storage.docs_storage().put(key, body, content_type)
    p = InventoryPhoto(item_id=it.id, file_key=key, filename=filename, content_type=content_type)
    db.add(p)
    db.commit()
    return _photo_dict(p)


@app.get("/backoffice/gestion-locative/inventory-photos/{photo_id}")
def download_item_photo(photo_id: int, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    p = db.get(InventoryPhoto, photo_id)
    it = db.get(InventoryItem, p.item_id) if p else None
    _, inv = _owned_room(db, it.room_id, principal) if it else (None, None)
    if p is None or inv is None:
        return err("Photo introuvable.", 404)
    from . import storage
    data = storage.docs_storage().get(p.file_key)
    return Response(data, media_type=p.content_type or "application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename={p.filename or 'photo'}",
                             "X-Content-Type-Options": "nosniff"})


@app.delete("/backoffice/gestion-locative/inventory-photos/{photo_id}")
def delete_item_photo(photo_id: int, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    p = db.get(InventoryPhoto, photo_id)
    it = db.get(InventoryItem, p.item_id) if p else None
    _, inv = _owned_room(db, it.room_id, principal) if it else (None, None)
    if p is None or inv is None:
        return err("Photo introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    db.delete(p)
    db.commit()
    return {"ok": True}


@app.post("/backoffice/gestion-locative/inventories/{inv_id}/finalize")
def finalize_inventory(inv_id: int, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux déjà finalisé.", 400)
    inv.status = "finalized"
    inv.finalized_at = datetime.utcnow()
    rooms = _inventory_dict(db, inv, full=True)["rooms"]
    lease = db.get(Lease, inv.lease_id)
    prop = db.get(PropertyRO, lease.property_id) if lease else None
    tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
    from . import pdf as pdf_mod, storage
    data = pdf_mod.render_inventory_pdf(
        inv, rooms, property_title=(prop.title if prop else None),
        tenant_name=(f"{tenant.first_name} {tenant.last_name}" if tenant else None))
    key = f"inventories/{inv.id}/edl_{inv.type}.pdf"
    storage.docs_storage().put(key, data, "pdf")
    inv.pdf_key = key
    enqueue(db, "inventory", inv.id, events.INVENTORY_FINALIZED, {
        "id": inv.id, "lease_id": inv.lease_id, "type": inv.type})
    db.commit()
    return _inventory_dict(db, inv)


@app.post("/backoffice/gestion-locative/inventories/{inv_id}/mark-signed")
def mark_inventory_signed(inv_id: int, principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    if inv.status == "draft":
        return err("Finalisez l'état des lieux avant de le signer.", 400)
    inv.status = "signed"
    inv.signed_at = datetime.utcnow()
    db.commit()
    return _inventory_dict(db, inv)
