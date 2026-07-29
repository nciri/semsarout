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
from .models import ClientRO, CrgReport, Lease, Mandate, PropertyRO, RentPeriod
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
