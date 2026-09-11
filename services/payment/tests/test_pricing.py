"""Résolution du montant depuis la projection du catalogue (spec 2026-09-12).

`SERVICE_PRICES` était une grille en dur dans ce service : c'est elle qui faisait autorité sur
ce qui était prélevé, indépendamment de ce que le site affichait. Le montant vient désormais de
`ServicePriceRO`, projection de `billing.service_price`.
"""
from datetime import datetime, timedelta

from app.models import Payment, PlanRO, ServicePriceRO


def _headers():
    return {"x-semsar-user-id": "3", "x-semsar-agency-id": "12"}


def _intent(client, **over):
    body = {"service_id": "forfait-vente", "purpose": "service", "payment_method": "card"}
    body.update(over)
    return client.post("/payments/create-intent", json=body, headers=_headers())


def test_montant_resolu_depuis_la_projection(client, db_session):
    db_session.add(ServicePriceRO(code="forfait-vente", amount=9900, kind="one_off"))
    db_session.commit()

    r = _intent(client)
    assert r.status_code == 200
    p = db_session.query(Payment).one()
    assert float(p.amount) == 9900.0
    assert p.payment_type == "service"
    assert p.service_id == "forfait-vente"


def test_projection_vide_refuse_le_paiement(client, db_session):
    """Fail-closed : un prix deviné est un prix faux, et ici c'est de l'argent (I3)."""
    r = _intent(client)
    assert r.status_code == 422
    assert db_session.query(Payment).count() == 0


def test_code_inconnu_refuse(client, db_session):
    db_session.add(ServicePriceRO(code="forfait-vente", amount=9900, kind="one_off"))
    db_session.commit()

    assert _intent(client, service_id="inexistant").status_code == 422
    assert db_session.query(Payment).count() == 0


def test_prestation_retiree_de_l_offre_refusee(client, db_session):
    """`photos-pro` reste en base pour l'historique, mais ne se vend plus (I7)."""
    db_session.add(ServicePriceRO(code="photos-pro", amount=990, kind="one_off", is_active=False))
    db_session.commit()

    assert _intent(client, service_id="photos-pro").status_code == 422
    assert db_session.query(Payment).count() == 0


def test_intention_recente_reutilisee_avec_son_prix(client, db_session):
    """I5 : le client paie le prix affiché au départ. Un changement de tarif entre-temps ne
    doit pas modifier une intention en cours."""
    db_session.add(ServicePriceRO(code="forfait-vente", amount=9900, kind="one_off"))
    db_session.commit()
    first = _intent(client).json()

    db_session.query(ServicePriceRO).filter_by(code="forfait-vente").one().amount = 12000
    db_session.commit()

    second = _intent(client).json()
    assert second["reference"] == first["reference"]
    assert db_session.query(Payment).count() == 1
    assert float(db_session.query(Payment).one().amount) == 9900.0


def test_intention_de_plus_de_24h_non_reutilisee(client, db_session):
    db_session.add(ServicePriceRO(code="forfait-vente", amount=9900, kind="one_off"))
    db_session.commit()
    first = _intent(client).json()
    stale = db_session.query(Payment).one()
    stale.created_at = datetime.utcnow() - timedelta(hours=25)
    db_session.query(ServicePriceRO).filter_by(code="forfait-vente").one().amount = 12000
    db_session.commit()

    second = _intent(client).json()
    assert second["reference"] != first["reference"]
    amounts = sorted(float(p.amount) for p in db_session.query(Payment).all())
    assert amounts == [9900.0, 12000.0], "l'ancienne intention n'est ni annulée ni requalifiée"


def test_webhook_honore_un_paiement_sur_une_intention_agee(client, db_session):
    """I6 : refuser un encaissement réel pour une règle d'expiration créerait un client débité
    sans prestation."""
    db_session.add(Payment(reference="PAY-OLD-1", payment_type="service",
                           service_id="forfait-vente", amount=9900, agency_id=12, user_id=3,
                           status="pending", created_at=datetime.utcnow() - timedelta(days=9)))
    db_session.commit()

    r = client.post("/payments/webhook", json={"reference": "PAY-OLD-1", "status": "success",
                                               "gateway_reference": "CMI-1"})
    assert r.status_code == 200
    assert db_session.query(Payment).one().status == "completed"


def test_montant_du_plan_resolu_depuis_la_projection(client, db_session):
    """`PlanRO` n'était alimentée par rien : tout paiement d'abonnement échouait en 400."""
    db_session.add(PlanRO(id=4, slug="pro", price_monthly=799, price_yearly=7990))
    db_session.commit()

    r = client.post("/payments/create-intent",
                    json={"plan_id": "pro", "purpose": "subscription", "billing_cycle": "yearly"},
                    headers=_headers())
    assert r.status_code == 200
    p = db_session.query(Payment).one()
    assert float(p.amount) == 7990.0
    assert p.payment_type == "subscription" and p.plan_id == 4


def test_worker_projette_les_prix_et_est_idempotent(db_session, monkeypatch):
    from app import worker
    monkeypatch.setattr(worker, "SessionLocal", lambda: db_session)

    worker._handle("billing.service_price.changed",
                   {"code": "forfait-vente", "amount": 9900.0, "kind": "one_off",
                    "is_active": True}, "m:1")
    worker._handle("billing.service_price.changed",
                   {"code": "forfait-vente", "amount": 12000.0, "kind": "one_off",
                    "is_active": True}, "m:1")  # rejeu du MÊME message
    assert float(db_session.query(ServicePriceRO).one().amount) == 9900.0

    worker._handle("billing.plan.changed",
                   {"id": 4, "slug": "pro", "price_monthly": 799.0, "price_yearly": 7990.0},
                   "m:2")
    assert float(db_session.query(PlanRO).one().price_yearly) == 7990.0


def test_worker_projette_le_retrait_d_une_prestation(db_session, monkeypatch):
    from app import worker
    monkeypatch.setattr(worker, "SessionLocal", lambda: db_session)

    worker._handle("billing.service_price.changed",
                   {"code": "photos-pro", "amount": 990.0, "kind": "one_off",
                    "is_active": False}, "m:3")
    assert db_session.query(ServicePriceRO).one().is_active is False


def test_amorcage_ne_reecrit_pas_une_projection_deja_peuplee(db_session, monkeypatch):
    """Un prix reçu par événement est plus récent que l'amorçage : ne pas l'écraser."""
    import httpx

    from app import worker
    monkeypatch.setattr(worker, "SessionLocal", lambda: db_session)
    db_session.add(ServicePriceRO(code="forfait-vente", amount=12000, kind="one_off"))
    db_session.commit()

    def boom(*a, **kw):
        raise AssertionError("billing ne doit pas être interrogé")

    monkeypatch.setattr(httpx, "get", boom)
    worker.backfill()
    assert float(db_session.query(ServicePriceRO).one().amount) == 12000.0


def test_amorcage_ne_leve_pas_si_billing_est_absent(db_session, monkeypatch):
    import httpx

    from app import worker
    monkeypatch.setattr(worker, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: (_ for _ in ()).throw(httpx.ConnectError("down")))
    worker.backfill()
    assert db_session.query(ServicePriceRO).count() == 0
