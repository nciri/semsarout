def _member(db, uid=7):
    from app.models import Partner, PartnerMember
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush(); db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER")); db.commit()
    return p

def _affilie(client, headers, uid=7):
    return client.post("/partner/affilies", headers=headers(uid),
                       json={"full_name": "A", "email": "a@x.ma"}).json()["id"]

def test_create_and_list_verification(client, db_session, headers):
    _member(db_session, 7)
    aid = _affilie(client, headers, 7)
    r = client.post("/partner/verifications", headers=headers(7),
                    json={"affilie_id": aid, "doc_type": "CIN"})
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    assert r.json()["status"] == "PENDING"
    lst = client.get("/partner/verifications", headers=headers(7)).json()
    assert any(v["id"] == vid and v["affilie_id"] == aid for v in lst)

def test_verification_approve(client, db_session, headers):
    _member(db_session, 7)
    aid = _affilie(client, headers, 7)
    vid = client.post("/partner/verifications", headers=headers(7),
                      json={"affilie_id": aid, "doc_type": "CIN"}).json()["id"]
    r = client.post(f"/partner/verifications/{vid}/approve", headers=headers(7))
    assert r.status_code == 200 and r.json()["status"] == "APPROVED"
    assert r.json()["decided_at"] is not None

def test_verification_reject(client, db_session, headers):
    _member(db_session, 7)
    aid = _affilie(client, headers, 7)
    vid = client.post("/partner/verifications", headers=headers(7),
                      json={"affilie_id": aid, "doc_type": "CIN"}).json()["id"]
    r = client.post(f"/partner/verifications/{vid}/reject", headers=headers(7))
    assert r.status_code == 200 and r.json()["status"] == "REJECTED"

def test_verification_isolated_between_partners(client, db_session, headers):
    _member(db_session, 7)
    _member(db_session, 8)
    aid = _affilie(client, headers, 7)
    vid = client.post("/partner/verifications", headers=headers(7),
                      json={"affilie_id": aid, "doc_type": "CIN"}).json()["id"]
    assert all(v["id"] != vid for v in client.get("/partner/verifications", headers=headers(8)).json())
    assert client.post(f"/partner/verifications/{vid}/approve",
                       headers=headers(8)).status_code == 404
