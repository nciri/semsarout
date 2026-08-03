import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import _merge_match_scores, app


def test_merge_match_scores_pure():
    items = [{"listing_id": "a"}, {"listing_id": "b"}, {"listing_id": "c"}]
    _merge_match_scores(items, {"a": 87, "b": None})
    assert items[0]["match_pct"] == 87
    assert "match_pct" not in items[1]  # null → clé absente (le front masque)
    assert "match_pct" not in items[2]


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def composite_env(monkeypatch):
    def search_handler(request):
        return httpx.Response(200, json={"total": 1, "items": [{"listing_id": "l1"}]})

    def matching_handler(request):
        assert request.headers.get("x-internal-token") == "tok"
        return httpx.Response(200, json={"scores": {"l1": 91}})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.search = _mock_client(search_handler)
        app.state.matching = _mock_client(matching_handler)
        yield client


def test_composite_anonymous_no_scores(composite_env):
    resp = composite_env.get("/api/v1/listings", headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 200
    assert "match_pct" not in resp.json()["items"][0]


def test_composite_authenticated_enriches(composite_env, monkeypatch):
    async def fake_ident(app_, auth):
        return {"user_id": 7, "tenant": "m3a-l3achrane"} if auth else None

    monkeypatch.setattr(m, "_resolve_identity", fake_ident)
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = composite_env.get("/api/v1/listings", headers={"Authorization": "Bearer x"})
    assert resp.json()["items"][0]["match_pct"] == 91


def test_composite_degrades_when_matching_down(composite_env, monkeypatch):
    async def fake_ident(app_, auth):
        return {"user_id": 7, "tenant": "m3a-l3achrane"}

    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", fake_ident)
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    composite_env.app.state.matching = _mock_client(broken)
    resp = composite_env.get("/api/v1/listings", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200  # la recherche ne tombe JAMAIS à cause du score
    assert "match_pct" not in resp.json()["items"][0]
