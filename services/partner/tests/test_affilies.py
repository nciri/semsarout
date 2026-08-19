def _member(db, uid=7):
    from app.models import Partner, PartnerMember
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush(); db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER")); db.commit()
    return p

def test_create_and_list_affilie(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/affilies", headers=headers(7),
                    json={"full_name": "Sara B.", "email": "sara@x.ma"})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    lst = client.get("/partner/affilies", headers=headers(7)).json()
    assert any(a["id"] == aid and a["full_name"] == "Sara B." for a in lst)

def test_affilie_isolated_between_partners(client, db_session, headers):
    _member(db_session, 7)                    # partenaire A (user 7)
    _member(db_session, 8)                    # partenaire B (user 8)
    aid = client.post("/partner/affilies", headers=headers(7),
                      json={"full_name": "A", "email": "a@x.ma"}).json()["id"]
    # user 8 (autre partenaire) ne voit pas l'affilié de A
    assert all(a["id"] != aid for a in client.get("/partner/affilies", headers=headers(8)).json())
    assert client.patch(f"/partner/affilies/{aid}", headers=headers(8),
                        json={"status": "ACTIVE"}).status_code == 404

def test_affilie_update_rejects_empty_full_name(client, db_session, headers):
    _member(db_session, 7)
    aid = client.post("/partner/affilies", headers=headers(7),
                      json={"full_name": "A", "email": "a@x.ma"}).json()["id"]
    r = client.patch(f"/partner/affilies/{aid}", headers=headers(7), json={"full_name": ""})
    assert r.status_code == 422
