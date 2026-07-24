"""Service payment — encaissement en **séquestre CMI** (simulé).

Cycle : pending → held (sous séquestre) → released | refunded. Chaque transition émet
un événement via l'outbox. Routes cloisonnées par agence (JWT — anti-IDOR).
"""
from contextlib import asynccontextmanager
from decimal import Decimal

from fastapi import Depends, FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import (
    conflict,
    forbidden,
    get_settings,
    install_error_handlers,
    not_found,
    setup_logging,
    setup_tracing,
)
from semsar_events import enqueue

from . import events, gateway
from .db import get_db, init_db
from .models import Payment

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _owned(db: Session, payment_id: int, principal: Principal) -> Payment:
    p = db.get(Payment, payment_id)
    if p is None:
        raise not_found("Paiement introuvable.")
    if p.agency_id != principal.agency_id and not principal.is_superadmin:
        raise forbidden("Paiement d'une autre agence.")
    return p


def _emit(db: Session, p: Payment, event_type: str) -> None:
    enqueue(
        db,
        aggregate_type="payment",
        aggregate_id=p.id,
        event_type=event_type,
        payload={
            "payment_id": p.id,
            "agency_id": p.agency_id,
            "reference": p.reference,
            "amount": float(p.amount),
            "currency": p.currency,
            "purpose": p.purpose,
            "status": p.status,
        },
    )


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    purpose: str
    currency: str = "MAD"


@app.post("/payment/payments", status_code=201)
def create_payment(
    body: PaymentCreate,
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
) -> dict:
    if principal.agency_id is None:
        raise forbidden("Aucune agence associée au compte.")
    p = Payment(
        agency_id=principal.agency_id,
        reference=gateway.new_reference(),
        amount=body.amount,
        currency=body.currency,
        purpose=body.purpose,
        status="pending",
    )
    db.add(p)
    db.commit()
    return {"id": p.id, "reference": p.reference, "status": p.status,
            "gateway_url": gateway.gateway_url(p.reference)}


@app.post("/payment/payments/{payment_id}/pay")
def pay(payment_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    """Confirmation passerelle (simulée) → fonds placés SOUS SÉQUESTRE (held)."""
    p = _owned(db, payment_id, principal)
    if p.status != "pending":
        raise conflict("Paiement déjà traité.")
    p.status = "held"
    p.external_ref = gateway.new_external_ref()
    _emit(db, p, events.PAYMENT_HELD)
    db.commit()
    return {"id": p.id, "status": p.status, "external_ref": p.external_ref}


@app.post("/payment/payments/{payment_id}/release")
def release(payment_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    """Libère les fonds du séquestre vers le bénéficiaire."""
    p = _owned(db, payment_id, principal)
    if p.status != "held":
        raise conflict("Le paiement n'est pas sous séquestre.")
    p.status = "released"
    _emit(db, p, events.PAYMENT_RELEASED)
    db.commit()
    return {"id": p.id, "status": p.status}


@app.post("/payment/payments/{payment_id}/refund")
def refund(payment_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    """Rembourse un paiement encore sous séquestre."""
    p = _owned(db, payment_id, principal)
    if p.status != "held":
        raise conflict("Seul un paiement sous séquestre est remboursable.")
    p.status = "refunded"
    _emit(db, p, events.PAYMENT_REFUNDED)
    db.commit()
    return {"id": p.id, "status": p.status}


@app.get("/payment/payments/{payment_id}")
def get_payment(payment_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    p = _owned(db, payment_id, principal)
    return {"id": p.id, "reference": p.reference, "amount": float(p.amount),
            "currency": p.currency, "purpose": p.purpose, "status": p.status,
            "external_ref": p.external_ref}
