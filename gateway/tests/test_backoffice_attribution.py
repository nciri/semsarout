import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app

ATTRIBUTION = {"properties": [{
    "id": "p1", "name": "Chambre Maârif", "place": "Maârif, Casablanca",
    "rooms": [{"id": "l1", "name": "Chambre Maârif", "meta": "18 m² · CHAMBRE_INDIVIDUELLE",
               "rent": 2400.0, "currency": "MAD"}],
    "candidatures": [{"id": "c1", "listing_id": "l1", "candidate_user_id": 42,
                      "status": "received", "message": "Bonjour",
                      "created_at": "2026-08-01T10:00:00+00:00"}],
}]}


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def attribution_env(monkeypatch):
    def coloc_listing_handler(request):
        assert request.url.path == "/internal/attribution"
        assert request.url.params.get("tenant") == "m3a-l3achrane"
        assert request.headers.get("x-internal-token") == "tok"
        return httpx.Response(200, json=ATTRIBUTION)

    def identity_handler(request):
        return httpx.Response(200, json={"user": {"full_name": "Salma B."}})

    def matching_handler(request):
        return httpx.Response(200, json={"scores": {"l1": 87}})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.coloc_listing = _mock_client(coloc_listing_handler)
        app.state.identity = _mock_client(identity_handler)
        app.state.matching = _mock_client(matching_handler)
        yield client


def _fake_ident(superadmin=True, tenant="m3a-l3achrane"):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": 1, "tenant": tenant, "is_superadmin": superadmin}
    return fake


def test_attribution_requires_auth(attribution_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = attribution_env.get("/api/v1/backoffice/attribution",
                               headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_attribution_requires_superadmin(attribution_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = attribution_env.get("/api/v1/backoffice/attribution",
                               headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_attribution_rejects_tenant_mismatch(attribution_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(tenant="semsar"))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = attribution_env.get("/api/v1/backoffice/attribution",
                               headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_attribution_enriches_candidatures_with_name_and_score(attribution_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    body = attribution_env.get("/api/v1/backoffice/attribution",
                               headers={"Authorization": "Bearer x"}).json()
    assert body["tenant"] == "m3a-l3achrane"
    prop = body["properties"][0]
    assert prop["rooms"][0]["id"] == "l1"
    candidature = prop["candidatures"][0]
    assert candidature["candidate_name"] == "Salma B."
    assert candidature["match_pct"] == 87


def test_attribution_keeps_list_when_enrichment_services_down(attribution_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    attribution_env.app.state.identity = _mock_client(broken)
    attribution_env.app.state.matching = _mock_client(broken)
    body = attribution_env.get("/api/v1/backoffice/attribution",
                               headers={"Authorization": "Bearer x"}).json()
    candidature = body["properties"][0]["candidatures"][0]
    assert "candidate_name" not in candidature and "match_pct" not in candidature


def test_attribution_degrades_when_coloc_listing_down(attribution_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    attribution_env.app.state.coloc_listing = _mock_client(broken)
    resp = attribution_env.get("/api/v1/backoffice/attribution",
                               headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["properties"] == []
