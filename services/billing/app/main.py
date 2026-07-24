"""Service billing — plans, abonnements, factures (cloisonné par agence).

Chorégraphie : `subscribe` crée un abonnement *pending* + une facture *unpaid* et émet
`billing.invoice.created`. Le client paie via le service `payment` (séquestre). À la
libération des fonds, le worker billing (voir app.worker) active l'abonnement.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import (
    forbidden,
    get_settings,
    install_error_handlers,
    not_found,
    setup_logging,
    setup_tracing,
)
from semsar_events import enqueue

from . import events
from .db import SessionLocal, get_db, init_db
from .models import Invoice, Subscription, SubscriptionPlan
from .seed import seed_plans

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
        db = SessionLocal()
        try:
            seed_plans(db)
        finally:
            db.close()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _agency(principal: Principal) -> int:
    if principal.agency_id is None:
        raise forbidden("Aucune agence associée au compte.")
    return principal.agency_id


def _plan_dict(p: SubscriptionPlan) -> dict:
    return {"slug": p.slug, "name": p.name, "price": float(p.price), "max_seats": p.max_seats,
            "has_contracts": p.has_contracts, "has_legal": p.has_legal, "has_artisans": p.has_artisans}


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/billing/plans")
def list_plans(db: Session = Depends(get_db)) -> dict:
    return {"plans": [_plan_dict(p) for p in db.query(SubscriptionPlan).all()]}


@app.get("/billing/subscription")
def current_subscription(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    agency_id = _agency(principal)
    sub = (
        db.query(Subscription)
        .filter(Subscription.agency_id == agency_id)
        .order_by(Subscription.id.desc())
        .first()
    )
    if sub is None:
        return {"subscription": None}
    plan = db.get(SubscriptionPlan, sub.plan_id)
    return {"subscription": {"id": sub.id, "status": sub.status, "plan": _plan_dict(plan) if plan else None}}


class SubscribeIn(BaseModel):
    plan_slug: str


@app.post("/billing/subscribe", status_code=201)
def subscribe(body: SubscribeIn, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    agency_id = _agency(principal)
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == body.plan_slug).first()
    if plan is None:
        raise not_found("Plan inconnu.")
    sub = Subscription(agency_id=agency_id, plan_id=plan.id, status="pending")
    db.add(sub)
    db.flush()
    invoice = Invoice(agency_id=agency_id, subscription_id=sub.id, amount=plan.price, status="unpaid")
    db.add(invoice)
    db.flush()
    enqueue(db, "invoice", invoice.id, events.INVOICE_CREATED,
            {"invoice_id": invoice.id, "agency_id": agency_id, "amount": float(plan.price), "plan": plan.slug})
    db.commit()
    return {"subscription_id": sub.id, "invoice_id": invoice.id, "amount": float(plan.price), "plan_slug": plan.slug}
