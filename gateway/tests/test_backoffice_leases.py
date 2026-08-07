import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def leases_env(monkeypatch):
    def coloc_listing_handler(request):
        if request.url.path == "/internal/leases":
            assert request.url.params.get("tenant") == "m3a-l3achrane"
            assert request.headers.get("x-internal-token") == "tok"
            return httpx.Response(200, json={"items": [
                {"id": "lease1", "listing_id": "l1", "owner_id": 7, "tenant_user_id": 42,
                 "rent_amount": 2200.0, "deposit_amount": 2200.0, "status": "active",
                 "start_date": "2026-08-01", "end_date": None,
                 "created_at": "2026-08-01T10:00:00+00:00",
                 "payments": [{"id": "p1", "type": "deposit", "amount": 2200.0,
                               "status": "escrowed", "period": None}]},
            ]})
        return httpx.Response(404, json={"error": "not found"})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.coloc_listing = _mock_client(coloc_listing_handler)
        yield client


def _fake_ident(superadmin=True, tenant="m3a-l3achrane"):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": 1, "tenant": tenant, "is_superadmin": superadmin}
    return fake


def test_leases_requires_auth(leases_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = leases_env.get("/api/v1/backoffice/leases", headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_leases_requires_superadmin(leases_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = leases_env.get("/api/v1/backoffice/leases", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_leases_lists_with_payments(leases_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = leases_env.get("/api/v1/backoffice/leases", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["tenant"] == "m3a-l3achrane"
    assert len(body["items"]) == 1
    assert body["items"][0]["payments"][0]["status"] == "escrowed"


def test_leases_degrades_when_service_down(leases_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    leases_env.app.state.coloc_listing = _mock_client(broken)
    resp = leases_env.get("/api/v1/backoffice/leases", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["items"] == []
