from app import models
from app.worker import _handle


def test_application_received_opens_conversation(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    _handle("rental.application.received",
            {"id": 55, "applicant_user_id": 10, "owner_id": 5, "property_id": 1}, "ta:55")
    conv = db_session.query(models.Conversation).filter_by(context_ref_id=55).first()
    assert conv is not None
    assert conv.owner_party == 5 and conv.requester_party == 10
    assert conv.context_type == "rental_application"


def test_seed_idempotent(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    p = {"id": 55, "applicant_user_id": 10, "owner_id": 5, "property_id": 1}
    _handle("rental.application.received", p, "ta:55")
    _handle("rental.application.received", p, "ta:55")
    assert db_session.query(models.Conversation).filter_by(context_ref_id=55).count() == 1
