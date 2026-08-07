from app import models
from tests.conftest import make_client


def _seed_conversation(db_session, tenant="m3a-l3achrane", owner=5, requester=10):
    conv = models.Conversation(tenant=tenant, property_id=1, owner_party=owner,
                               requester_party=requester, context_type="listing",
                               context_ref_id=1, status="open")
    db_session.add(conv)
    db_session.commit()
    return conv.id


def test_create_conversation_dedupes_regardless_of_participant_order(db_session):
    a = make_client(db_session, uid="10")
    r1 = a.post("/messaging/conversations",
               json={"other_user_id": 5, "context_type": "listing", "listing_id": 1})
    assert r1.status_code == 201
    assert r1.json()["created"] is True
    conv_id = r1.json()["conversation"]["id"]

    r2 = a.post("/messaging/conversations",
               json={"other_user_id": 5, "context_type": "listing", "listing_id": 1})
    assert r2.status_code == 201
    assert r2.json()["created"] is False
    assert r2.json()["conversation"]["id"] == conv_id

    # Same pair, opened from the other side (b -> a) : still dedupes to the same thread.
    b = make_client(db_session, uid="5")
    r3 = b.post("/messaging/conversations",
               json={"other_user_id": 10, "context_type": "listing", "listing_id": 1})
    assert r3.status_code == 201
    assert r3.json()["created"] is False
    assert r3.json()["conversation"]["id"] == conv_id


def test_create_conversation_requires_auth(db_session):
    from semsar_auth import Principal, get_principal
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="", roles=[], agency_id=None, is_superadmin=False, features=[], claims={})
    client = TestClient(app)
    resp = client.post("/messaging/conversations",
                       json={"other_user_id": 5, "context_type": "listing", "listing_id": 1})
    assert resp.status_code == 401
    app.dependency_overrides.clear()


def test_create_conversation_rejects_self(db_session):
    a = make_client(db_session, uid="10")
    resp = a.post("/messaging/conversations",
                 json={"other_user_id": 10, "context_type": "listing", "listing_id": 1})
    assert resp.status_code == 400


def test_conversation_scoped_by_tenant(db_session):
    """A conversation created under one tenant is invisible under another (defense in
    depth: tenant is taken from the server-injected header, never from the client)."""
    cid = _seed_conversation(db_session, tenant="semsar")
    m3a_client = make_client(db_session, uid="10")
    resp = m3a_client.get(f"/messaging/conversations/{cid}")
    assert resp.status_code == 403


def test_list_conversations_filters_by_tenant(db_session):
    cid = _seed_conversation(db_session, tenant="m3a-l3achrane", owner=5, requester=10)
    _seed_conversation(db_session, tenant="semsar", owner=5, requester=10)
    client = make_client(db_session, uid="10")
    resp = client.get("/messaging/conversations")
    ids = [c["id"] for c in resp.json()["conversations"]]
    assert ids == [cid]


def test_post_message_creates_notification_for_other_party(db_session):
    cid = _seed_conversation(db_session, owner=5, requester=10)
    sender = make_client(db_session, uid="10")
    resp = sender.post(f"/messaging/conversations/{cid}/messages", json={"body": "Salut !"})
    assert resp.status_code == 201

    recipient = make_client(db_session, uid="5")
    notifs = recipient.get("/messaging/notifications").json()["notifications"]
    assert any(n["type"] == "message.new" and n["payload"]["conversation_id"] == cid for n in notifs)


def test_unread_count_and_mark_read(db_session):
    db_session.add(models.Notification(tenant="m3a-l3achrane", user_id=10, type="lease.to_sign",
                                       payload={"lease_id": "l1"}, link="/bail/l1"))
    db_session.add(models.Notification(tenant="m3a-l3achrane", user_id=10, type="payment.received",
                                       payload={"lease_id": "l1"}, link="/bail/l1"))
    db_session.commit()
    client = make_client(db_session, uid="10")

    resp = client.get("/messaging/notifications/unread-count")
    assert resp.json()["unread_count"] == 2

    listed = client.get("/messaging/notifications").json()["notifications"]
    first_id = listed[0]["id"]
    r = client.post(f"/messaging/notifications/{first_id}/read")
    assert r.status_code == 200
    assert r.json()["read_at"] is not None

    resp = client.get("/messaging/notifications/unread-count")
    assert resp.json()["unread_count"] == 1

    r = client.post("/messaging/notifications/read-all")
    assert r.json()["marked"] == 1
    resp = client.get("/messaging/notifications/unread-count")
    assert resp.json()["unread_count"] == 0


def test_notifications_scoped_to_own_user(db_session):
    db_session.add(models.Notification(tenant="m3a-l3achrane", user_id=99, type="lease.to_sign",
                                       payload={}, link="/bail/l1"))
    db_session.commit()
    client = make_client(db_session, uid="10")
    resp = client.get("/messaging/notifications")
    assert resp.json()["notifications"] == []


def test_mark_notification_read_forbidden_for_other_user(db_session):
    n = models.Notification(tenant="m3a-l3achrane", user_id=99, type="lease.to_sign",
                            payload={}, link="/bail/l1")
    db_session.add(n)
    db_session.commit()
    client = make_client(db_session, uid="10")
    resp = client.post(f"/messaging/notifications/{n.id}/read")
    assert resp.status_code == 403


def test_internal_create_notification_requires_token(db_session):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    client = TestClient(app)
    resp = client.post("/internal/notifications", json={"user_id": 10, "type": "lease.to_sign"})
    assert resp.status_code == 403
    app.dependency_overrides.clear()


def test_internal_create_notification_ok(db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    client = TestClient(app)
    resp = client.post("/internal/notifications",
                       json={"user_id": 10, "type": "lease.to_sign", "tenant": "m3a-l3achrane"},
                       headers={"x-internal-token": "tok"})
    assert resp.status_code == 201
    assert resp.json()["user_id"] == 10
    app.dependency_overrides.clear()
