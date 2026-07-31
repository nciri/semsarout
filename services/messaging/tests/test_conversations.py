from app import models
from tests.conftest import make_client


def _seed(db_session):
    conv = models.Conversation(property_id=1, owner_party=5, requester_party=10,
                               context_type="rental_application", context_ref_id=1, status="open")
    db_session.add(conv)
    db_session.commit()
    return conv.id


def test_participant_can_post_and_list(db_session):
    cid = _seed(db_session)
    buyer = make_client(db_session, uid="10")
    r = buyer.post(f"/messaging/conversations/{cid}/messages", json={"body": "Bonjour"})
    assert r.status_code == 201
    r2 = buyer.get("/messaging/conversations")
    assert any(c["id"] == cid for c in r2.json()["conversations"])
    app_overrides_cleanup()


def test_non_participant_forbidden(db_session):
    cid = _seed(db_session)
    intruder = make_client(db_session, uid="99")
    r = intruder.get(f"/messaging/conversations/{cid}")
    assert r.status_code == 403
    app_overrides_cleanup()


def test_unauthenticated_rejected_legacy_conversation(db_session):
    """Regression test: unauthenticated access to legacy conversation (owner_party=None) must return 401."""
    from semsar_auth import Principal, get_principal
    from fastapi.testclient import TestClient

    # Seed a legacy conversation with owner_party=None
    legacy_conv = models.Conversation(
        property_id=1, owner_party=None, requester_party=10,
        context_type="legacy", context_ref_id=1, status="open"
    )
    db_session.add(legacy_conv)
    db_session.commit()
    cid = legacy_conv.id

    # Create an unauthenticated client (empty sub)
    from app.db import get_db
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="", roles=[], agency_id=None, is_superadmin=False, features=[], claims={}
    )
    client = TestClient(app)

    # Assert GET returns 401
    r_get = client.get(f"/messaging/conversations/{cid}")
    assert r_get.status_code == 401, f"Expected 401, got {r_get.status_code}: {r_get.json()}"

    # Assert POST returns 401
    r_post = client.post(f"/messaging/conversations/{cid}/messages", json={"body": "test"})
    assert r_post.status_code == 401, f"Expected 401, got {r_post.status_code}: {r_post.json()}"

    app_overrides_cleanup()


def app_overrides_cleanup():
    from app.main import app
    app.dependency_overrides.clear()
