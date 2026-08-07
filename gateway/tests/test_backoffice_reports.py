import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def reports_env(monkeypatch):
    def trust_safety_handler(request):
        if request.url.path == "/internal/reports":
            assert request.url.params.get("tenant") == "m3a-l3achrane"
            assert request.headers.get("x-internal-token") == "tok"
            return httpx.Response(200, json={"items": [
                {"id": 1, "tenant": "m3a-l3achrane", "reporter_id": 7, "target_type": "listing",
                 "target_id": "l1", "reason": "spam", "description": None, "status": "open",
                 "created_at": "2026-08-01T10:00:00+00:00", "resolved_at": None,
                 "resolver_id": None},
            ]})
        return httpx.Response(404, json={"error": "not found"})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.trust_safety = _mock_client(trust_safety_handler)
        yield client


def _fake_ident(superadmin=True, tenant="m3a-l3achrane"):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": 1, "tenant": tenant, "is_superadmin": superadmin}
    return fake


def test_reports_requires_auth(reports_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = reports_env.get("/api/v1/backoffice/reports", headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_reports_requires_superadmin(reports_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = reports_env.get("/api/v1/backoffice/reports", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_reports_lists_queue(reports_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = reports_env.get("/api/v1/backoffice/reports", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["tenant"] == "m3a-l3achrane"
    assert len(body["items"]) == 1
    assert body["items"][0]["status"] == "open"


def test_reports_forwards_status_filter(reports_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")

    def handler(request):
        assert request.url.params.get("status") == "resolved"
        return httpx.Response(200, json={"items": []})

    reports_env.app.state.trust_safety = _mock_client(handler)
    resp = reports_env.get("/api/v1/backoffice/reports", params={"status": "resolved"},
                           headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200


def test_reports_degrades_when_service_down(reports_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    reports_env.app.state.trust_safety = _mock_client(broken)
    resp = reports_env.get("/api/v1/backoffice/reports", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["items"] == []
