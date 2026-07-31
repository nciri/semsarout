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


def app_overrides_cleanup():
    from app.main import app
    app.dependency_overrides.clear()
