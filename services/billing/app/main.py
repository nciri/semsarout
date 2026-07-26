"""Service billing — plans, abonnements, facturation (routes legacy, cloisonné par agence).

Reproduit `/subscription-plans`, `/subscription-plans/{id}`, `/my-subscription`,
`/subscription/current`, `/cancel-subscription`, `/subscription/change-plan` — cf.
`backend/app/api/v1/subscriptions.py` + `billing.py`. `change-plan` : le garde-fou de
rétrogradation lit les sièges/équipes via l'endpoint interne d'**identity** (v2-native) ; la bascule
suit la chorégraphie paiement v2 (abonnement *incomplete* + facture *unpaid* +
`billing.invoice.created` → service payment → worker billing active). Le monolithe 500ait ici
(tables `payment_methods`/`invoices` absentes) — v2 le rend fonctionnel.

Écart assumé : les features du plan (gating) restent projetées par identity (`agency_ro.features`) ;
billing ne les pilote pas encore (décommissionnement final).
"""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, Header, Request
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import extract
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, seats_client
from .db import get_db, init_db
from .models import Invoice, Subscription, SubscriptionPlan
from .util import err, iso, json_body

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
           "Septembre", "Octobre", "Novembre", "Décembre"]


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


def _plan_dict(p: SubscriptionPlan) -> dict:
    return {
        "id": p.id, "name": p.name, "slug": p.slug, "description": p.description,
        "max_listings": p.max_listings, "max_featured": p.max_featured, "max_urgent": p.max_urgent,
        "has_api_access": p.has_api_access, "has_csv_import": p.has_csv_import,
        "has_staymanager_sync": p.has_staymanager_sync, "has_lead_contact": p.has_lead_contact,
        "has_analytics": p.has_analytics, "has_priority_support": p.has_priority_support,
        "has_dedicated_account_manager": p.has_dedicated_account_manager,
        "has_programs": p.has_programs, "max_programs": p.max_programs,
        "has_contracts": p.has_contracts, "has_legal": p.has_legal, "has_artisans": p.has_artisans,
        "max_seats": p.max_seats, "max_teams": p.max_teams,
        "price_monthly": float(p.price_monthly),
        "price_yearly": float(p.price_yearly) if p.price_yearly else None,
    }


def _sub_dict(db: Session, s: Subscription) -> dict:
    plan = db.get(SubscriptionPlan, s.plan_id)
    remaining = None
    if plan and plan.max_listings != -1:
        remaining = plan.max_listings - s.listings_used
    return {
        "id": s.id, "agency_id": s.agency_id,
        "plan": _plan_dict(plan) if plan else None,
        "billing_cycle": s.billing_cycle, "amount": float(s.amount), "status": s.status,
        "start_date": iso(s.start_date), "end_date": iso(s.end_date),
        "listings_used": s.listings_used, "listings_remaining": remaining,
    }


def _invoice_dict(i: Invoice) -> dict:
    return {"id": i.id, "reference": i.reference, "subscription_id": i.subscription_id,
            "agency_id": i.agency_id, "amount": float(i.amount), "status": i.status,
            "period_label": i.period_label, "issued_at": iso(i.issued_at), "paid_at": iso(i.paid_at)}


def _agency_sub(db: Session, agency_id: int, status: str | None = None) -> Subscription | None:
    q = db.query(Subscription).filter(Subscription.agency_id == agency_id)
    if status:
        q = q.filter(Subscription.status == status)
    return q.first()


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/internal/subscription", include_in_schema=False)
def internal_subscription(request: Request, x_internal_token: str = Header(default=""),
                          db: Session = Depends(get_db)):
    """Abonnement d'une agence (nom du plan + statut) — pour l'overview du service analytics."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    aid = request.query_params.get("agency_id")
    sub = _agency_sub(db, int(aid)) if aid else None
    if sub is None:
        return {"subscription": None}
    plan = db.get(SubscriptionPlan, sub.plan_id)
    return {"subscription": {"plan": plan.name if plan else None, "status": sub.status}}


@app.get("/subscription-plans")
def list_plans(db: Session = Depends(get_db)) -> dict:
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active.is_(True)).all()
    return {"plans": [_plan_dict(p) for p in plans]}


@app.get("/subscription-plans/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    p = db.get(SubscriptionPlan, plan_id)
    if p is None:
        return err("Plan not found", 404)
    return {"plan": _plan_dict(p)}


@app.get("/my-subscription")
def my_subscription(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if principal.agency_id is None:
        return err("You do not belong to an agency", 404)
    sub = _agency_sub(db, principal.agency_id)
    if sub is None:
        return err("No active subscription", 404)
    return {"subscription": _sub_dict(db, sub)}


@app.get("/subscription/current")
def current_subscription(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    sub = _agency_sub(db, principal.agency_id) if principal.agency_id else None
    plans = (db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active.is_(True))
             .order_by(SubscriptionPlan.price_monthly).all())
    current_plan = "free"
    if sub is not None:
        plan = db.get(SubscriptionPlan, sub.plan_id)
        current_plan = plan.slug if plan else "free"
    return {"subscription": _sub_dict(db, sub) if sub else None,
            "current_plan": current_plan, "plans": [_plan_dict(p) for p in plans]}


@app.post("/cancel-subscription")
def cancel_subscription(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if principal.agency_id is None:
        return err("You do not belong to an agency", 404)
    sub = _agency_sub(db, principal.agency_id, status="active")
    if sub is None:
        return err("No active subscription to cancel", 404)
    sub.status = "cancelled"
    sub.cancelled_at = datetime.utcnow()
    db.commit()
    return {"message": "Subscription cancelled. Access continues until end of billing period.",
            "subscription": _sub_dict(db, sub)}


@app.post("/subscription/change-plan")
async def change_plan(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await json_body(request)
    new_plan_id = data.get("plan_id")
    if not new_plan_id:
        return err("plan_id is required", 400)
    # plan_id peut être un PK numérique ou un slug ("pro", "starter"…).
    plan = None
    if isinstance(new_plan_id, int) or (isinstance(new_plan_id, str) and new_plan_id.isdigit()):
        plan = db.get(SubscriptionPlan, int(new_plan_id))
    if plan is None:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == str(new_plan_id)).first()
    if plan is None or not plan.is_active:
        return err("Plan not found", 404)

    # Garde-fou de rétrogradation : sièges/équipes via identity (v2-native).
    if principal.agency_id:
        s = seats_client.seats_of(principal.agency_id)
        used_seats = s.get("active_member_seats", 0)
        used_teams = s.get("teams_used", 0)
        if plan.max_seats != -1 and used_seats > plan.max_seats:
            excess = used_seats - plan.max_seats
            return err(f"Retirez d'abord {excess} membre(s) pour passer à ce plan.", 409)
        if plan.max_teams != -1 and used_teams > plan.max_teams:
            return err("Trop d'équipes pour ce plan : supprimez-en d'abord.", 409)
    else:
        return err("Individual subscriptions not yet supported", 400)

    now = datetime.utcnow()
    billing_cycle = data.get("billing_cycle", "monthly")
    if billing_cycle == "yearly" and plan.price_yearly:
        amount, end_date = plan.price_yearly, now + timedelta(days=365)
    else:
        amount, end_date, billing_cycle = plan.price_monthly, now + timedelta(days=30), "monthly"

    sub = _agency_sub(db, principal.agency_id)
    if sub is not None:
        sub.plan_id = plan.id
        sub.billing_cycle = billing_cycle
        sub.amount = amount
        sub.status = "incomplete"  # en attente de confirmation du paiement
        sub.end_date = end_date
        sub.updated_at = now
    else:
        sub = Subscription(agency_id=principal.agency_id, plan_id=plan.id, billing_cycle=billing_cycle,
                           amount=amount, status="incomplete", start_date=now, end_date=end_date)
        db.add(sub)
        db.flush()

    count = db.query(Invoice).filter(extract("year", Invoice.issued_at) == now.year).count()
    invoice = Invoice(reference=f"INV-{now.year}-{str(count + 1).zfill(3)}",
                      subscription_id=sub.id, agency_id=principal.agency_id, amount=amount,
                      status="unpaid", period_label=f"{_MONTHS[now.month - 1]} {now.year}")
    db.add(invoice)
    db.flush()
    enqueue(db, "invoice", invoice.id, events.INVOICE_CREATED, {
        "invoice_id": invoice.id, "agency_id": principal.agency_id, "amount": float(amount),
        "plan": plan.slug, "purpose": "subscription",
    })
    db.commit()
    return {"message": "Subscription updated successfully",
            "subscription": _sub_dict(db, sub), "invoice": _invoice_dict(invoice)}
