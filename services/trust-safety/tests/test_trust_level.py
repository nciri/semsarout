from app.main import upsert_trust_level
from app.models import Report, TrustLevel


def test_upsert_creates_verified(db_session):
    row = upsert_trust_level(db_session, "user", 42, min_level="verified")
    db_session.commit()
    assert row.level == "verified"
    assert row.deal_count == 0


def test_upsert_never_downgrades_via_min_level(db_session):
    upsert_trust_level(db_session, "user", 42, min_level="verified")
    upsert_trust_level(db_session, "user", 42, increment_deals=True)
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "user", "entity_id": 42})
    assert row.level == "verified_experience"
    assert row.deal_count == 1
    upsert_trust_level(db_session, "user", 42, min_level="verified")
    db_session.commit()
    assert row.level == "verified_experience"


def test_force_level_downgrades_immediately(db_session):
    upsert_trust_level(db_session, "agency", 7, min_level="verified")
    upsert_trust_level(db_session, "agency", 7, force_level="none")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 7})
    assert row.level == "none"


def test_read_endpoint_defaults_to_none(client):
    resp = client.get("/trust/agency/999")
    assert resp.status_code == 200
    assert resp.json() == {"level": "none", "deal_count": 0}


def test_read_endpoint_returns_upserted_level(client, db_session):
    upsert_trust_level(db_session, "agency", 5, min_level="verified")
    db_session.commit()
    resp = client.get("/trust/agency/5")
    assert resp.json() == {"level": "verified", "deal_count": 0}


def test_batch_endpoint_requires_internal_token(client):
    resp = client.get("/internal/trust/batch", params={"entity_type": "agency", "ids": "1,2"})
    assert resp.status_code == 403


def test_batch_endpoint_returns_map(client, db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    upsert_trust_level(db_session, "agency", 1, min_level="verified")
    db_session.commit()
    resp = client.get("/internal/trust/batch", params={"entity_type": "agency", "ids": "1,2"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    body = resp.json()["items"]
    assert body["1"] == {"level": "verified", "deal_count": 0}
    assert body["2"] == {"level": "none", "deal_count": 0}


def test_suspend_forces_level_none(client, db_session, monkeypatch, as_superadmin):
    import app.main as m
    upsert_trust_level(db_session, "agency", 7, min_level="verified")
    db_session.commit()

    class _Resp:
        status_code = 200
        def json(self):
            return {"agency": {"id": 7}}

    monkeypatch.setattr(m.httpx, "post", lambda *a, **k: _Resp())
    with as_superadmin():
        resp = client.post("/admin/accounts/agencies/7/suspend")
    assert resp.status_code == 200
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 7})
    assert row.level == "none"


def test_resolve_fraud_report_forces_level_none(client, db_session, as_superadmin):
    upsert_trust_level(db_session, "agency", 3, min_level="verified")
    report = Report(tenant="semsarout", reporter_id=1, target_type="agency",
                    target_id="3", reason="fraud", status="open")
    db_session.add(report)
    db_session.commit()
    with as_superadmin():
        resp = client.post(f"/admin/reports/{report.id}/resolve")
    assert resp.status_code == 200
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 3})
    assert row.level == "none"


def test_resolve_non_fraud_report_does_not_touch_trust(client, db_session, as_superadmin):
    upsert_trust_level(db_session, "agency", 4, min_level="verified")
    report = Report(tenant="semsarout", reporter_id=1, target_type="agency",
                    target_id="4", reason="spam", status="open")
    db_session.add(report)
    db_session.commit()
    with as_superadmin():
        resp = client.post(f"/admin/reports/{report.id}/resolve")
    assert resp.status_code == 200
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 4})
    assert row.level == "verified"
