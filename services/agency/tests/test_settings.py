"""Réglages d'agence : le profil appartient aux colonnes, le blob aux réglages d'exploitation.

Les deux écrans de paramètres éditaient le même profil ; le blob finissait par masquer le
nom réel de l'agence, affiché publiquement.
"""
import pytest
from semsar_auth import Principal, get_principal

from app.main import app
from app.models import Agency

AGENCY_ID = 4


@pytest.fixture
def agence(db_session):
    a = Agency(id=AGENCY_ID, name="Immobilière Anfa", slug="immobiliere-anfa",
               email="contact@anfa.ma", phone="0522000000", city="Casablanca",
               website="https://anfa.ma", description="Agence de quartier",
               address="12 bd Anfa", settings={})
    db_session.add(a)
    db_session.commit()
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=["agency_admin"], agency_id=AGENCY_ID, is_superadmin=False,
        features=[], claims={})
    yield a
    app.dependency_overrides.pop(get_principal, None)


def test_les_defauts_de_commission_distinguent_vente_et_location(client, agence):
    body = client.get("/backoffice/settings").json()
    assert body["default_sale_commission_fee"] == 0        # forfait, à fixer par l'agence
    assert body["default_rental_commission_rate"] == 50    # % du loyer mensuel


def test_le_profil_vient_des_colonnes_et_non_du_blob(client, agence, db_session):
    agence.settings = {"agency_name": "Ancien nom", "currency": "MAD"}
    db_session.commit()

    body = client.get("/backoffice/settings").json()
    assert body["agency_name"] == "Immobilière Anfa"
    assert body["currency"] == "MAD"


def test_un_put_ne_peut_pas_renommer_lagence_par_le_blob(client, agence, db_session):
    resp = client.put("/backoffice/settings", json={
        "agency_name": "Nom détourné", "default_sale_commission_fee": 15000})

    assert resp.status_code == 200
    assert resp.json()["agency_name"] == "Immobilière Anfa"
    assert resp.json()["default_sale_commission_fee"] == 15000
    db_session.refresh(agence)
    assert agence.name == "Immobilière Anfa"
    assert "agency_name" not in agence.settings


def test_un_put_purge_les_valeurs_de_profil_deja_stockees(client, agence, db_session):
    agence.settings = {"agency_city": "Rabat", "smtp_host": "smtp.anfa.ma"}
    db_session.commit()

    client.put("/backoffice/settings", json={"timezone": "Africa/Casablanca"})

    db_session.refresh(agence)
    assert "agency_city" not in agence.settings
    assert agence.settings["smtp_host"] == "smtp.anfa.ma"


def test_le_mot_de_passe_smtp_ne_ressort_jamais(client, agence, db_session):
    client.put("/backoffice/settings", json={"smtp_password": "secret"})
    body = client.get("/backoffice/settings").json()
    assert "smtp_password" not in body
    db_session.refresh(agence)
    assert agence.settings["smtp_password"] == "secret"
