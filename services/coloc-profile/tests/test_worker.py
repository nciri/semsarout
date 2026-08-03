from app.models import Profile
from app.worker import _handle_with_session


def _payload(uid=7, tenant="m3a-l3achrane", **extra):
    return {"id": uid, "tenant": tenant, "first_name": "Sara", "is_verified": False, **extra}


def test_user_created_m3a_creates_profile(db_session):
    _handle_with_session(db_session, "user.created", _payload(), "m1")
    p = db_session.query(Profile).filter_by(user_id=7).one()
    assert p.display_name == "Sara" and p.is_verified is False


def test_user_created_semsar_ignored(db_session):
    _handle_with_session(db_session, "user.created", _payload(tenant="semsar"), "m2")
    assert db_session.query(Profile).count() == 0


def test_user_updated_syncs_verification(db_session):
    _handle_with_session(db_session, "user.created", _payload(), "m3")
    _handle_with_session(db_session, "user.updated",
                         _payload(is_verified=True, first_name="Sara B."), "m4")
    p = db_session.query(Profile).filter_by(user_id=7).one()
    assert p.is_verified is True and p.display_name == "Sara B."


def test_idempotent_by_message_id(db_session):
    _handle_with_session(db_session, "user.created", _payload(), "same")
    _handle_with_session(db_session, "user.created", _payload(), "same")
    assert db_session.query(Profile).count() == 1
