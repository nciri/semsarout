def _member(db, uid=7):
    from app.models import Partner, PartnerMember
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush(); db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER")); db.commit()
    return p

def test_create_and_list_invoice(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/invoices", headers=headers(7),
                    json={"number": "INV-001", "period": "2026-08", "amount": 2500})
    assert r.status_code == 201, r.text
    iid = r.json()["id"]
    assert r.json()["status"] == "DRAFT" and r.json()["currency"] == "MAD"
    lst = client.get("/partner/invoices", headers=headers(7)).json()
    assert any(i["id"] == iid and i["number"] == "INV-001" for i in lst)

def test_invoice_patch_sent(client, db_session, headers):
    _member(db_session, 7)
    iid = client.post("/partner/invoices", headers=headers(7),
                      json={"number": "INV-002", "period": "2026-08", "amount": 500}).json()["id"]
    r = client.patch(f"/partner/invoices/{iid}", headers=headers(7), json={"status": "SENT"})
    assert r.status_code == 200 and r.json()["status"] == "SENT"
    assert r.json()["issued_at"] is not None

def test_invoice_isolated_between_partners(client, db_session, headers):
    _member(db_session, 7)
    _member(db_session, 8)
    iid = client.post("/partner/invoices", headers=headers(7),
                      json={"number": "INV-003", "period": "2026-08", "amount": 500}).json()["id"]
    assert all(i["id"] != iid for i in client.get("/partner/invoices", headers=headers(8)).json())
    assert client.patch(f"/partner/invoices/{iid}", headers=headers(8),
                        json={"status": "SENT"}).status_code == 404
