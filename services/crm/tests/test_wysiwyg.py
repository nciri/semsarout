"""Champs WYSIWYG du service crm : `Lead.message`, `Client.notes`, `Visit.notes`.

Tous les champs texte du produit sont saisis en texte riche : ce qui arrive est du HTML, donc
un XSS stocké que la fiche du lead, celle du client et l'email d'alerte de l'agence
déclencheraient. Les tests épinglent le **balisage qui survit**, pas seulement l'absence de
`<script>` : une sanitisation qui mangerait `<em>` passerait le second critère.
"""
from app.models import Client, Lead, Visit
from app.worker import _create_lead

SALE = '<p class="MsoNormal">Villa <em>rénovée</em></p><script>alert(1)</script>'
PROPRE = "<p>Villa <em>rénovée</em></p>"


def test_contact_public_sanitises_the_message(client, db_session):
    r = client.post("/contact", json={"name": "Hind", "email": "h@example.ma",
                                      "service": None, "message": SALE})

    assert r.status_code == 201
    # Le lead public n'a pas d'agence : il n'est pas lisible par la route back-office.
    assert db_session.get(Lead, r.json()["lead_id"]).message == PROPRE


def test_backoffice_lead_sanitises_the_message_on_create_and_update(client):
    created = client.post("/backoffice/leads",
                          json={"name": "Hind", "phone": "0612345678", "message": SALE})
    assert created.status_code == 201
    lead_id = created.json()["lead"]["id"]
    assert created.json()["lead"]["message"] == PROPRE

    updated = client.put(f"/backoffice/leads/{lead_id}",
                         json={"message": '<b>Rappeler</b><img src=x onerror="alert(2)">'})
    assert updated.json()["message"] == "<b>Rappeler</b>"
    # `notes` est la note interne de l'agent, sans éditeur riche : l'assainir ferait
    # apparaître des entités à l'écran.
    assert client.put(f"/backoffice/leads/{lead_id}",
                      json={"notes": "Budget < 900000 & cash"}).json()["notes"] == "Budget < 900000 & cash"
    # Un champ vidé par l'éditeur (`<p><br></p>`) redevient NULL, pas une chaîne « non vide ».
    assert client.put(f"/backoffice/leads/{lead_id}", json={"message": "<p><br></p>"}).json()["message"] is None


def test_event_borne_lead_is_sanitised_in_the_worker(db_session):
    """`listing.contacted` / `program.contacted` passent par le consumer, pas par une route :
    c'est la seule porte commune aux deux émetteurs."""
    _create_lead(db_session, {"name": "Hind", "email": "h@example.ma", "message": SALE,
                              "agency_id": 1})
    db_session.commit()

    assert db_session.query(Lead).one().message == PROPRE


def test_client_notes_are_sanitised_on_create_update_and_conversion(client, db_session):
    created = client.post("/backoffice/clients", json={"first_name": "Hind", "last_name": "S.",
                                                       "client_type": "buyer", "notes": SALE})
    assert created.status_code == 201
    cid = created.json()["id"]
    assert created.json()["notes"] == PROPRE

    assert client.put(f"/backoffice/clients/{cid}",
                      json={"notes": '<h3>Suivi</h3><iframe src="x"></iframe>'}).json()["notes"] == "<h3>Suivi</h3>"
    # `address` reste du texte brut : il n'a pas d'éditeur riche.
    assert client.put(f"/backoffice/clients/{cid}",
                      json={"address": "Lot < 12 & 14"}).json()["address"] == "Lot < 12 & 14"

    # La conversion d'un lead recopie `Lead.message` dans `Client.notes` : les deux colonnes
    # doivent contenir le même format, sinon la fiche mélange HTML et texte brut.
    lead = Lead(agency_id=1, status="new", source="website", name="Omar B.", message=PROPRE)
    db_session.add(lead)
    db_session.commit()
    converted = client.post(f"/backoffice/clients/convert-lead/{lead.id}", json={})
    assert converted.json()["notes"] == PROPRE


def test_visit_notes_are_sanitised_on_create_and_update(client, db_session):
    created = client.post("/backoffice/visits", json={
        "visitor_name": "Hind", "scheduled_at": "2026-11-12T10:00:00", "notes": SALE})
    assert created.status_code == 201
    vid = created.json()["id"]
    assert created.json()["notes"] == PROPRE

    assert client.put(f"/backoffice/visits/{vid}",
                      json={"notes": "<ul><li>Clés</li></ul>"}).json()["notes"] == "<ul><li>Clés</li></ul>"
    assert db_session.query(Visit).count() == 1
    assert db_session.query(Client).count() == 0
