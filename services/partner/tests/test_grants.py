def _member(db, uid=7):
    from app.models import Partner, PartnerMember
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush(); db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER")); db.commit()
    return p

def test_create_and_list_grant(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/grants", headers=headers(7),
                    json={"program": "Bourse rentrée", "amount": 1500.5})
    assert r.status_code == 201, r.text
    gid = r.json()["id"]
    assert r.json()["status"] == "PLANNED" and r.json()["currency"] == "MAD"
    lst = client.get("/partner/grants", headers=headers(7)).json()
    assert any(g["id"] == gid and g["program"] == "Bourse rentrée" for g in lst)

def test_grant_patch_paid(client, db_session, headers):
    _member(db_session, 7)
    gid = client.post("/partner/grants", headers=headers(7),
                      json={"program": "Bourse", "amount": 1000}).json()["id"]
    r = client.patch(f"/partner/grants/{gid}", headers=headers(7), json={"status": "PAID"})
    assert r.status_code == 200 and r.json()["status"] == "PAID"

def test_grant_isolated_between_partners(client, db_session, headers):
    _member(db_session, 7)
    _member(db_session, 8)
    gid = client.post("/partner/grants", headers=headers(7),
                      json={"program": "Bourse", "amount": 1000}).json()["id"]
    assert all(g["id"] != gid for g in client.get("/partner/grants", headers=headers(8)).json())
    assert client.patch(f"/partner/grants/{gid}", headers=headers(8),
                        json={"status": "PAID"}).status_code == 404
