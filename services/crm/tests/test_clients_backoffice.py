from datetime import datetime, timedelta

from app.models import Client, ClientInteraction, Lead, PropertyRO, Visit


def _client(db, **kw):
    c = Client(**{"agency_id": 1, "client_type": "buyer", "status": "active", **kw})
    db.add(c)
    db.commit()
    return c


def _by_id(body):
    return {c["id"]: c for c in body["clients"]}


def test_summary_last_exchange_is_latest_of_interaction_and_honoured_visit(client, db_session):
    now = datetime.utcnow()
    c = _client(db_session, first_name="Rachid", last_name="Ziani")
    never = _client(db_session, first_name="Aicha", last_name="Tazi")
    db_session.add_all([
        ClientInteraction(client_id=c.id, interaction_type="call", created_at=now - timedelta(days=30)),
        Visit(client_id=c.id, agency_id=1, status="completed", scheduled_at=now - timedelta(days=10)),
        # Ni une visite annulée, ni une visite honorée à venir ne comptent comme échange.
        Visit(client_id=c.id, agency_id=1, status="cancelled", scheduled_at=now - timedelta(days=2)),
        Visit(client_id=never.id, agency_id=1, status="confirmed", scheduled_at=now + timedelta(days=3)),
    ])
    db_session.commit()

    rows = _by_id(client.get("/backoffice/clients/summary").json())

    assert rows[c.id]["last_exchange_at"][:10] == (now - timedelta(days=10)).date().isoformat()
    assert rows[c.id]["interactions_count"] == 1
    assert [v["status"] for v in rows[c.id]["visits"]] == ["completed", "cancelled"]
    assert rows[never.id]["last_exchange_at"] is None
    assert rows[never.id]["visits"][0]["status"] == "confirmed"


def test_summary_duplicates_by_name_phone_and_email_within_agency(client, db_session):
    a = _client(db_session, first_name="Khadija", last_name="Belhaj", phone="+212 652 499 713")
    b = _client(db_session, first_name=" khadija", last_name="BELHAJ ", phone="0690617612")
    c = _client(db_session, first_name="Autre", last_name="Nom", phone="06.52.49.97.13")
    d = _client(db_session, first_name="X", last_name="Y", email="Same@Mail.com")
    e = _client(db_session, first_name="Z", last_name="W", email="same@mail.com ")
    _client(db_session, first_name="Khadija", last_name="Belhaj", agency_id=2)

    groups = client.get("/backoffice/clients/summary").json()["duplicates"]

    assert {tuple(g["ids"]): g["reasons"] for g in groups} == {
        (a.id, b.id): ["name"], (a.id, c.id): ["phone"], (d.id, e.id): ["email"],
    }


def test_summary_attaches_leads_by_origin_or_same_contact(client, db_session):
    origin = Lead(agency_id=1, name="Layla A.", status="converted")
    by_name = Lead(agency_id=1, name="mehdi  belhaj", status="new", property_id=66)
    other_agency = Lead(agency_id=2, name="Mehdi Belhaj", status="new")
    db_session.add_all([origin, by_name, other_agency, PropertyRO(id=66, title="3 pièces Mont Fleuri")])
    db_session.commit()
    layla = _client(db_session, first_name="Layla", last_name="Amrani", lead_id=origin.id)
    mehdi = _client(db_session, first_name="Mehdi", last_name="Belhaj")

    rows = _by_id(client.get("/backoffice/clients/summary").json())

    assert [l["id"] for l in rows[layla.id]["leads"]] == [origin.id]
    [lead] = rows[mehdi.id]["leads"]
    assert (lead["id"], lead["status"], lead["property_title"]) == (by_name.id, "new", "3 pièces Mont Fleuri")


def test_history_merges_leads_interactions_visits_in_date_order(client, db_session):
    now = datetime.utcnow()
    c = _client(db_session, first_name="Omar", last_name="Belhaj")
    twin = _client(db_session, first_name="Omar", last_name="Belhaj", city="Rabat")
    db_session.add_all([
        Lead(agency_id=1, name="Omar Belhaj", status="contacted", created_at=now - timedelta(days=20)),
        ClientInteraction(client_id=c.id, interaction_type="whatsapp", direction="outbound",
                          created_at=now - timedelta(days=5)),
        Visit(client_id=c.id, agency_id=1, status="completed", client_feedback="very_interested",
              scheduled_at=now - timedelta(days=12)),
    ])
    db_session.commit()

    body = client.get(f"/backoffice/clients/{c.id}/history").json()

    assert [e["kind"] for e in body["events"]] == ["lead", "visit", "interaction"]
    assert body["events"][1]["client_feedback"] == "very_interested"
    assert body["last_exchange_at"][:10] == (now - timedelta(days=5)).date().isoformat()
    assert body["duplicates"] == [{"id": twin.id, "name": "Omar Belhaj", "city": "Rabat",
                                   "client_type": "buyer", "status": "active", "reasons": ["name"]}]


def test_history_other_agency_forbidden(client, db_session):
    other = _client(db_session, first_name="A", last_name="B", agency_id=2)
    assert client.get(f"/backoffice/clients/{other.id}/history").status_code == 403
