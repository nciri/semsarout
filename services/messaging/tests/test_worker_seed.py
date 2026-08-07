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


def test_lease_created_notifies_tenant(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    _handle("coloc.lease_created",
           {"lease_id": "l1", "listing_id": "prop1", "owner_id": 5, "tenant_user_id": 10}, "cl:1")
    notif = db_session.query(models.Notification).filter_by(user_id=10).first()
    assert notif is not None
    assert notif.type == "lease.to_sign"
    assert notif.link == "/bail/l1"
    assert notif.payload["lease_id"] == "l1"
    # Owner does not get a "to sign" notification (only the tenant does).
    assert db_session.query(models.Notification).filter_by(user_id=5).count() == 0


def test_payment_escrowed_notifies_owner(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    _handle("coloc.payment_status_changed",
           {"lease_id": "l1", "payment_id": "p1", "previous_status": "pending",
            "new_status": "escrowed", "owner_id": 5, "tenant_user_id": 10,
            "payment_type": "deposit", "amount": 2200.0}, "cp:1")
    notif = db_session.query(models.Notification).filter_by(user_id=5).first()
    assert notif is not None
    assert notif.type == "payment.received"
    assert db_session.query(models.Notification).filter_by(user_id=10).count() == 0


def test_payment_refunded_notifies_tenant(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    _handle("coloc.payment_status_changed",
           {"lease_id": "l1", "payment_id": "p1", "previous_status": "escrowed",
            "new_status": "refunded", "owner_id": 5, "tenant_user_id": 10,
            "payment_type": "deposit", "amount": 2200.0}, "cp:2")
    notif = db_session.query(models.Notification).filter_by(user_id=10).first()
    assert notif is not None
    assert notif.type == "payment.received"
    assert db_session.query(models.Notification).filter_by(user_id=5).count() == 0


def test_lease_notification_idempotent(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    p = {"lease_id": "l1", "listing_id": "prop1", "owner_id": 5, "tenant_user_id": 10}
    _handle("coloc.lease_created", p, "cl:1")
    _handle("coloc.lease_created", p, "cl:1")
    assert db_session.query(models.Notification).filter_by(user_id=10).count() == 1


def test_candidature_received_notifies_owner(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    _handle("coloc.candidature_received",
           {"candidature_id": "c1", "listing_id": "prop1", "owner_id": 5,
            "candidate_user_id": 10, "listing_title": "Chambre à Maârif"}, "cc:1")
    notif = db_session.query(models.Notification).filter_by(user_id=5).first()
    assert notif is not None
    assert notif.type == "candidature.received"
    assert notif.link == "/espace/candidatures"
    assert notif.payload["candidature_id"] == "c1"
    # Candidate does not get a "received" notification (only the owner does).
    assert db_session.query(models.Notification).filter_by(user_id=10).count() == 0


def test_candidature_accepted_notifies_candidate(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    _handle("coloc.candidature_accepted",
           {"candidature_id": "c1", "listing_id": "prop1", "owner_id": 5,
            "candidate_user_id": 10}, "cc:2")
    notif = db_session.query(models.Notification).filter_by(user_id=10).first()
    assert notif is not None
    assert notif.type == "candidature.accepted"
    assert notif.link == "/espace/candidature"
    assert db_session.query(models.Notification).filter_by(user_id=5).count() == 0


def test_candidature_notifications_idempotent(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    p = {"candidature_id": "c1", "listing_id": "prop1", "owner_id": 5, "candidate_user_id": 10}
    _handle("coloc.candidature_received", p, "cc:1")
    _handle("coloc.candidature_received", p, "cc:1")
    assert db_session.query(models.Notification).filter_by(user_id=5).count() == 1
