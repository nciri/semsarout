"""L'activation/prolongation d'abonnement (worker billing) émet `billing.subscription.activated`
avec `agency_id` + `features` (dérivées du plan) — consommé par identity pour projeter
`AgencyRO.features` (claims JWT)."""
from app import models
from app.models import Subscription, SubscriptionPlan
from app.worker import _handle


def _session(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from semsar_events import OutboxBase
    engine = create_engine("sqlite:///:memory:", future=True)
    models.Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: s)
    return s


def _pro_plan(s) -> SubscriptionPlan:
    plan = SubscriptionPlan(name="Pro", slug="pro", max_listings=100, price_monthly=499,
                            has_contracts=True, has_design3d=True)
    s.add(plan)
    s.commit()
    return plan


def _last_outbox_payload(s):
    from semsar_events import OutboxEvent
    ev = s.query(OutboxEvent).filter_by(event_type="billing.subscription.activated").order_by(
        OutboxEvent.id.desc()).first()
    assert ev is not None
    return ev.payload


def test_payment_released_activates_subscription_with_features(monkeypatch):
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    sub = Subscription(agency_id=5, plan_id=plan.id, amount=499, status="incomplete")
    s.add(sub)
    s.commit()

    _handle("payment.released", {"purpose": "subscription", "agency_id": 5}, "m:1")

    updated = s.get(Subscription, sub.id)
    assert updated.status == "active"
    payload = _last_outbox_payload(s)
    assert payload["agency_id"] == 5
    assert set(payload["features"]) == {"contracts", "design3d"}


def test_payment_completed_creates_subscription_and_emits_features(monkeypatch):
    s = _session(monkeypatch)
    plan = _pro_plan(s)

    _handle("payment.completed", {"purpose": "subscription", "agency_id": 9,
                                  "plan_id": plan.id, "billing_cycle": "monthly",
                                  "amount": 499}, "m:2")

    sub = s.query(Subscription).filter_by(agency_id=9).first()
    assert sub is not None
    assert sub.status == "active"
    payload = _last_outbox_payload(s)
    assert payload["agency_id"] == 9
    assert set(payload["features"]) == {"contracts", "design3d"}


def test_payment_completed_extends_existing_subscription(monkeypatch):
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    from datetime import datetime, timedelta
    end = datetime.utcnow() + timedelta(days=5)
    sub = Subscription(agency_id=3, plan_id=plan.id, amount=499, status="active", end_date=end)
    s.add(sub)
    s.commit()

    _handle("payment.completed", {"purpose": "subscription", "agency_id": 3,
                                  "billing_cycle": "monthly", "amount": 499}, "m:3")

    updated = s.get(Subscription, sub.id)
    assert updated.end_date > end
    payload = _last_outbox_payload(s)
    assert payload["agency_id"] == 3
    assert set(payload["features"]) == {"contracts", "design3d"}
