def _member(db, uid=7):
    from app.models import Partner, PartnerMember
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush(); db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER")); db.commit()
    return p

def _reservation_payload(**overrides):
    payload = {"listing_id": "lst-1", "label": "Studio Rabat",
               "start_date": "2026-09-01", "end_date": "2026-09-30"}
    payload.update(overrides)
    return payload

def test_create_and_list_reservation(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/reservations", headers=headers(7), json=_reservation_payload())
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert r.json()["status"] == "RESERVED"
    lst = client.get("/partner/reservations", headers=headers(7)).json()
    assert any(x["id"] == rid and x["listing_id"] == "lst-1" for x in lst)

def test_reservation_release(client, db_session, headers):
    _member(db_session, 7)
    rid = client.post("/partner/reservations", headers=headers(7),
                      json=_reservation_payload()).json()["id"]
    r = client.post(f"/partner/reservations/{rid}/release", headers=headers(7))
    assert r.status_code == 200 and r.json()["status"] == "RELEASED"

def test_reservation_isolated_between_partners(client, db_session, headers):
    _member(db_session, 7)
    _member(db_session, 8)
    rid = client.post("/partner/reservations", headers=headers(7),
                      json=_reservation_payload()).json()["id"]
    assert all(x["id"] != rid for x in client.get("/partner/reservations", headers=headers(8)).json())
    assert client.post(f"/partner/reservations/{rid}/release",
                       headers=headers(8)).status_code == 404
