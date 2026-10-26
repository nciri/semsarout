"""Lead saisi par un agent : appel entrant, visite en agence, recommandation."""
from app.models import Lead, PropertyRO

BASE = {"name": "Salma Bennani", "phone": "0612345678"}


def _bien(db, pid=42, agency=1):
    db.add(PropertyRO(id=pid, title="Appartement Anfa", agency_id=agency, owner_id=7))
    db.commit()


def test_creation_minimale_et_source_manuelle(client):
    body = client.post("/backoffice/leads", json=BASE).json()["lead"]
    assert body["name"] == "Salma Bennani"
    assert body["source"] == "manual"        # jamais imiter une provenance du site public
    assert body["status"] == "new"
    assert body["agency_id"] == 1
    assert body["assigned_to_id"] == 7       # l'agent qui saisit le prend en charge


def test_lead_visible_dans_la_liste_de_lagence(client):
    client.post("/backoffice/leads", json={**BASE, "message": "Cherche 3 pièces à Anfa"})
    listing = client.get("/backoffice/leads").json()
    assert listing["total"] == 1
    assert listing["leads"][0]["message"] == "Cherche 3 pièces à Anfa"


def test_un_moyen_de_recontact_est_exige(client):
    assert client.post("/backoffice/leads", json={"name": "Sans contact"}).status_code == 400
    assert client.post("/backoffice/leads", json={"phone": "0612345678"}).status_code == 400
    assert client.post("/backoffice/leads", json={**BASE, "phone": "", "email": "a@b.ma"}
                       ).status_code == 201


def test_rattachement_a_un_bien_du_portefeuille(client, db_session):
    _bien(db_session)
    body = client.post("/backoffice/leads", json={**BASE, "property_id": 42}).json()["lead"]
    assert body["property_id"] == 42


def test_refus_de_rattacher_un_bien_dune_autre_agence(client, db_session):
    """Sinon la saisie d'un lead révélerait le portefeuille du voisin."""
    _bien(db_session, pid=99, agency=2)
    assert client.post("/backoffice/leads", json={**BASE, "property_id": 99}).status_code == 400
    assert client.post("/backoffice/leads", json={**BASE, "property_id": 404}).status_code == 400
    assert db_session.query(Lead).count() == 0
