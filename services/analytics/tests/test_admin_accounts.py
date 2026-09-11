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


def test_admin_accounts_expose_et_filtre_le_statut_de_facturation(monkeypatch):
    import app.sources as sources
    monkeypatch.setattr(sources, "users_list", lambda tenant=None: [])
    monkeypatch.setattr(sources, "property_counts", lambda: {})
    monkeypatch.setattr(sources, "agencies_list", lambda: [
        {"id": 1, "name": "Agence A", "email": "a@example.test", "status": "active"},
        {"id": 2, "name": "Agence B", "email": "b@example.test", "status": "active"}])
    monkeypatch.setattr(sources, "subscriptions_map", lambda: {
        "1": {"status": "restricted", "plan": {"slug": "pro"}},
        "2": {"status": "active", "plan": {"slug": "pro"}}})

    with TestClient(app) as client:
        resp = client.get("/admin/accounts", params={"type": "agency", "billing_status": "restricted"},
                          headers=_superadmin_headers())
    items = resp.json()["items"]
    assert [i["name"] for i in items] == ["Agence A"]
    assert items[0]["billing_status"] == "restricted"


def test_admin_overview_expose_les_impayes(monkeypatch):
    import app.sources as sources
    monkeypatch.setattr(sources, "users_stats", lambda: {})
    monkeypatch.setattr(sources, "agencies_stats", lambda: {})
    monkeypatch.setattr(sources, "subscriptions_stats",
                        lambda: {"unpaid_subscriptions": {"past_due": 3, "restricted": 1}})
    with TestClient(app) as client:
        body = client.get("/admin/overview", headers=_superadmin_headers()).json()
    assert body["unpaid_subscriptions"] == {"past_due": 3, "restricted": 1}
