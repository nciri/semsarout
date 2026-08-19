import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def partner_env(monkeypatch):
    received = {}

    def partner_handler(request):
        received["path"] = request.url.path
        return httpx.Response(200, json={"items": []})

    monkeypatch.setattr(m.settings, "partner_url", "http://mock")
    with TestClient(app) as client:
        app.state.partner = _mock_client(partner_handler)
        yield client, received


def _fake_ident(tenant="m3a-l3achrane"):
    async def fake(app_, auth, cookie=None):
        if not auth:
            return None
        return {"user_id": 1, "tenant": tenant, "is_superadmin": False}
    return fake


def test_partner_route_reaches_partner_service(partner_env, monkeypatch):
    client, received = partner_env
    monkeypatch.setattr(m, "_resolve_identity", _fake_ident())
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = client.get("/api/v1/partner/affilies", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    assert received["path"] == "/partner/affilies"
