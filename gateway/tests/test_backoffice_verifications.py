import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def verif_env(monkeypatch):
    def identity_handler(request):
        if request.url.path == "/internal/kyc/queue":
            assert request.url.params.get("tenant") == "m3a-l3achrane"
            assert request.headers.get("x-internal-token") == "tok"
            return httpx.Response(200, json={"items": [
                {"id": 1, "user_id": 7, "status": "pending", "cin_last4": "3456",
                 "created_at": "2026-08-01T10:00:00+00:00", "full_name": "Youssef Benali",
                 "email": "y@ex.ma"},
            ]})
        if request.url.path == "/internal/kyc/1/verify":
            assert request.headers.get("x-internal-token") == "tok"
            return httpx.Response(200, json={"id": 1, "user_id": 7, "status": "verified"})
        if request.url.path == "/internal/kyc/1/reject":
            assert request.headers.get("x-internal-token") == "tok"
            return httpx.Response(200, json={"id": 1, "user_id": 7, "status": "rejected"})
        return httpx.Response(404, json={"error": "not found"})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.identity = _mock_client(identity_handler)
        yield client


def _fake_ident(superadmin=True, tenant="m3a-l3achrane"):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": 1, "tenant": tenant, "is_superadmin": superadmin}
    return fake


def test_verifications_requires_auth(verif_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = verif_env.get("/api/v1/backoffice/verifications", headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_verifications_requires_superadmin(verif_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = verif_env.get("/api/v1/backoffice/verifications", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_verifications_lists_queue(verif_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = verif_env.get("/api/v1/backoffice/verifications", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["tenant"] == "m3a-l3achrane"
    assert len(body["items"]) == 1
    assert body["items"][0]["email"] == "y@ex.ma"


def test_verifications_verify_action(verif_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = verif_env.post("/api/v1/backoffice/verifications/1/verify",
                          headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "verified"


def test_verifications_reject_action(verif_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = verif_env.post("/api/v1/backoffice/verifications/1/reject",
                          headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


def test_verifications_action_requires_superadmin(verif_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = verif_env.post("/api/v1/backoffice/verifications/1/verify",
                          headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403
