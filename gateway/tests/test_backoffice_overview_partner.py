import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


def _stats_handler(payload, path="/internal/stats"):
    def handler(request):
        assert request.url.path == path
        assert request.url.params.get("tenant") == "m3a-l3achrane"
        assert request.headers.get("x-internal-token") == "tok"
        return httpx.Response(200, json=payload)
    return handler


@pytest.fixture
def overview_env(monkeypatch):
    identity_handler = _stats_handler({"total_users": 1}, path="/internal/users/stats")
    listing_handler = _stats_handler({"total_listings": 1})
    profile_handler = _stats_handler({"total_profiles": 1})

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


def test_overview_includes_partner_stats(overview_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    overview_env.app.state.partner = _mock_client(
        _stats_handler({"total_partners": 7, "active_partnerships": 4})
    )
    resp = overview_env.get("/api/v1/backoffice/overview",
                            headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["partners"]["total_partners"] == 7
    assert body["partners"]["active_partnerships"] == 4


def test_overview_degrades_when_partner_absent(overview_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    overview_env.app.state.partner = None
    resp = overview_env.get("/api/v1/backoffice/overview",
                            headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["partners"] is None
    assert body["users"]["total_users"] == 1
