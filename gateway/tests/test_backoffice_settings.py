import json

import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


def _fake_ident(superadmin=True, tenant="m3a-l3achrane"):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": 1, "tenant": tenant, "is_superadmin": superadmin}
    return fake


@pytest.fixture
def weights_env(monkeypatch):
    def matching_handler(request):
        assert request.headers.get("x-internal-token") == "tok"
        assert request.url.path == "/internal/weights"
        if request.method == "GET":
            return httpx.Response(200, json={"version": "v1", "budget": 0.4, "lifestyle": 0.6})
        payload = json.loads(request.content)
        return httpx.Response(200, json={"version": "v2", **payload})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.matching = _mock_client(matching_handler)
        yield client


def test_matching_weights_get_requires_auth(weights_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    resp = weights_env.get("/api/v1/backoffice/matching-weights",
                           headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 403


def test_matching_weights_get_requires_superadmin(weights_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = weights_env.get("/api/v1/backoffice/matching-weights",
                           headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_matching_weights_get_forwards(weights_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = weights_env.get("/api/v1/backoffice/matching-weights",
                           headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert resp.json() == {"version": "v1", "budget": 0.4, "lifestyle": 0.6}


def test_matching_weights_put_requires_superadmin(weights_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = weights_env.put("/api/v1/backoffice/matching-weights",
                           headers={"Authorization": "Bearer x"},
                           json={"budget": 0.3, "lifestyle": 0.7})
    assert resp.status_code == 403


def test_matching_weights_put_forwards_body(weights_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = weights_env.put("/api/v1/backoffice/matching-weights",
                           headers={"Authorization": "Bearer x"},
                           json={"budget": 0.3, "lifestyle": 0.7})
    assert resp.status_code == 200
    body = resp.json()
    assert body["budget"] == 0.3
    assert body["lifestyle"] == 0.7


def test_matching_weights_degrades_when_service_down(weights_env, monkeypatch):
    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    weights_env.app.state.matching = _mock_client(broken)
    resp = weights_env.get("/api/v1/backoffice/matching-weights",
                           headers={"Authorization": "Bearer x"})
    assert resp.status_code == 502


@pytest.fixture
def referential_env(monkeypatch):
    def profile_handler(request):
        assert request.url.path == "/internal/lifestyle-referential"
        assert request.headers.get("x-internal-token") == "tok"
        return httpx.Response(200, json={
            "questions": {"coucher": ["avant22", "22h-minuit", "apres-minuit"]},
            "importance_levels": ["DECISIF", "INDIFFERENT", "PREFERENCE"],
        })

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.coloc_profile = _mock_client(profile_handler)
        yield client


def test_lifestyle_referential_requires_superadmin(referential_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident(superadmin=False))
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = referential_env.get("/api/v1/backoffice/lifestyle-referential",
                               headers={"Authorization": "Bearer x"})
    assert resp.status_code == 403


def test_lifestyle_referential_forwards(referential_env, monkeypatch):
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = referential_env.get("/api/v1/backoffice/lifestyle-referential",
                               headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["questions"]["coucher"] == ["avant22", "22h-minuit", "apres-minuit"]
