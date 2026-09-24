"""Sous-clés `matches_weekly` et `todo` de la vue d'ensemble back-office m3a."""
import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app

WEEKLY = {"weeks": [{"week": "2026-09-14", "count": 0}, {"week": "2026-09-21", "count": 5}]}


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def overview_env(monkeypatch):
    def identity_handler(request):
        if request.url.path == "/internal/kyc/queue":
            return httpx.Response(200, json={"items": [{"id": 1}, {"id": 2}]})
        return httpx.Response(200, json={"total_users": 42, "signups_last_30d": 3,
                                         "suspended_users": 0, "deleted_pending_users": 0})

    def coloc_listing_handler(request):
        if request.url.path == "/internal/leases":
            return httpx.Response(200, json={"items": [
                {"id": "b1", "payments": [{"type": "deposit", "status": "escrowed"},
                                          {"type": "rent", "status": "escrowed"}]},
                {"id": "b2", "payments": [{"type": "deposit", "status": "released"}]},
            ]})
        return httpx.Response(200, json={"total_listings": 10, "published_listings": 6,
                                         "in_moderation_listings": 2, "new_listings_30d": 1})

    def matching_handler(request):
        assert request.url.path == "/internal/scores/weekly"
        return httpx.Response(200, json=WEEKLY)

    def trust_safety_handler(request):
        assert request.url.params.get("status") == "open"
        return httpx.Response(200, json={"items": [{"id": 1}, {"id": 2}, {"id": 3}]})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.identity = _mock_client(identity_handler)
        app.state.coloc_listing = _mock_client(coloc_listing_handler)
        app.state.coloc_profile = _mock_client(lambda r: httpx.Response(200, json={}))
        app.state.matching = _mock_client(matching_handler)
        app.state.trust_safety = _mock_client(trust_safety_handler)
        yield client


def _superadmin(monkeypatch):
    async def fake(app_, auth, cookie=None):
        return {"user_id": 1, "tenant": "m3a-l3achrane", "is_superadmin": True} if auth else None
    monkeypatch.setattr(m, "_resolve_identity", fake)
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")


def _overview(client) -> dict:
    resp = client.get("/api/v1/backoffice/overview", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    return resp.json()


def test_overview_exposes_weekly_matches_series(overview_env, monkeypatch):
    _superadmin(monkeypatch)
    assert _overview(overview_env)["matches_weekly"] == WEEKLY["weeks"]


def test_overview_exposes_todo_counters(overview_env, monkeypatch):
    _superadmin(monkeypatch)
    assert _overview(overview_env)["todo"] == {
        "kyc_pending": 2,
        "listings_in_moderation": 2,
        "deposits_to_release": 1,
        "reports_open": 3,
    }


def test_overview_weekly_is_null_when_matching_is_down(overview_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    _superadmin(monkeypatch)
    overview_env.app.state.matching = _mock_client(broken)
    body = _overview(overview_env)
    assert body["matches_weekly"] is None
    assert body["todo"]["reports_open"] == 3


def test_overview_todo_counter_is_null_when_its_service_is_down(overview_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    _superadmin(monkeypatch)
    overview_env.app.state.trust_safety = _mock_client(broken)
    overview_env.app.state.coloc_listing = _mock_client(broken)
    body = _overview(overview_env)
    assert body["todo"]["reports_open"] is None
    assert body["todo"]["deposits_to_release"] is None
    assert body["todo"]["listings_in_moderation"] is None
    assert body["todo"]["kyc_pending"] == 2
