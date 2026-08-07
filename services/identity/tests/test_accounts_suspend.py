from werkzeug.security import generate_password_hash

import app.main as m
from app.models import UserRO


def _user(email: str, tenant: str, **kw) -> UserRO:
    return UserRO(email=email, password_hash=generate_password_hash("x"),
                  first_name="A", last_name="B", tenant=tenant, **kw)


def test_suspend_forbidden_without_token(client, db_session):
    u = _user("a@ex.ma", "m3a-l3achrane")
    db_session.add(u)
    db_session.commit()
    resp = client.post(f"/internal/accounts/users/{u.id}/suspend")
    assert resp.status_code == 403


def test_suspend_and_unsuspend(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    u = _user("a@ex.ma", "m3a-l3achrane")
    db_session.add(u)
    db_session.commit()
    resp = client.post(f"/internal/accounts/users/{u.id}/suspend",
                       params={"tenant": "m3a-l3achrane", "actor_id": 999, "reason": "spam"},
                       headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["user"]["is_suspended"] is True

    resp = client.post(f"/internal/accounts/users/{u.id}/unsuspend",
                       params={"tenant": "m3a-l3achrane", "actor_id": 999},
                       headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["user"]["is_suspended"] is False


def test_suspend_scoped_to_tenant(client, db_session, monkeypatch):
    """Un utilisateur d'un autre tenant ne doit pas être visible/modérable via `tenant=`."""
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    u = _user("a@ex.ma", "semsar")
    db_session.add(u)
    db_session.commit()
    resp = client.post(f"/internal/accounts/users/{u.id}/suspend",
                       params={"tenant": "m3a-l3achrane"}, headers={"x-internal-token": "tok"})
    assert resp.status_code == 404


def test_suspend_self_action_blocked(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    u = _user("a@ex.ma", "m3a-l3achrane")
    db_session.add(u)
    db_session.commit()
    resp = client.post(f"/internal/accounts/users/{u.id}/suspend",
                       params={"actor_id": u.id}, headers={"x-internal-token": "tok"})
    assert resp.status_code == 409
