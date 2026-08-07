from datetime import datetime, timedelta, timezone

from werkzeug.security import generate_password_hash

import app.main as m
from app.models import KycVerification, UserRO


def _user(db_session, email: str, tenant: str) -> UserRO:
    u = UserRO(email=email, password_hash=generate_password_hash("x"),
               first_name="A", last_name="B", tenant=tenant, is_verified=False)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _kyc(db_session, user_id: int, status: str = "pending", cin: str = "AB123456") -> KycVerification:
    k = KycVerification(user_id=user_id, cin=cin, status=status,
                        created_at=datetime.now(timezone.utc) - timedelta(minutes=5))
    db_session.add(k)
    db_session.commit()
    db_session.refresh(k)
    return k


def test_queue_forbidden_without_token(client):
    resp = client.get("/internal/kyc/queue")
    assert resp.status_code == 403


def test_queue_lists_pending_scoped_by_tenant(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    u1 = _user(db_session, "a@ex.ma", "m3a-l3achrane")
    u2 = _user(db_session, "b@ex.ma", "semsar")
    _kyc(db_session, u1.id)
    _kyc(db_session, u2.id)
    resp = client.get("/internal/kyc/queue", params={"tenant": "m3a-l3achrane"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "a@ex.ma"
    assert items[0]["cin_last4"] == "3456"


def test_queue_excludes_non_pending(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    u1 = _user(db_session, "a@ex.ma", "m3a-l3achrane")
    _kyc(db_session, u1.id, status="verified")
    resp = client.get("/internal/kyc/queue", params={"tenant": "m3a-l3achrane"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["items"] == []


def test_verify_marks_user_verified(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    u1 = _user(db_session, "a@ex.ma", "m3a-l3achrane")
    k = _kyc(db_session, u1.id)
    resp = client.post(f"/internal/kyc/{k.id}/verify", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "verified"
    db_session.refresh(u1)
    assert u1.is_verified is True


def test_reject_sets_status(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    u1 = _user(db_session, "a@ex.ma", "m3a-l3achrane")
    k = _kyc(db_session, u1.id)
    resp = client.post(f"/internal/kyc/{k.id}/reject", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    db_session.refresh(u1)
    assert u1.is_verified is False


def test_verify_requires_token(client, db_session):
    resp = client.post("/internal/kyc/1/verify")
    assert resp.status_code == 403


def test_verify_not_found(client, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    resp = client.post("/internal/kyc/999/verify", headers={"x-internal-token": "tok"})
    assert resp.status_code == 404
