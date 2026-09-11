"""Catalogue tarifaire administrable (spec 2026-09-12-catalogue-tarifaire-design).

Une seule source détient un montant, et elle est éditable par le superadmin : sans cela, le
prix affiché et le prix prélevé divergent (constaté en portant le forfait de 4 900 à 9 900,
qui demandait de toucher huit endroits).
"""
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.db import get_db
from app.main import app
from app.models import ServicePrice, SubscriptionPlan


def _db(tmp_path):
    from semsar_events import OutboxBase

    engine = create_engine(f"sqlite:///{tmp_path / 'p.db'}", future=True,
                           connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def _seeded(tmp_path):
    db = _db(tmp_path)
    db.add_all([
        ServicePrice(code="forfait-vente", amount=9900, kind="one_off"),
        ServicePrice(code="photos-pro-360", amount=500, kind="one_off"),
        ServicePrice(code="photos-pro", amount=990, kind="one_off", is_active=False),
        ServicePrice(code="staymanager-manage", amount=179, kind="recurring_monthly"),
    ])
    db.add(SubscriptionPlan(name="Pro", slug="pro", max_listings=100, price_monthly=799,
                            price_yearly=7990))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    return db


def _admin():
    return {"x-semsar-user-id": "7", "x-semsar-superadmin": "1"}


def _last_event(db, event_type):
    from semsar_events import OutboxEvent
    return (db.query(OutboxEvent).filter_by(event_type=event_type)
            .order_by(OutboxEvent.id.desc()).first())


def test_pricing_public_n_expose_que_l_actif(tmp_path):
    db = _seeded(tmp_path)
    try:
        with TestClient(app) as client:
            body = client.get("/pricing").json()
        codes = {s["code"]: s for s in body["services"]}
        assert codes["forfait-vente"]["amount"] == 9900.0
        assert codes["staymanager-manage"]["kind"] == "recurring_monthly"
        assert "photos-pro" not in codes, "une prestation retirée de l'offre ne doit pas s'afficher"
        assert body["plans"][0]["slug"] == "pro"
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_superadmin_change_un_prix_et_laisse_une_trace(tmp_path):
    from app.models import PriceChange
    db = _seeded(tmp_path)
    try:
        with TestClient(app) as client:
            r = client.put("/admin/service-prices/forfait-vente", json={"amount": 12000},
                           headers=_admin())
        assert r.status_code == 200
        assert float(db.get(ServicePrice, "forfait-vente").amount) == 12000.0
        trace = db.query(PriceChange).filter_by(code="forfait-vente").one()
        assert float(trace.old_amount) == 9900.0 and float(trace.new_amount) == 12000.0
        assert trace.changed_by == 7
        ev = _last_event(db, "billing.service_price.changed")
        assert ev is not None and ev.payload["code"] == "forfait-vente"
        assert ev.payload["amount"] == 12000.0
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_un_prix_ne_change_pas_sans_superadmin(tmp_path):
    db = _seeded(tmp_path)
    try:
        with TestClient(app) as client:
            r = client.put("/admin/service-prices/forfait-vente", json={"amount": 1},
                           headers={"x-semsar-user-id": "7"})
        assert r.status_code == 403
        assert float(db.get(ServicePrice, "forfait-vente").amount) == 9900.0
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_montant_non_positif_et_code_inconnu_refuses(tmp_path):
    from app.models import PriceChange
    db = _seeded(tmp_path)
    try:
        with TestClient(app) as client:
            for bad in (0, -10):
                assert client.put("/admin/service-prices/forfait-vente", json={"amount": bad},
                                  headers=_admin()).status_code == 422
            assert client.put("/admin/service-prices/inconnu", json={"amount": 10},
                              headers=_admin()).status_code == 404
        assert float(db.get(ServicePrice, "forfait-vente").amount) == 9900.0
        assert db.query(PriceChange).count() == 0, "un refus ne laisse aucune trace de changement"
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_retirer_une_prestation_de_l_offre_sans_la_supprimer(tmp_path):
    """I7 : des paiements passés portent ce code, son historique doit rester lisible."""
    db = _seeded(tmp_path)
    try:
        with TestClient(app) as client:
            r = client.patch("/admin/service-prices/photos-pro-360", json={"is_active": False},
                             headers=_admin())
            assert r.status_code == 200
            body = client.get("/pricing").json()
        assert db.get(ServicePrice, "photos-pro-360") is not None
        assert "photos-pro-360" not in {s["code"] for s in body["services"]}
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_superadmin_change_le_prix_d_un_plan(tmp_path):
    from app.models import PriceChange
    db = _seeded(tmp_path)
    plan = db.query(SubscriptionPlan).one()
    try:
        with TestClient(app) as client:
            r = client.put(f"/admin/subscription-plans/{plan.id}",
                           json={"price_monthly": 899, "price_yearly": 8990}, headers=_admin())
        assert r.status_code == 200
        stored = db.get(SubscriptionPlan, plan.id)
        assert float(stored.price_monthly) == 899.0 and float(stored.price_yearly) == 8990.0
        codes = {c.code for c in db.query(PriceChange).all()}
        assert codes == {"plan:pro:monthly", "plan:pro:yearly"}
        ev = _last_event(db, "billing.plan.changed")
        assert ev is not None and ev.payload["slug"] == "pro"
        assert ev.payload["price_monthly"] == 899.0
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_endpoint_interne_sert_l_amorcage_de_payment(tmp_path):
    """payment amorce sa projection ici : sans cet endpoint, un payment neuf refuserait tout
    paiement jusqu'au premier changement de prix."""
    from app import main as m
    db = _seeded(tmp_path)
    m.settings.internal_token = "tok"
    try:
        with TestClient(app) as client:
            assert client.get("/internal/service-prices").status_code == 403
            body = client.get("/internal/service-prices",
                              headers={"x-internal-token": "tok"}).json()
        codes = {s["code"]: s for s in body["services"]}
        # L'amorçage porte aussi l'inactif : payment doit pouvoir refuser un code retiré de
        # l'offre en le connaissant, plutôt que de le confondre avec un code inexistant.
        assert codes["photos-pro"]["is_active"] is False
        assert codes["forfait-vente"]["is_active"] is True
        assert body["plans"][0]["price_monthly"] == 799.0
    finally:
        app.dependency_overrides.clear()
        db.close()
