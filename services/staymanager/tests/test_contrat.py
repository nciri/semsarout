"""Contrat de séjour vu depuis staymanager : génération, état, signature par le voyageur.

Le contrat lui-même appartient au service `contract` : il est simulé ici. Ce qui est
vérifié, c'est que le séjour garde la bonne référence et le bon état, et que le voyageur
signe depuis son lien sans compte.
"""
from datetime import datetime, timedelta

import pytest

from app import contract_client
from app.models import PropertyRO, StayManagerReservation
from tests.conftest import AGENCY

PROPERTY = 77


@pytest.fixture
def bien(db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Appartement Gueliz"))
    db_session.commit()


@pytest.fixture
def faux_contrat(monkeypatch):
    """Service `contract` simulé : un contrat finalisé, signable une fois."""
    state = {"id": 55, "title": "Contrat de séjour", "status": "finalized",
             "pdf_url": "contracts/4/stay_55.pdf", "signed_at": None, "calls": []}
    fields = ("id", "title", "status", "pdf_url", "signed_at")

    def create(agency_id, stay, *, title=None, template_id=None):
        state["calls"].append(("create", agency_id, stay, template_id))
        return {k: state[k] for k in fields}

    def read(agency_id, contract_id):
        return {k: state[k] for k in fields}

    def sign(agency_id, contract_id, signer_name, signer_ip=""):
        state["status"] = "signed"
        state["signed_at"] = "2026-12-01T10:00:00"
        state["calls"].append(("sign", signer_name, signer_ip))
        return {k: state[k] for k in fields}

    monkeypatch.setattr(contract_client, "create", create)
    monkeypatch.setattr(contract_client, "read", read)
    monkeypatch.setattr(contract_client, "sign", sign)
    return state


def _stay(client):
    return client.post("/backoffice/sejours", json={
        "property_id": PROPERTY, "check_in": "2026-12-10", "check_out": "2026-12-14",
        "guest_name": "Salma Idrissi", "guest_email": "salma@example.com",
        "guest_count": 2, "total_price": 3200}).json()["stay"]["id"]


def test_generer_le_contrat_rattache_sa_reference_au_sejour(client, bien, faux_contrat, db_session):
    stay_id = _stay(client)
    r = client.post(f"/backoffice/sejours/{stay_id}/contrat", json={})
    assert r.status_code == 201
    assert r.json()["contract"]["status"] == "finalized"

    db_session.expire_all()
    row = db_session.get(StayManagerReservation, stay_id)
    assert row.contract_id == 55
    assert row.contract_status == "finalized"
    # Le séjour est transmis tel quel : le modèle cite des dates, pas des identifiants.
    _, _, payload, _ = faux_contrat["calls"][0]
    assert payload["guest_name"] == "Salma Idrissi"
    assert payload["nights"] == 4


def test_un_sejour_annule_n_a_pas_de_contrat_a_etablir(client, bien, faux_contrat):
    stay_id = _stay(client)
    client.post(f"/backoffice/sejours/{stay_id}/annuler")
    r = client.post(f"/backoffice/sejours/{stay_id}/contrat", json={})
    assert r.status_code == 400


def test_un_service_contrat_injoignable_est_dit_tel_quel(client, bien, monkeypatch):
    stay_id = _stay(client)

    def boom(*a, **k):
        raise contract_client.ContractError("Le service des contrats est injoignable.")

    monkeypatch.setattr(contract_client, "create", boom)
    r = client.post(f"/backoffice/sejours/{stay_id}/contrat", json={})
    assert r.status_code == 502
    assert "injoignable" in r.json()["error"]


def test_le_voyageur_signe_depuis_son_lien(client, bien, faux_contrat, db_session):
    stay_id = _stay(client)
    client.post(f"/backoffice/sejours/{stay_id}/contrat", json={})
    token = client.post(f"/backoffice/sejours/{stay_id}/enregistrement").json()["link"]["token"]

    vue = client.get(f"/sejours/enregistrement/{token}").json()
    assert vue["contract"]["status"] == "finalized"

    r = client.post(f"/sejours/enregistrement/{token}/contrat",
                    json={"signer_name": "Salma Idrissi"})
    assert r.status_code == 200
    assert r.json()["contract"]["status"] == "signed"

    db_session.expire_all()
    assert db_session.get(StayManagerReservation, stay_id).contract_status == "signed"


def test_signer_sans_nom_est_refuse(client, bien, faux_contrat):
    stay_id = _stay(client)
    client.post(f"/backoffice/sejours/{stay_id}/contrat", json={})
    token = client.post(f"/backoffice/sejours/{stay_id}/enregistrement").json()["link"]["token"]
    r = client.post(f"/sejours/enregistrement/{token}/contrat", json={"signer_name": "x"})
    assert r.status_code == 400


def test_sans_contrat_le_voyageur_n_a_rien_a_signer(client, bien):
    stay_id = _stay(client)
    token = client.post(f"/backoffice/sejours/{stay_id}/enregistrement").json()["link"]["token"]
    assert client.get(f"/sejours/enregistrement/{token}").json()["contract"] is None
    r = client.post(f"/sejours/enregistrement/{token}/contrat",
                    json={"signer_name": "Salma Idrissi"})
    assert r.status_code == 404


def test_un_contrat_deja_signe_n_est_pas_regenere(client, bien, faux_contrat, db_session):
    stay_id = _stay(client)
    client.post(f"/backoffice/sejours/{stay_id}/contrat", json={})
    row = db_session.get(StayManagerReservation, stay_id)
    row.contract_status = "signed"
    db_session.commit()
    assert client.post(f"/backoffice/sejours/{stay_id}/contrat", json={}).status_code == 409


def test_la_fiche_relit_l_etat_du_contrat(client, bien, faux_contrat):
    stay_id = _stay(client)
    client.post(f"/backoffice/sejours/{stay_id}/contrat", json={})
    body = client.get(f"/backoffice/sejours/{stay_id}/contrat").json()
    assert body["contract"]["pdf_url"] == "contracts/4/stay_55.pdf"

    autre = client.post("/backoffice/sejours", json={
        "property_id": PROPERTY,
        "check_in": (datetime.utcnow() + timedelta(days=30)).date().isoformat(),
        "check_out": (datetime.utcnow() + timedelta(days=33)).date().isoformat(),
    }).json()["stay"]["id"]
    assert client.get(f"/backoffice/sejours/{autre}/contrat").json()["contract"] is None
