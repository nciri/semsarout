"""LOT A — CRUD des rôles côté BFF : `/api/v1/backoffice/roles*` (POST/PUT/DELETE) est déjà
routé vers identity via le proxy générique (`_resolve_upstream`, préfixe `backoffice/roles`
sans filtre de méthode) — la garde superadmin/gestion des rôles vit côté identity
(`_require_manage_roles`, cf. `services/identity/app/rbac.py`). Ces tests couvrent la
frontière BFF : identité relayée (headers x-semsar-*), réponses identity propagées telles
quelles (happy path + 403 refusé)."""
import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


def _guard(request: httpx.Request) -> httpx.Response | None:
    """Reproduit la garde identity (`get_principal` + `_require_manage_roles`) : pas
    d'identité injectée (jeton absent côté BFF) → 401 ; identité injectée mais pas
    superadmin → 403."""
    if not request.headers.get("x-semsar-user-id"):
        return httpx.Response(401, json={"error": "Identité de passerelle absente."})
    if request.headers.get("x-semsar-superadmin") != "1":
        return httpx.Response(403, json={"error": "Vous n'avez pas le droit de gérer les rôles."})
    return None


@pytest.fixture
def roles_env(monkeypatch):
    def identity_handler(request):
        if request.url.path == "/backoffice/roles" and request.method == "POST":
            return _guard(request) or httpx.Response(
                201, json={"id": 9, "name": "Modérateur", "slug": "moderateur"})
        if request.url.path == "/backoffice/roles/5" and request.method == "PUT":
            return _guard(request) or httpx.Response(
                200, json={"id": 5, "name": "Modérateur (maj)", "slug": "moderateur"})
        if request.url.path == "/backoffice/roles/5" and request.method == "DELETE":
            return _guard(request) or httpx.Response(200, json={"message": "Role deleted"})
        return httpx.Response(404, json={"error": "not found"})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    monkeypatch.setattr(m.settings, "identity_url", "http://identity")
    with TestClient(app) as client:
        app.state.identity = _mock_client(identity_handler)
        yield client


def _fake_ident(superadmin=True, tenant="m3a-l3achrane", user_id=1):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": user_id, "tenant": tenant, "is_superadmin": superadmin}
    return fake


def test_create_role_requires_auth(roles_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = roles_env.post("/api/v1/backoffice/roles", json={"name": "Modérateur"})
    assert resp.status_code == 401


def test_create_role_denied_when_not_superadmin(roles_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = roles_env.post(
        "/api/v1/backoffice/roles", json={"name": "Modérateur"},
        headers={"Authorization": "Bearer x"},
    )
    assert resp.status_code == 403


def test_create_role_happy_path(roles_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = roles_env.post(
        "/api/v1/backoffice/roles", json={"name": "Modérateur"},
        headers={"Authorization": "Bearer x"},
    )
    assert resp.status_code == 201
    assert resp.json()["id"] == 9


def test_update_role_happy_path(roles_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = roles_env.put(
        "/api/v1/backoffice/roles/5", json={"name": "Modérateur (maj)"},
        headers={"Authorization": "Bearer x"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Modérateur (maj)"


def test_delete_role_happy_path(roles_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = roles_env.delete("/api/v1/backoffice/roles/5", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["message"] == "Role deleted"


def test_delete_role_denied_when_not_superadmin(roles_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = roles_env.delete("/api/v1/backoffice/roles/5", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403
