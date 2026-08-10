from app.models import ApiKey, Partner, PartnerMember
from app.auth import hash_key


def _seed_partner(db, uid=7):
    p = Partner(name="Univ Demo", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush()
    db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER"))
    db.commit()
    return p


def test_member_can_access(client, db_session, headers):
    p = _seed_partner(db_session, uid=7)
    r = client.get("/partner/me", headers=headers(user_id=7))
    assert r.status_code == 200
    assert r.json()["id"] == p.id


def test_non_member_forbidden(client, db_session, headers):
    _seed_partner(db_session, uid=7)
    r = client.get("/partner/me", headers=headers(user_id=999))
    assert r.status_code == 403


def test_api_key_auth(client, db_session, headers):
    p = _seed_partner(db_session, uid=7)
    raw = "demo-raw-key"
    db_session.add(ApiKey(partner_id=p.id, label="k", prefix=raw[:8], key_hash=hash_key(raw)))
    db_session.commit()
    r = client.get("/partner/me", headers={"x-api-key": raw, "x-semsar-tenant": "m3a-l3achrane"})
    assert r.status_code == 200
    assert r.json()["id"] == p.id
