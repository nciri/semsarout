from datetime import datetime, timezone

from werkzeug.security import generate_password_hash

import app.main as m
from app.models import KycVerification, UserRO
from semsar_auth import Principal, get_principal


def _user(db_session, uid=1) -> UserRO:
    u = UserRO(id=uid, email=f"u{uid}@ex.ma", password_hash=generate_password_hash("x"),
               first_name="A", last_name="B", tenant="semsar", is_verified=False)
    db_session.add(u)
    db_session.commit()
    return u


def _as_user(uid: int):
    m.app.dependency_overrides[get_principal] = lambda: Principal(
        sub=str(uid), roles=[], agency_id=None, is_superadmin=False, features=[], claims={})


def test_create_session_calls_didit_and_stores_pending(client, db_session, monkeypatch):
    _user(db_session, 1)
    _as_user(1)
    monkeypatch.setattr(m.didit_client, "create_session",
                        lambda **k: {"session_id": "sess-1", "url": "https://verify.didit.me/x",
                                    "session_token": "tok"})
    resp = client.post("/identity/kyc/session")
    m.app.dependency_overrides.pop(get_principal, None)
    assert resp.status_code == 201
    assert resp.json()["url"] == "https://verify.didit.me/x"
    row = db_session.query(KycVerification).filter_by(user_id=1).first()
    assert row.status == "pending"
    assert row.didit_session_id == "sess-1"


def test_create_session_didit_unavailable_returns_502(client, db_session, monkeypatch):
    _user(db_session, 1)
    _as_user(1)

    def boom(**k):
        raise m.didit_client.DiditUnavailable("down")
    monkeypatch.setattr(m.didit_client, "create_session", boom)
    resp = client.post("/identity/kyc/session")
    m.app.dependency_overrides.pop(get_principal, None)
    assert resp.status_code == 502


def test_webhook_rejects_bad_signature(client, monkeypatch):
    monkeypatch.setattr(m, "_WEBHOOK_SECRET", "shh")
    monkeypatch.setattr(m.didit_client, "verify_signature", lambda body, sig, secret=None: False)
    resp = client.post("/identity/kyc/webhook", json={"session_id": "sess-1"},
                       headers={"x-signature-v2": "bad"})
    assert resp.status_code == 401


def test_webhook_approved_marks_verified_and_emits_event(client, db_session, monkeypatch):
    u = _user(db_session, 2)
    k = KycVerification(user_id=2, cin=None, status="pending", didit_session_id="sess-2",
                        created_at=datetime.now(timezone.utc))
    db_session.add(k)
    db_session.commit()
    monkeypatch.setattr(m, "_WEBHOOK_SECRET", "")
    resp = client.post("/identity/kyc/webhook", json={
        "webhook_type": "status.updated", "session_id": "sess-2",
        "decision": {"status": "Approved"},
    })
    assert resp.status_code == 200
    db_session.refresh(k)
    db_session.refresh(u)
    assert k.status == "verified"
    assert u.is_verified is True


def test_webhook_declined_marks_rejected(client, db_session, monkeypatch):
    _user(db_session, 3)
    k = KycVerification(user_id=3, cin=None, status="pending", didit_session_id="sess-3",
                        created_at=datetime.now(timezone.utc))
    db_session.add(k)
    db_session.commit()
    monkeypatch.setattr(m, "_WEBHOOK_SECRET", "")
    resp = client.post("/identity/kyc/webhook", json={
        "webhook_type": "status.updated", "session_id": "sess-3",
        "decision": {"status": "Declined"},
    })
    assert resp.status_code == 200
    db_session.refresh(k)
    assert k.status == "rejected"


def test_webhook_ignores_already_terminal_session(client, db_session, monkeypatch):
    _user(db_session, 4)
    k = KycVerification(user_id=4, cin=None, status="verified", didit_session_id="sess-4",
                        created_at=datetime.now(timezone.utc))
    db_session.add(k)
    db_session.commit()
    monkeypatch.setattr(m, "_WEBHOOK_SECRET", "")
    resp = client.post("/identity/kyc/webhook", json={
        "webhook_type": "status.updated", "session_id": "sess-4",
        "decision": {"status": "Declined"},
    })
    assert resp.status_code == 200
    db_session.refresh(k)
    assert k.status == "verified"  # anti-rejeu : pas retraité


def test_webhook_unknown_session_returns_404(client, monkeypatch):
    monkeypatch.setattr(m, "_WEBHOOK_SECRET", "")
    resp = client.post("/identity/kyc/webhook", json={
        "webhook_type": "status.updated", "session_id": "ghost",
        "decision": {"status": "Approved"},
    })
    assert resp.status_code == 404


def test_refresh_pulls_decision_and_applies(client, db_session, monkeypatch):
    _user(db_session, 5)
    _as_user(5)
    k = KycVerification(user_id=5, cin=None, status="pending", didit_session_id="sess-5",
                        created_at=datetime.now(timezone.utc))
    db_session.add(k)
    db_session.commit()
    monkeypatch.setattr(m.didit_client, "fetch_decision",
                        lambda session_id: {"status": "Approved"})
    resp = client.post(f"/identity/kyc/{k.id}/refresh")
    m.app.dependency_overrides.pop(get_principal, None)
    assert resp.status_code == 200
    db_session.refresh(k)
    assert k.status == "verified"


def test_refresh_forbidden_for_non_owner(client, db_session, monkeypatch):
    _user(db_session, 6)
    _as_user(7)  # un autre utilisateur
    k = KycVerification(user_id=6, cin=None, status="pending", didit_session_id="sess-6",
                        created_at=datetime.now(timezone.utc))
    db_session.add(k)
    db_session.commit()
    resp = client.post(f"/identity/kyc/{k.id}/refresh")
    m.app.dependency_overrides.pop(get_principal, None)
    assert resp.status_code == 403


def test_internal_status_requires_token(client):
    resp = client.get("/internal/kyc/status/1")
    assert resp.status_code == 403


def test_internal_status_returns_none_when_absent(client, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    resp = client.get("/internal/kyc/status/999", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json() == {"status": "none"}


def test_internal_status_returns_latest(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    _user(db_session, 8)
    db_session.add(KycVerification(user_id=8, cin=None, status="verified",
                                   created_at=datetime.now(timezone.utc)))
    db_session.commit()
    resp = client.get("/internal/kyc/status/8", headers={"x-internal-token": "tok"})
    assert resp.json() == {"status": "verified"}
