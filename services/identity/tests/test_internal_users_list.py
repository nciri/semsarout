from werkzeug.security import generate_password_hash

import app.main as m
from app.models import UserRO


def _user(email: str, tenant: str, **kw) -> UserRO:
    return UserRO(email=email, password_hash=generate_password_hash("x"),
                  first_name="A", last_name="B", tenant=tenant, **kw)


def test_forbidden_without_token(client):
    resp = client.get("/internal/users")
    assert resp.status_code == 403


def test_all_tenants_by_default(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db_session.add(_user("a@ex.ma", "semsar"))
    db_session.add(_user("b@ex.ma", "m3a-l3achrane"))
    db_session.commit()
    resp = client.get("/internal/users", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert len(resp.json()["users"]) == 2


def test_scoped_by_tenant(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db_session.add(_user("a@ex.ma", "semsar"))
    db_session.add(_user("b@ex.ma", "m3a-l3achrane", account_role="buyer", user_type="particular"))
    db_session.commit()
    resp = client.get("/internal/users", params={"tenant": "m3a-l3achrane"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    users = resp.json()["users"]
    assert len(users) == 1
    assert users[0]["email"] == "b@ex.ma"
    assert users[0]["account_role"] == "buyer"
    assert users[0]["tenant"] == "m3a-l3achrane"
