import app.main as main
from app import models


def test_void_releases_free_slot(client, db_session):
    client.get("/internal/commission/gate",
               params={"account_id": 800, "deal_type": "rental", "source_ref": 1})
    assert db_session.query(models.DealCounter).get(800).first_deal_free_used is True
    r = client.post("/internal/commission/void", json={"deal_type": "rental", "source_ref": 1})
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.query(models.DealCounter).get(800).first_deal_free_used is False


def test_paid_void_becomes_reusable_credit(client, db_session, monkeypatch):
    monkeypatch.setattr(main.payment_client, "create_commission_intent",
                        lambda **k: ("PAY-CR", "/payment-gateway?ref=PAY-CR"))
    db_session.add(models.DealCounter(account_id=801, concluded_count=1, first_deal_free_used=True))
    db_session.commit()
    client.get("/internal/commission/gate",
               params={"account_id": 801, "deal_type": "sale", "source_ref": 2})
    # marque payé puis void → avoir
    c = db_session.query(models.Conclusion).filter_by(source_ref=2).first()
    c.paid = True
    db_session.commit()
    client.post("/internal/commission/void", json={"deal_type": "sale", "source_ref": 2})
    # nouvelle affaire billable → réutilise l'avoir, pas de nouvelle facture (state OPEN direct)
    r = client.get("/internal/commission/gate",
                   params={"account_id": 801, "deal_type": "sale", "source_ref": 3})
    assert r.json()["state"] == "OPEN"
    assert db_session.query(models.Conclusion).filter_by(source_ref=2).first().status == "reused"


def test_voided_free_conclusion_is_not_reused_as_credit(client, db_session, monkeypatch):
    monkeypatch.setattr(main.payment_client, "create_commission_intent",
                        lambda **k: ("PAY-CR2", "/payment-gateway?ref=PAY-CR2"))
    # 1re affaire (gratuite), puis void → le compteur redevient disponible mais
    # la Conclusion gratuite voided ne doit jamais servir d'avoir.
    client.get("/internal/commission/gate",
               params={"account_id": 802, "deal_type": "rental", "source_ref": 10})
    client.post("/internal/commission/void", json={"deal_type": "rental", "source_ref": 10})
    # force le compteur à considérer le crédit "premier gratuit" comme déjà consommé
    counter = db_session.query(models.DealCounter).get(802)
    counter.first_deal_free_used = True
    db_session.commit()
    r = client.get("/internal/commission/gate",
                   params={"account_id": 802, "deal_type": "rental", "source_ref": 11})
    assert r.json()["state"] == "BLOCKED"
    concl = db_session.query(models.Conclusion).filter_by(source_ref=11).first()
    assert concl.billable is True
    assert concl.paid is False
