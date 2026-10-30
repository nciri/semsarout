from app.models import WorkOrder


def _wo_en_base(db_session, **champs) -> WorkOrder:
    wo = WorkOrder(agency_id=4, **champs)
    db_session.add(wo)
    db_session.commit()
    return wo


def test_la_charge_utile_porte_le_payeur(client, db_session):
    wo = _wo_en_base(db_session, title="Chauffe-eau", trade="plombier", property_id=7)
    r = client.get(f"/backoffice/work-orders/{wo.id}")
    assert r.status_code == 200
    body = r.json()["work_order"]
    for champ in ("client_id", "lease_id", "nature", "payer", "charge_mode",
                  "third_party_label", "charged_at", "settled_at"):
        assert champ in body
