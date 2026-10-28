"""Portail d'abonnement : prorata à la montée, rétrogradation programmée, réactivation."""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from semsar_auth import Principal, get_principal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, proration
from app.db import get_db
from app.main import app
from app.models import Invoice, Subscription, SubscriptionEvent, SubscriptionPlan

AGENCY = 7


def _plan(slug, price, **over):
    base = {"name": slug.capitalize(), "slug": slug, "max_listings": 100,
            "price_monthly": price, "price_yearly": price * 10, "max_seats": -1, "max_teams": -1,
            "is_active": True,
            "has_contracts": False, "has_legal": False, "has_artisans": False,
            "has_rental": False, "has_programs": False, "has_analytics": False,
            "has_api_access": False, "has_csv_import": False, "has_staymanager_sync": False,
            "has_design3d": False}
    base.update(over)
    return SubscriptionPlan(**base)


@pytest.fixture
def db(tmp_path, monkeypatch):
    from semsar_events import OutboxBase

    engine = create_engine(f"sqlite:///{tmp_path/'b.db'}", future=True,
                           connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    from app import main as m, seats_client
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    monkeypatch.setattr(seats_client, "seats_of",
                        lambda agency_id: {"active_member_seats": 1, "teams_used": 0})
    yield session
    session.close()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=["agency_admin"], agency_id=AGENCY, is_superadmin=False,
        features=[], claims={})
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _subscribed(db, *, price=200, days_left=15, status="active"):
    starter = _plan("starter", price)
    pro = _plan("pro", price * 2, has_rental=True)
    db.add_all([starter, pro])
    db.commit()
    now = datetime.utcnow()
    sub = Subscription(agency_id=AGENCY, plan_id=starter.id, billing_cycle="monthly",
                       amount=price, status=status, start_date=now - timedelta(days=30 - days_left),
                       end_date=now + timedelta(days=days_left))
    db.add(sub)
    db.commit()
    return sub, starter, pro


def test_le_prorata_ne_facture_que_le_temps_restant():
    start = datetime(2026, 11, 1)
    end = datetime(2026, 12, 1)
    half = datetime(2026, 11, 16)
    amount = proration.upgrade_amount(200, 400, start, end, half)
    assert Decimal("96") <= amount <= Decimal("104")   # ~la moitié de 200


def test_le_prorata_est_nul_pour_une_retrogradation():
    start, end = datetime(2026, 11, 1), datetime(2026, 12, 1)
    assert proration.upgrade_amount(400, 200, start, end, datetime(2026, 11, 10)) == Decimal("0.00")


def test_le_prorata_derisoire_est_offert():
    start, end = datetime(2026, 11, 1), datetime(2026, 12, 1)
    # Il reste une heure : la différence ne vaut pas une facture.
    assert proration.upgrade_amount(200, 400, start, end, datetime(2026, 11, 30, 23, 0)) == Decimal("0.00")


def test_monter_de_gamme_facture_la_difference_sans_decaler_l_echeance(client, db):
    sub, _, pro = _subscribed(db, price=200, days_left=15)
    before_end = sub.end_date
    resp = client.post("/subscription/change-plan", json={"plan_id": "pro"})
    assert resp.status_code == 200
    body = resp.json()
    invoice = db.query(Invoice).one()
    # Différence de 200 Dh sur la moitié d'un mois : ~100 Dh, pas 400.
    assert Decimal("80") <= Decimal(str(invoice.amount)) <= Decimal("120")
    assert body["subscription"]["end_date"] == before_end.isoformat()
    assert body["subscription"]["plan"]["slug"] == "pro"
    assert body["subscription"]["status"] == "incomplete"


def test_retrograder_est_programme_au_terme_sans_facture(client, db):
    sub, starter, pro = _subscribed(db, price=200, days_left=10)
    sub.plan_id = pro.id
    sub.amount = 400
    db.commit()

    resp = client.post("/subscription/change-plan", json={"plan_id": "starter"})
    assert resp.status_code == 200
    pending = resp.json()["subscription"]["pending_change"]
    assert pending["plan_slug"] == "starter"
    assert pending["effective_at"] == sub.end_date.isoformat()
    # Le plan courant ne change pas tout de suite, et rien n'est facturé.
    assert resp.json()["subscription"]["plan"]["slug"] == "pro"
    assert db.query(Invoice).count() == 0
    assert [e.kind for e in db.query(SubscriptionEvent).all()] == ["downgrade_scheduled"]


def test_annuler_la_retrogradation_programmee(client, db):
    sub, starter, pro = _subscribed(db, price=200, days_left=10)
    sub.plan_id, sub.amount = pro.id, 400
    db.commit()
    client.post("/subscription/change-plan", json={"plan_id": "starter"})
    resp = client.post("/subscription/plan-change/cancel")
    assert resp.status_code == 200
    assert resp.json()["subscription"]["pending_change"] is None
    assert client.post("/subscription/plan-change/cancel").status_code == 404


def test_le_changement_programme_s_applique_au_renouvellement(client, db):
    sub, starter, pro = _subscribed(db, price=200, days_left=10)
    sub.plan_id, sub.amount = pro.id, 400
    db.commit()
    client.post("/subscription/change-plan", json={"plan_id": "starter"})
    # L'échéance tombe.
    sub.end_date = datetime.utcnow() - timedelta(minutes=1)
    sub.pending_effective_at = sub.end_date
    db.commit()

    resp = client.post("/internal/subscriptions/issue-renewals", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    db.refresh(sub)
    assert sub.plan_id == starter.id
    assert Decimal(str(sub.amount)) == Decimal("200")
    assert sub.pending_plan_id is None
    assert Decimal(str(db.query(Invoice).one().amount)) == Decimal("200")
    assert "plan_change_applied" in [e.kind for e in db.query(SubscriptionEvent).all()]


def test_reactiver_un_abonnement_resilie_dont_la_periode_court(client, db):
    sub, _, _ = _subscribed(db, price=200, days_left=12)
    client.post("/cancel-subscription")
    db.refresh(sub)
    assert sub.cancelled_at is not None

    resp = client.post("/subscription/reactivate")
    assert resp.status_code == 200
    db.refresh(sub)
    assert (sub.cancelled_at, sub.status) == (None, "active")
    assert db.query(Invoice).count() == 0   # la période est déjà payée
    assert "reactivated" in [e.kind for e in db.query(SubscriptionEvent).all()]


def test_reactiver_apres_le_terme_est_refuse(client, db):
    sub, _, _ = _subscribed(db, price=200, days_left=5)
    client.post("/cancel-subscription")
    sub.end_date = datetime.utcnow() - timedelta(days=1)
    db.commit()
    assert client.post("/subscription/reactivate").status_code == 409


def test_reactiver_sans_resiliation_est_refuse(client, db):
    _subscribed(db, price=200, days_left=5)
    assert client.post("/subscription/reactivate").status_code == 400


def test_le_journal_des_mouvements_est_lisible_par_l_agence(client, db):
    sub, _, pro = _subscribed(db, price=200, days_left=15)
    client.post("/subscription/change-plan", json={"plan_id": "pro"})
    events = client.get("/subscription/events").json()["events"]
    assert events[0]["kind"] == "plan_changed"
    assert events[0]["detail"]["plan"] == "pro"
