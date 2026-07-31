import app.main as main
from app import models


def test_blocked_creates_intent_and_emits_due(client, db_session, monkeypatch):
    monkeypatch.setattr(main.payment_client, "create_commission_intent",
                        lambda **k: ("PAY-TEST", "/payment-gateway?ref=PAY-TEST"))
    # forcer 2e affaire
    c = models.DealCounter(account_id=300, concluded_count=1, first_deal_free_used=True)
    db_session.add(c)
    db_session.commit()
    r = client.get("/internal/commission/gate",
                   params={"account_id": 300, "deal_type": "sale", "source_ref": 9})
    body = r.json()
    assert body["state"] == "BLOCKED"
    assert body["pay_url"] == "/payment-gateway?ref=PAY-TEST"
    assert body["invoice_ref"] == "PAY-TEST"
    # commission.due émis dans l'outbox
    from semsar_events import OutboxEvent
    evts = db_session.query(OutboxEvent).filter_by(event_type="commission.due").all()
    assert len(evts) == 1
    assert evts[0].payload["amount"] == 4999.0
