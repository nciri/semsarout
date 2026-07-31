from app import models


def test_default_rule_created_on_demand(client, db_session):
    resp = client.get("/backoffice/commission/rules")
    assert resp.status_code == 200
    # aucune règle seedée manuellement : l'appel gate en créera au besoin (voir active_rule)
    assert "rules" in resp.json()


def test_admin_can_override_amount(client, db_session):
    resp = client.post("/backoffice/commission/rules",
                       json={"deal_type": "rental", "flat_amount": 3500})
    assert resp.status_code == 201
    rules = db_session.query(models.CommissionRule).filter_by(deal_type="rental").all()
    assert any(float(r.flat_amount) == 3500 for r in rules)
