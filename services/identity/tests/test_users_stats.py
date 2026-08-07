from werkzeug.security import generate_password_hash

import app.main as m
from app.models import UserRO


def _user(email: str, tenant: str) -> UserRO:
    return UserRO(email=email, password_hash=generate_password_hash("x"),
                  first_name="A", last_name="B", tenant=tenant)


def test_stats_forbidden_without_token(client):
    resp = client.get("/internal/users/stats")
    assert resp.status_code == 403


def test_stats_all_tenants_by_default(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db_session.add(_user("a@ex.ma", "semsar"))
    db_session.add(_user("b@ex.ma", "m3a-l3achrane"))
    db_session.commit()
    resp = client.get("/internal/users/stats", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["total_users"] == 2


def test_stats_scoped_by_tenant(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db_session.add(_user("a@ex.ma", "semsar"))
    db_session.add(_user("b@ex.ma", "m3a-l3achrane"))
    db_session.add(_user("c@ex.ma", "m3a-l3achrane"))
    db_session.commit()
    resp = client.get("/internal/users/stats",
                      params={"tenant": "m3a-l3achrane"}, headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["total_users"] == 2
