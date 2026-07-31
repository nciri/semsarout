import app.main as main
from app import models
from app.worker import _handle


def test_payment_completed_flips_gate_to_open(client, db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(main.payment_client, "create_commission_intent",
                        lambda **k: ("PAY-Z", "/payment-gateway?ref=PAY-Z"))
    db_session.add(models.DealCounter(account_id=700, concluded_count=1, first_deal_free_used=True))
    db_session.commit()
    # 1er gate → BLOCKED + invoice_ref PAY-Z
    assert client.get("/internal/commission/gate",
                      params={"account_id": 700, "deal_type": "sale", "source_ref": 3}
                      ).json()["state"] == "BLOCKED"
    # paiement confirmé
    _handle("payment.completed", {"purpose": "commission", "invoice_ref": "PAY-Z"}, "pay:z")
    db_session.expire_all()
    # 2e gate → OPEN (payé)
    assert client.get("/internal/commission/gate",
                      params={"account_id": 700, "deal_type": "sale", "source_ref": 3}
                      ).json()["state"] == "OPEN"
