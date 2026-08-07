"""LOT B — garde tenant serveur sur les comptes back-office m3a (`GET /api/v1/backoffice/
accounts`). Avant ce durcissement, le front appelait directement `GET /api/v1/admin/accounts
?tenant=m3a-l3achrane` (proxy générique) : `tenant` était un simple paramètre de requête que
le CLIENT contrôlait — rien n'empêchait de l'omettre ou de le falsifier pour voir les comptes
d'un autre tenant. La route composite `backoffice_accounts` force désormais le tenant résolu
côté serveur (Host / jeton vérifié), quel que soit ce que le client envoie en query string."""
import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def accounts_env(monkeypatch):
    def analytics_handler(request):
        if request.url.path == "/admin/accounts":
            # Le tenant reçu par analytics doit TOUJOURS être celui résolu côté serveur,
            # jamais une valeur alternative fournie par le client.
            assert request.url.params.get("tenant") == "m3a-l3achrane"
            assert request.url.params.get("type") == "user"
            return httpx.Response(200, json={
                "items": [{"kind": "user", "id": 101, "name": "Sara Candidat",
                          "email": "candidat@m3a.ma", "status": "active"}],
                "total": 1, "page": 1, "pages": 1,
            })
        return httpx.Response(404, json={"error": "not found"})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.analytics = _mock_client(analytics_handler)
        yield client


def _fake_ident(superadmin=True, tenant="m3a-l3achrane", user_id=1):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": user_id, "tenant": tenant, "is_superadmin": superadmin}
    return fake


def test_accounts_requires_auth(accounts_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = accounts_env.get("/api/v1/backoffice/accounts", headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_accounts_requires_superadmin(accounts_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = accounts_env.get("/api/v1/backoffice/accounts", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_accounts_happy_path(accounts_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = accounts_env.get("/api/v1/backoffice/accounts", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == 101


def test_accounts_ignores_client_supplied_tenant(accounts_env, monkeypatch):
    """Un client qui tente de forcer un autre tenant via la query string est ignoré : le
    serveur envoie TOUJOURS le tenant résolu depuis Host/jeton à analytics (assertion dans
    `analytics_handler` ci-dessus — la requête échouerait si le client réussissait à
    imposer `tenant=semsar`)."""
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = accounts_env.get(
        "/api/v1/backoffice/accounts?tenant=semsar",
        headers={"Authorization": "Bearer x"},
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


def test_accounts_tenant_mismatch_rejected(accounts_env, monkeypatch):
    """Un jeton émis pour un autre tenant (ex. semsarout) ne peut pas accéder aux comptes m3a,
    même en frappant directement l'URL m3a — cohérent avec le reste des routes composites."""
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(tenant="semsar"))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = accounts_env.get("/api/v1/backoffice/accounts", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_accounts_degrades_when_analytics_down(accounts_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    accounts_env.app.state.analytics = _mock_client(broken)
    resp = accounts_env.get("/api/v1/backoffice/accounts", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["items"] == []
