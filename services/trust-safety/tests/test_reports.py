from tests.conftest import _set_principal


def _payload(**overrides):
    body = {"target_type": "listing", "target_id": "l1", "reason": "spam",
            "description": "Annonce suspecte"}
    body.update(overrides)
    return body


def test_create_report_requires_auth(client):
    _set_principal(uid="")
    try:
        resp = client.post("/reports", json=_payload())
    finally:
        _set_principal()  # repli sur l'utilisateur normal du fixture `client`
    assert resp.status_code == 401


def test_create_report_ok(client):
    resp = client.post("/reports", json=_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "open"
    assert body["tenant"] == "m3a-l3achrane"
    assert body["reporter_id"] == 10
    assert body["target_type"] == "listing"
    assert body["reason"] == "spam"
    assert body["resolved_at"] is None


def test_create_report_honors_tenant_header(client):
    resp = client.post("/reports", json=_payload(),
                       headers={"x-semsar-tenant": "semsar"})
    assert resp.status_code == 201
    assert resp.json()["tenant"] == "semsar"


def test_create_report_invalid_reason(client):
    resp = client.post("/reports", json=_payload(reason="bogus"))
    assert resp.status_code == 422


def test_create_report_invalid_target_type(client):
    resp = client.post("/reports", json=_payload(target_type="bogus"))
    assert resp.status_code == 422


def test_internal_reports_requires_token(client):
    client.post("/reports", json=_payload())
    resp = client.get("/internal/reports", params={"tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_internal_reports_lists(client, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    client.post("/reports", json=_payload())
    resp = client.get("/internal/reports", params={"tenant": "m3a-l3achrane"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["target_id"] == "l1"


def test_internal_reports_filters_by_status(client, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    client.post("/reports", json=_payload())
    resp = client.get("/internal/reports", params={"status": "resolved"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["items"] == []


def test_internal_reports_rejects_unknown_status(client, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    resp = client.get("/internal/reports", params={"status": "bogus"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 400


def test_resolve_requires_superadmin(client):
    created = client.post("/reports", json=_payload()).json()
    resp = client.post(f"/admin/reports/{created['id']}/resolve")
    assert resp.status_code == 403


def test_resolve_report(client, as_superadmin):
    created = client.post("/reports", json=_payload()).json()
    with as_superadmin():
        resp = client.post(f"/admin/reports/{created['id']}/resolve")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "resolved"
    assert body["resolver_id"] == 99
    assert body["resolved_at"] is not None


def test_dismiss_report(client, as_superadmin):
    created = client.post("/reports", json=_payload()).json()
    with as_superadmin():
        resp = client.post(f"/admin/reports/{created['id']}/dismiss")
    assert resp.status_code == 200
    assert resp.json()["status"] == "dismissed"


def test_resolve_unknown_report(client, as_superadmin):
    with as_superadmin():
        resp = client.post("/admin/reports/999999/resolve")
    assert resp.status_code == 404


def test_resolve_already_closed_report(client, as_superadmin):
    created = client.post("/reports", json=_payload()).json()
    with as_superadmin():
        client.post(f"/admin/reports/{created['id']}/resolve")
        resp = client.post(f"/admin/reports/{created['id']}/dismiss")
    assert resp.status_code == 409
