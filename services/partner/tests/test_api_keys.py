def _member(db, uid=7):
    from app.models import Partner, PartnerMember
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush(); db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER")); db.commit()
    return p

def test_api_key_create_shows_raw_once_then_hashed(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/api-keys", headers=headers(7), json={"label": "CI"})
    assert r.status_code == 201
    body = r.json()
    assert body["key"] and body["prefix"] == body["key"][:8]   # brut présent à la création
    lst = client.get("/partner/api-keys", headers=headers(7)).json()
    assert all("key" not in k and "key_hash" not in k for k in lst)  # jamais re-exposé
    kid = lst[0]["id"]
    assert client.delete(f"/partner/api-keys/{kid}", headers=headers(7)).status_code == 200

def test_api_key_isolated_between_partners(client, db_session, headers):
    _member(db_session, 7)
    _member(db_session, 8)
    kid = client.post("/partner/api-keys", headers=headers(7), json={"label": "CI"}).json()["id"]
    assert all(k["id"] != kid for k in client.get("/partner/api-keys", headers=headers(8)).json())
    assert client.delete(f"/partner/api-keys/{kid}", headers=headers(8)).status_code == 404
