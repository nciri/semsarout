def _gate(client, account_id, deal_type, source_ref):
    return client.get("/internal/commission/gate",
                      params={"account_id": account_id, "deal_type": deal_type, "source_ref": source_ref})


def test_first_deal_is_open_and_waived(client, db_session):
    r = _gate(client, 100, "rental", 1)
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "OPEN"
    assert body["billable"] is False


def test_second_deal_is_blocked(client, db_session, monkeypatch):
    import app.main as main
    from app import models
    monkeypatch.setattr(main.payment_client, "create_commission_intent",
                        lambda **k: ("PAY-STUB", "/payment-gateway?ref=PAY-STUB"))
    # 1re affaire réservée puis effectivement conclue (compteur avancé)
    _gate(client, 100, "rental", 1)
    c = db_session.query(models.DealCounter).get(100)
    c.first_deal_free_used = True
    db_session.commit()
    r = _gate(client, 100, "rental", 2)
    assert r.json()["state"] == "BLOCKED"
    assert r.json()["billable"] is True


def test_gate_is_idempotent(client, db_session):
    from app import models
    _gate(client, 200, "rental", 5)
    _gate(client, 200, "rental", 5)
    n = db_session.query(models.Conclusion).filter_by(deal_type="rental", source_ref=5).count()
    assert n == 1
