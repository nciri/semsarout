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


def test_payment_failed_consigne_sans_changer_le_statut(monkeypatch):
    """I1 : un paiement qui échoue n'est pas une résiliation."""
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    sub = Subscription(agency_id=5, plan_id=plan.id, amount=499, status="past_due")
    s.add(sub)
    s.commit()

    _handle("payment.failed", {"purpose": "subscription", "agency_id": 5,
                               "reason_code": "card_declined", "reason_label": "Carte refusée"},
            "m:failed:1")

    stored = s.get(Subscription, sub.id)
    assert stored.status == "past_due"
    assert stored.last_payment_failure_reason == "Carte refusée"
    assert stored.last_payment_failure_at is not None


def test_payment_failed_sans_libelle_ne_stocke_aucun_code_technique(monkeypatch):
    """La passerelle simulée n'envoie que `reason_code: unknown` : ce code ne doit jamais
    finir affiché à l'agence."""
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    sub = Subscription(agency_id=6, plan_id=plan.id, amount=499, status="active")
    s.add(sub)
    s.commit()

    _handle("payment.failed", {"purpose": "subscription", "agency_id": 6,
                               "reason_code": "unknown", "reason_label": None}, "m:failed:2")

    stored = s.get(Subscription, sub.id)
    assert stored.last_payment_failure_at is not None
    assert stored.last_payment_failure_reason is None


def test_payment_completed_en_acces_reduit_prolonge_la_meme_ligne_depuis_aujourdhui(monkeypatch):
    """I5 : payer en `restricted` rétablit l'abonnement existant, sans seconde ligne, et la
    nouvelle période commence maintenant — pas à une échéance vieille de plusieurs semaines."""
    from datetime import datetime, timedelta

    from app.models import Invoice
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    sub = Subscription(agency_id=7, plan_id=plan.id, amount=499, status="restricted",
                       end_date=datetime.utcnow() - timedelta(days=40),
                       grace_until=datetime.utcnow() - timedelta(days=16))
    s.add(sub)
    s.commit()
    s.add(Invoice(reference="INV-R-1", subscription_id=sub.id, agency_id=7, amount=499,
                  status="unpaid"))
    s.commit()

    _handle("payment.completed", {"purpose": "subscription", "agency_id": 7, "plan_id": plan.id,
                                  "billing_cycle": "monthly", "amount": 499}, "m:paid:1")

    assert s.query(Subscription).filter_by(agency_id=7).count() == 1
    stored = s.get(Subscription, sub.id)
    assert stored.status == "active"
    assert stored.grace_until is None
    assert stored.end_date > datetime.utcnow() + timedelta(days=29)
    assert s.query(Invoice).filter_by(subscription_id=sub.id).one().status == "paid"
    assert _last_outbox_payload(s)["features_until"] is None


def test_payment_completed_pendant_la_grace_prolonge_depuis_l_echeance(monkeypatch):
    """Payé dans la grâce : la période repart de l'ancienne échéance — aucun jour offert ni perdu."""
    from datetime import datetime, timedelta
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    old_end = datetime.utcnow() - timedelta(days=5)
    sub = Subscription(agency_id=8, plan_id=plan.id, amount=499, status="past_due",
                       end_date=old_end, grace_until=datetime.utcnow() + timedelta(days=19))
    s.add(sub)
    s.commit()

    _handle("payment.completed", {"purpose": "subscription", "agency_id": 8, "plan_id": plan.id,
                                  "billing_cycle": "monthly", "amount": 499}, "m:paid:2")

    stored = s.get(Subscription, sub.id)
    assert stored.status == "active"
    assert stored.end_date == old_end + timedelta(days=30)
