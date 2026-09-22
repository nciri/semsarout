from datetime import datetime

from app.models import Client, Lead


def _lead(db, **kw):
    l = Lead(**{"agency_id": 1, "status": "new", "source": "website", **kw})
    db.add(l)
    db.commit()
    return l


def test_duplicates_match_name_and_phone_within_agency(client, db_session):
    me = _lead(db_session, name="Hind Senhaji", phone="06 12 34 56 78")
    same_name = _lead(db_session, name="  hind senhaji ")
    same_phone = _lead(db_session, name="H. S.", phone="06.12.34.56.78")
    _lead(db_session, name="Autre Personne", phone="0700000000")
    _lead(db_session, name="Hind Senhaji", agency_id=2)  # autre agence : jamais visible
    db_session.add_all([
        Client(first_name="Hind", last_name="Senhaji", agency_id=1, client_type="buyer"),
        Client(first_name="Hind", last_name="Senhaji", agency_id=2, client_type="buyer"),
    ])
    db_session.commit()

    r = client.get(f"/backoffice/leads/{me.id}/duplicates")

    assert r.status_code == 200
    body = r.json()
    assert {d["id"] for d in body["leads"]} == {same_name.id, same_phone.id}
    assert [c["name"] for c in body["clients"]] == ["Hind Senhaji"]
    assert body["clients"][0]["from_this_lead"] is False


def test_duplicates_include_client_converted_from_lead(client, db_session):
    me = _lead(db_session, name="Omar", status="converted")
    db_session.add(Client(first_name="Omar", last_name="Alaoui", agency_id=1, client_type="buyer", lead_id=me.id))
    db_session.commit()

    body = client.get(f"/backoffice/leads/{me.id}/duplicates").json()

    assert body["leads"] == []
    assert body["clients"][0]["from_this_lead"] is True


def test_duplicates_other_agency_forbidden(client, db_session):
    other = _lead(db_session, name="X", agency_id=2)
    assert client.get(f"/backoffice/leads/{other.id}/duplicates").status_code == 403


def test_filter_unassigned(client, db_session):
    free = _lead(db_session, name="Libre")
    _lead(db_session, name="Pris", assigned_to_id=7)

    body = client.get("/backoffice/leads?assigned_to=none").json()

    assert [l["id"] for l in body["leads"]] == [free.id]
    assert [l["name"] for l in client.get("/backoffice/leads?assigned_to=7").json()["leads"]] == ["Pris"]


def test_lead_dict_exposes_lost_at(client, db_session):
    l = _lead(db_session, name="Perdu")

    body = client.put(f"/backoffice/leads/{l.id}", json={"status": "lost", "lost_reason": "budget"}).json()

    assert body["lost_reason"] == "budget"
    assert datetime.fromisoformat(body["lost_at"])
