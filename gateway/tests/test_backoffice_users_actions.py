import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def users_env(monkeypatch):
    def identity_handler(request):
        if request.url.path == "/internal/accounts/users/9/suspend":
            assert request.url.params.get("tenant") == "m3a-l3achrane"
            assert request.url.params.get("actor_id") == "1"
            assert request.headers.get("x-internal-token") == "tok"
            return httpx.Response(200, json={"message": "Compte suspendu",
                                              "user": {"id": 9, "is_suspended": True}})
        if request.url.path == "/internal/accounts/users/9/unsuspend":
            return httpx.Response(200, json={"message": "Compte réactivé",
                                              "user": {"id": 9, "is_suspended": False}})
        if request.url.path == "/internal/accounts/users/404/suspend":
            return httpx.Response(404, json={"error": "User not found"})
        return httpx.Response(404, json={"error": "not found"})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.identity = _mock_client(identity_handler)
        yield client


def _fake_ident(superadmin=True, tenant="m3a-l3achrane", user_id=1):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": user_id, "tenant": tenant, "is_superadmin": superadmin}
    return fake


def test_suspend_requires_auth(users_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = users_env.post("/api/v1/backoffice/users/9/suspend", headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_suspend_requires_superadmin(users_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = users_env.post("/api/v1/backoffice/users/9/suspend", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_suspend_forwards_to_identity(users_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = users_env.post("/api/v1/backoffice/users/9/suspend", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["user"]["is_suspended"] is True


def test_unsuspend_forwards_to_identity(users_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = users_env.post("/api/v1/backoffice/users/9/unsuspend", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["user"]["is_suspended"] is False


def test_suspend_propagates_not_found(users_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = users_env.post("/api/v1/backoffice/users/404/suspend", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 404


def test_suspend_degrades_when_identity_down(users_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    users_env.app.state.identity = _mock_client(broken)
    resp = users_env.post("/api/v1/backoffice/users/9/suspend", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 502
