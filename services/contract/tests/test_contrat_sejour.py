"""Contrat de séjour : fusion des variables du séjour, PDF, puis signature du voyageur."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from app import stay as stay_module
from app.db import Base, get_db
from app.main import app
from app.models import AgencyRO, Contract, ContractTemplate, PropertyRO

AGENCY = 4
OTHER_AGENCY = 9
PROPERTY = 77
TOKEN = "test-internal-token"

BODY = ("<p>{{agency_name}} loue {{stay_property}} à {{guest_name}} "
        "du {{stay_check_in}} au {{stay_check_out}} ({{stay_nights}} nuits, {{stay_total}}).</p>")


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    return "INTEGER"


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'contract.db'}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


class _Storage:
    """Stockage objet remplacé : le test vérifie l'archivage, pas MinIO."""

    def __init__(self):
        self.files = {}

    def put(self, key, data, content_type=None):
        self.files[key] = data

    def get(self, key):
        return self.files[key]


@pytest.fixture
def storage(monkeypatch):
    store = _Storage()
    monkeypatch.setattr(stay_module, "pdf_storage", lambda: store)
    monkeypatch.setattr(stay_module, "render_pdf_bytes", lambda html: b"%PDF-1.4 test")
    return store


@pytest.fixture
def client(db_session, storage, monkeypatch):
    monkeypatch.setattr(stay_module, "_guard", lambda token: None if token == TOKEN
                        else stay_module.err("Interdit", 403))
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def modele(db_session):
    db_session.add_all([
        AgencyRO(id=AGENCY, name="Agence Atlas", address="Gueliz", license_number="L-1"),
        PropertyRO(id=PROPERTY, agency_id=AGENCY, address="12 rue des Lilas", city="Marrakech"),
        ContractTemplate(id=1, agency_id=AGENCY, document_type="stay",
                         name="Contrat de séjour", body_html=BODY),
    ])
    db_session.commit()


def _stay(**over):
    base = {"property_id": PROPERTY, "property_title": "Appartement Gueliz",
            "check_in": "2026-12-10T00:00:00", "check_out": "2026-12-14T00:00:00",
            "nights": 4, "guest_count": 2, "total_price": 3200, "cleaning_fee": 300,
            "guest_name": "Salma Idrissi", "guest_email": "salma@example.com",
            "guest_phone": "0600000000"}
    base.update(over)
    return base


def _create(client, **over):
    return client.post("/internal/contracts/sejour", headers={"x-internal-token": TOKEN},
                       json={"agency_id": AGENCY, "stay": _stay(**over)})


def test_le_contrat_fusionne_les_variables_du_sejour(client, modele, db_session, storage):
    r = _create(client)
    assert r.status_code == 201
    contract = r.json()["contract"]
    assert contract["status"] == "finalized"
    assert contract["pdf_url"] in storage.files

    row = db_session.get(Contract, contract["id"])
    assert "Salma Idrissi" in row.body_html
    assert "10/12/2026" in row.body_html
    assert "4 nuits" in row.body_html
    assert row.document_type == "stay"


def test_un_nom_de_voyageur_importe_est_echappe_et_ne_pose_pas_de_lien(client, modele, db_session,
                                                                      storage):
    """`guest_name` vient d'un calendrier Airbnb/Booking importé : une source non maîtrisée.

    `sanitize_html` tourne en aval et tue tout script, mais bleach **garde `<a href>`** : sans
    échappement à la substitution, un nom de voyageur posait un lien cliquable dans un contrat
    de séjour généré.
    """
    hostile = 'Salma <a href="https://evil.example/paie-ici">Virement ici</a> & <b>Idrissi</b>'
    r = _create(client, guest_name=hostile)
    assert r.status_code == 201
    corps = db_session.get(Contract, r.json()["contract"]["id"]).body_html
    # Plus aucune balise vivante : le lien est du texte, pas un lien.
    assert "<a " not in corps and "<b>" not in corps
    # Le nom reste lisible en entier, chevrons compris, plutôt que silencieusement amputé.
    assert "&lt;a href=" in corps and "Virement ici" in corps and "&amp;" in corps

def test_sans_modele_de_sejour_la_demande_est_refusee(client, db_session):
    db_session.add(AgencyRO(id=AGENCY, name="Agence Atlas"))
    db_session.commit()
    r = _create(client)
    assert r.status_code == 400
    assert "modèle" in r.json()["error"]


def test_le_jeton_interne_est_exige(client, modele):
    r = client.post("/internal/contracts/sejour", json={"agency_id": AGENCY, "stay": _stay()})
    assert r.status_code == 403


def test_la_signature_consigne_le_nom_la_date_et_l_ip(client, modele, db_session):
    cid = _create(client).json()["contract"]["id"]
    r = client.post(f"/internal/contracts/{cid}/signe", headers={"x-internal-token": TOKEN},
                    json={"agency_id": AGENCY, "signer_name": "Salma Idrissi",
                          "signer_ip": "41.248.0.1"})
    assert r.status_code == 200
    assert r.json()["contract"]["status"] == "signed"

    db_session.expire_all()
    row = db_session.get(Contract, cid)
    assert row.merge_context["signed_by"] == "Salma Idrissi"
    assert row.merge_context["signed_ip"] == "41.248.0.1"
    assert row.signed_at is not None


def test_une_signature_sans_nom_est_refusee(client, modele):
    cid = _create(client).json()["contract"]["id"]
    r = client.post(f"/internal/contracts/{cid}/signe", headers={"x-internal-token": TOKEN},
                    json={"agency_id": AGENCY, "signer_name": "  "})
    assert r.status_code == 400


def test_le_contrat_d_une_autre_agence_est_introuvable(client, modele):
    cid = _create(client).json()["contract"]["id"]
    r = client.get(f"/internal/contracts/{cid}", headers={"x-internal-token": TOKEN},
                   params={"agency_id": OTHER_AGENCY})
    assert r.status_code == 404


def test_signer_deux_fois_ne_change_rien(client, modele, db_session):
    cid = _create(client).json()["contract"]["id"]
    body = {"agency_id": AGENCY, "signer_name": "Salma Idrissi"}
    client.post(f"/internal/contracts/{cid}/signe", headers={"x-internal-token": TOKEN}, json=body)
    first = db_session.get(Contract, cid).signed_at
    r = client.post(f"/internal/contracts/{cid}/signe", headers={"x-internal-token": TOKEN},
                    json={**body, "signer_name": "Quelqu'un d'autre"})
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.get(Contract, cid).signed_at == first
