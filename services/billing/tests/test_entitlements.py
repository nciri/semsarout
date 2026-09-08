"""plan_features() (dérivation gating -> claims JWT) + `/internal/subscription` (repli identity)
+ émission `billing.subscription.activated` (activation ET résiliation)."""
from fastapi.testclient import TestClient
from semsar_auth import Principal, get_principal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.db import get_db
from app.main import app
from app.models import Subscription, SubscriptionPlan
from app.plans import plan_features


def _plan(**overrides) -> SubscriptionPlan:
    base = {"name": "Pro", "slug": "pro", "max_listings": 100, "price_monthly": 499,
           "has_contracts": False, "has_legal": False, "has_artisans": False, "has_rental": False,
           "has_programs": False, "has_analytics": False, "has_api_access": False,
           "has_csv_import": False, "has_staymanager_sync": False, "has_design3d": False}
    base.update(overrides)
    return SubscriptionPlan(**base)


def test_plan_features_derives_from_has_columns():
    p = _plan(has_contracts=True, has_design3d=True, has_rental=True)
    assert set(plan_features(p)) == {"contracts", "design3d", "rental"}


def test_plan_features_empty_when_no_flag_set():
    p = _plan()
    assert plan_features(p) == []


def _db_session(tmp_path):
    from semsar_events import OutboxBase

    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}", future=True,
                           connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def test_internal_subscription_exposes_features(monkeypatch, tmp_path):
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True, has_artisans=True)
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=7, plan_id=plan.id, amount=499, status="active"))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 7},
                              headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        assert set(resp.json()["subscription"]["features"]) == {"design3d", "artisans"}
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_cancel_subscription_emits_current_features(tmp_path):
    """La résiliation ne coupe pas l'accès immédiatement (message : « Access continues until end
    of billing period »). L'événement doit donc porter les features COURANTES du plan, pas une
    liste vide — sans quoi `AgencyRO.features` (identity) serait faussement vidée avant la fin de
    la période payée. C'est le seul événement qui sera jamais émis pour cet abonnement une fois
    résilié (aucun job d'expiration n'existe côté billing) : sans lui, `AgencyRO.features` restait
    figée pour toujours à l'état d'avant résiliation."""
    from semsar_events import OutboxEvent

    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True, has_rental=True)
    db.add(plan)
    db.commit()
    sub = Subscription(agency_id=11, plan_id=plan.id, amount=499, status="active")
    db.add(sub)
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_principal] = lambda: Principal(sub="1", agency_id=11)
    try:
        with TestClient(app) as client:
            resp = client.post("/cancel-subscription")
        assert resp.status_code == 200
        updated = db.get(Subscription, sub.id)
        assert updated.status == "cancelled"
        ev = db.query(OutboxEvent).filter_by(
            event_type="billing.subscription.activated").order_by(OutboxEvent.id.desc()).first()
        assert ev is not None
        assert ev.payload["agency_id"] == 11
        assert set(ev.payload["features"]) == {"design3d", "rental"}
    finally:
        app.dependency_overrides.clear()
        db.close()
