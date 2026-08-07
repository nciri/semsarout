import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def listings_env(monkeypatch):
    def coloc_listing_handler(request):
        if request.url.path == "/internal/listings/queue":
            assert request.url.params.get("tenant") == "m3a-l3achrane"
            assert request.headers.get("x-internal-token") == "tok"
            return httpx.Response(200, json={"items": [
                {"id": "l1", "title": "Chambre Maârif", "city": "Casablanca", "rent": 2400.0,
                 "currency": "MAD", "status": "EN_MODERATION", "owner_id": 7,
                 "created_at": "2026-08-01T10:00:00+00:00"},
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


def test_listings_requires_auth(listings_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = listings_env.get("/api/v1/backoffice/listings", headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_listings_requires_superadmin(listings_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = listings_env.get("/api/v1/backoffice/listings", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_listings_lists_queue(listings_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = listings_env.get("/api/v1/backoffice/listings", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["tenant"] == "m3a-l3achrane"
    assert len(body["items"]) == 1
    assert body["items"][0]["status"] == "EN_MODERATION"


def test_listings_forwards_status_filter(listings_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")

    def handler(request):
        assert request.url.params.get("status") == "REJETEE"
        return httpx.Response(200, json={"items": []})

    listings_env.app.state.coloc_listing = _mock_client(handler)
    resp = listings_env.get("/api/v1/backoffice/listings", params={"status": "REJETEE"},
                            headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200


def test_listings_degrades_when_service_down(listings_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    listings_env.app.state.coloc_listing = _mock_client(broken)
    resp = listings_env.get("/api/v1/backoffice/listings", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["items"] == []
