import httpx
from fastapi.testclient import TestClient

from app.main import app


def _mock_identity(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


def _superadmin_headers():
    return {"x-semsar-user-id": "1", "x-semsar-superadmin": "1"}


def test_admin_accounts_requires_superadmin():
    with TestClient(app) as client:
        resp = client.get("/admin/accounts", headers={"x-semsar-user-id": "1"})
        assert resp.status_code == 403


def test_admin_accounts_forwards_tenant(monkeypatch):
    import app.sources as sources

    seen = {}

    def fake_users_list(tenant=None):
        seen["tenant"] = tenant
        return [{"id": 9, "name": "Sara Candidat", "email": "candidat@m3a.ma",
                 "status": "active", "last_login": None, "tenant": "m3a-l3achrane",
                 "account_role": "buyer", "user_type": "particular", "is_verified": True,
                 "created_at": "2026-08-01T09:00:00+00:00"}]

    monkeypatch.setattr(sources, "users_list", fake_users_list)
    monkeypatch.setattr(sources, "property_counts", lambda: {})
    monkeypatch.setattr(sources, "agencies_list", lambda: [])
    monkeypatch.setattr(sources, "subscriptions_map", lambda: {})

    with TestClient(app) as client:
        resp = client.get("/admin/accounts", params={"type": "user", "tenant": "m3a-l3achrane"},
                          headers=_superadmin_headers())
    assert resp.status_code == 200
    assert seen["tenant"] == "m3a-l3achrane"
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["account_role"] == "buyer"
    assert items[0]["is_verified"] is True


def test_admin_accounts_no_tenant_backward_compatible(monkeypatch):
    import app.sources as sources

    seen = {}

    def fake_users_list(tenant=None):
        seen["tenant"] = tenant
        return []

    monkeypatch.setattr(sources, "users_list", fake_users_list)
    monkeypatch.setattr(sources, "property_counts", lambda: {})
    monkeypatch.setattr(sources, "agencies_list", lambda: [])
    monkeypatch.setattr(sources, "subscriptions_map", lambda: {})

    with TestClient(app) as client:
        resp = client.get("/admin/accounts", headers=_superadmin_headers())
    assert resp.status_code == 200
    assert seen["tenant"] is None
