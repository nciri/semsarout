from datetime import datetime, timedelta

from app.models import Client, Visit


def _client(db, **kw):
    c = Client(**{"agency_id": 1, "client_type": "buyer", "status": "active", **kw})
    db.add(c)
    db.commit()
    return c


def test_completing_a_visit_updates_client_last_contact(client, db_session):
    c = _client(db_session, first_name="Salma", last_name="Benjelloun")
    when = datetime.utcnow() - timedelta(hours=2)
    v = Visit(client_id=c.id, agency_id=1, status="confirmed", scheduled_at=when)
    db_session.add(v)
    db_session.commit()

    assert client.post(f"/backoffice/visits/{v.id}/complete", json={"client_feedback": "neutral"}).status_code == 200

    db_session.refresh(c)
    assert abs((c.last_contact_at - when).total_seconds()) < 1


def test_recording_an_interaction_updates_client_last_contact(client, db_session):
    c = _client(db_session, first_name="Ahmed", last_name="Alaoui")

    client.post(f"/backoffice/clients/{c.id}/interactions", json={"interaction_type": "call"})

    db_session.refresh(c)
    assert c.last_contact_at is not None
