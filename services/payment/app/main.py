"""Service payment — intention de paiement + webhook passerelle (routes legacy).

Reproduit `/payments/create-intent`, `/payments/webhook`, `/payments/{reference}`,
`/my-payments` — cf. `backend/app/api/v1/payments.py`. Passerelle CMI **simulée** (comme le
monolithe : payment_url mock). Un paiement d'abonnement confirmé émet `payment.completed`
(outbox) → le service billing crée/prolonge l'abonnement (v2-native, pas d'écriture cross-domaine).
"""
import hashlib
import hmac
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, Request
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, gateway
from .db import get_db, init_db
from .models import Payment, PlanRO
from .util import err, iso, json_body, opt_int

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

# Signature webhook passerelle (optionnelle) : si un secret est configuré, on vérifie l'HMAC du
# corps ; sinon on l'accepte (parité monolithe, qui n'a pas de secret — passerelle simulée).
_WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "")
# États terminaux : on ne retraite pas un webhook déjà appliqué (anti-rejeu → pas de double
# prolongation d'abonnement).
_TERMINAL = {"completed", "failed", "refunded"}

# Prix des services ponctuels — parité `SERVICE_PRICES` du monolithe.
SERVICE_PRICES = {
    "forfait-vente": 4900,
    "photos-pro": 990,
    "photos-pro-360": 1490,
    "photos-pro-drone": 1790,
}


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


def _payment_dict(p: Payment) -> dict:
    return {"id": p.id, "reference": p.reference, "payment_type": p.payment_type,
            "amount": float(p.amount), "currency": p.currency, "status": p.status,
            "payment_method": p.payment_method, "created_at": iso(p.created_at),
            "completed_at": iso(p.completed_at)}


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.post("/payments/create-intent")
async def create_payment_intent(request: Request, db: Session = Depends(get_db),
                                x_semsar_user_id: str = Header(default=None),
                                x_semsar_agency_id: str = Header(default=None)):
    data = await json_body(request)
    service_id = data.get("service_id")
    plan_id = data.get("plan_id")
    purpose = data.get("purpose")
    commission_ref = data.get("commission_ref")
    billing_cycle = data.get("billing_cycle", "yearly")
    payment_method = data.get("payment_method", "card")
    customer = data.get("customer_info") or {}

    amount = 0
    payment_type = None
    resolved_plan_id = None
    if purpose == "commission":
        try:
            amount = float(data.get("amount"))
        except (TypeError, ValueError):
            amount = 0
        payment_type = "commission"
    elif service_id and service_id in SERVICE_PRICES:
        amount = SERVICE_PRICES[service_id]
        payment_type = "service"
    elif plan_id:
        plan = db.query(PlanRO).filter(PlanRO.slug == plan_id).first()
        if plan:
            price = plan.price_yearly if billing_cycle == "yearly" else plan.price_monthly
            amount = float(price) if price is not None else 0
            payment_type = "subscription"
            resolved_plan_id = plan.id

    if amount <= 0:
        return err("Invalid service or plan", 400)

    p = Payment(
        reference=gateway.new_reference(), payment_type=payment_type,
        service_id=commission_ref if payment_type == "commission" else (
            service_id if payment_type == "service" else None),
        plan_id=resolved_plan_id if payment_type == "subscription" else None,
        billing_cycle=billing_cycle if payment_type == "subscription" else None,
        amount=amount, payment_method=payment_method,
        user_id=opt_int(x_semsar_user_id), agency_id=opt_int(x_semsar_agency_id),
        customer_name=customer.get("name"), customer_email=customer.get("email"),
        customer_phone=customer.get("phone"), customer_address=customer.get("address"),
        customer_city=customer.get("city"),
    )
    db.add(p)
    db.commit()

    if payment_method == "card":
        return {"payment_id": p.id, "reference": p.reference,
                "payment_url": f"/payment-gateway?ref={p.reference}&amount={amount}", "amount": amount}
    if payment_method == "transfer":
        return {"payment_id": p.id, "reference": p.reference, "status": "pending_transfer",
                "bank_info": {"bank_name": "Banque Populaire", "account_name": "SemsarOut SARL",
                              "rib": "XXXX XXXX XXXX XXXX XXXX XX", "reference": p.reference,
                              "amount": amount},
                "message": "Veuillez effectuer le virement avec la référence indiquée"}
    return err("Invalid payment method", 400)


@app.post("/payments/webhook")
async def payment_webhook(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()
    # Vérification de signature si un secret est configuré (fail-closed) ; no-op sinon (parité).
    if _WEBHOOK_SECRET:
        sig = request.headers.get("x-gateway-signature", "")
        expected = hmac.new(_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return err("unauthorized", 401)
    try:
        data = await request.json()
        data = data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        data = {}
    reference = data.get("reference")
    status = data.get("status")
    gateway_reference = data.get("gateway_reference")

    p = db.query(Payment).filter(Payment.reference == reference).first()
    if not p:
        return err("Payment not found", 404)
    # Anti-rejeu : un paiement déjà en état terminal n'est pas retraité (évite la double
    # prolongation d'abonnement via un webhook rejoué).
    if p.status in _TERMINAL:
        return {"status": "ok"}

    if status == "success":
        p.status = "completed"
        p.gateway_reference = gateway_reference
        p.completed_at = datetime.utcnow()
        # Abonnement : la création/prolongation est déléguée à billing via événement (v2-native).
        if p.payment_type == "subscription" and p.agency_id:
            enqueue(db, "payment", p.id, events.PAYMENT_COMPLETED, {
                "payment_id": p.id, "agency_id": p.agency_id, "plan_id": p.plan_id,
                "billing_cycle": p.billing_cycle, "amount": float(p.amount), "purpose": "subscription",
            })
        if p.payment_type == "commission":
            enqueue(db, "payment", p.id, events.PAYMENT_COMPLETED, {
                "payment_id": p.id, "invoice_ref": p.reference, "commission_ref": p.service_id,
                "account_id": p.user_id, "purpose": "commission"})
        db.commit()
    elif status == "failed":
        p.status = "failed"
        db.commit()

    return {"status": "ok"}


@app.get("/payments/{reference}")
def get_payment_status(reference: str, db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.reference == reference).first()
    if not p:
        return err("Payment not found", 404)
    return {"payment": _payment_dict(p)}


@app.get("/my-payments")
def my_payments(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    uid = opt_int(principal.sub)
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    q = db.query(Payment).filter(Payment.user_id == uid).order_by(Payment.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 0
    return {"payments": [_payment_dict(p) for p in items], "total": total,
            "pages": pages, "current_page": page}
