import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def overview_env(monkeypatch):
    def identity_handler(request):
        assert request.url.path == "/internal/users/stats"
        assert request.url.params.get("tenant") == "m3a-l3achrane"
        assert request.headers.get("x-internal-token") == "tok"
        return httpx.Response(200, json={"total_users": 42, "signups_last_30d": 3,
                                         "suspended_users": 0, "deleted_pending_users": 0})

    def listing_handler(request):
        return httpx.Response(200, json={"total_listings": 10, "published_listings": 6,
                                         "in_moderation_listings": 2, "new_listings_30d": 1})

    def profile_handler(request):
        return httpx.Response(200, json={"total_profiles": 20, "verified_profiles": 5,
                                         "profiles_with_lifestyle": 8})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.identity = _mock_client(identity_handler)
        app.state.coloc_listing = _mock_client(listing_handler)
        app.state.coloc_profile = _mock_client(profile_handler)
        yield client


def _fake_ident(superadmin=True, tenant="m3a-l3achrane"):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": 1, "tenant": tenant, "is_superadmin": superadmin}
    return fake


def test_overview_requires_auth(overview_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = overview_env.get("/api/v1/backoffice/overview",
                            headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403  # pas d'Authorization → ident=None


def test_overview_requires_superadmin(overview_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = overview_env.get("/api/v1/backoffice/overview",
                            headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_overview_aggregates(overview_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = overview_env.get("/api/v1/backoffice/overview",
                            headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["users"]["total_users"] == 42
    assert body["listings"]["total_listings"] == 10
    assert body["profiles"]["total_profiles"] == 20


def test_overview_degrades_when_service_down(overview_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    overview_env.app.state.coloc_listing = _mock_client(broken)
    resp = overview_env.get("/api/v1/backoffice/overview",
                            headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["listings"] is None
    assert body["users"]["total_users"] == 42
