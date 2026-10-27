"""Dossier d'achat : capacité de financement calculée et pièces déposées par l'acquéreur."""
import pytest
from fastapi.testclient import TestClient

from app import buyer, storage, users_client
from app.db import get_db
from app.main import app
from app.models import BuyerDocument, Client
from app.qualification import assess, borrowing_capacity

EMAIL = "rachid.kettani@example.ma"


class _FakeStore:
    """Objet-store en mémoire : le test porte sur les règles d'accès, pas sur MinIO."""

    def __init__(self):
        self.objects = {}

    def put(self, key, body, content_type):
        self.objects[key] = (body, content_type)

    def get(self, key):
        return self.objects[key][0]


@pytest.fixture(autouse=True)
def _store(monkeypatch):
    fake = _FakeStore()
    monkeypatch.setattr(storage, "docs_storage", lambda: fake)
    return fake


@pytest.fixture(autouse=True)
def _account_email(monkeypatch):
    """Le compte connecté (uid 7) porte l'adresse de la fiche : c'est son dossier."""
    monkeypatch.setattr(users_client, "email_of",
                        lambda uid: EMAIL if uid == 7 else "autre@example.ma")


def _client_row(db, **kw):
    defaults = dict(first_name="Rachid", last_name="Kettani", email=EMAIL, agency_id=1,
                    client_type="buyer", budget_max=1_200_000)
    c = Client(**{**defaults, **kw})
    db.add(c)
    db.commit()
    return c


def _buyer_client(db_session):
    """Acquéreur connecté, sans agence : il n'a accès qu'à son propre dossier."""
    app.dependency_overrides[get_db] = lambda: db_session
    return TestClient(app, headers={"x-semsar-user-id": "7"})


def test_capacite_demprunt_sur_une_mensualite():
    # 6 000 Dh/mois sur 20 ans à 4,75 % : de l'ordre de 930 000 Dh.
    assert 920_000 < borrowing_capacity(6000) < 940_000
    assert borrowing_capacity(None) is None
    assert borrowing_capacity(0) is None


def test_le_budget_realiste_confronte_apport_et_emprunt():
    out = assess(budget_max=1_200_000, down_payment=300_000, max_monthly_payment=6000,
                 has_bank_preapproval=True)
    assert out["realistic_budget"] == round(300_000 + out["borrowing_capacity"])
    assert out["verdict"] == "financed"          # capacité au-dessus du budget annoncé
    assert out["gap"] > 0


def test_verdicts_tendu_et_ecart():
    tendu = assess(budget_max=1_200_000, down_payment=50_000, max_monthly_payment=6000,
                   has_bank_preapproval=False)
    assert tendu["verdict"] == "tight"           # entre 80 % et 100 % du budget
    ecart = assess(budget_max=3_000_000, down_payment=100_000, max_monthly_payment=4000,
                   has_bank_preapproval=False)
    assert ecart["verdict"] == "gap"


def test_sans_capacite_renseignee_aucun_verdict_nest_invente():
    out = assess(budget_max=1_200_000, down_payment=None, max_monthly_payment=None,
                 has_bank_preapproval=False)
    assert out["realistic_budget"] is None and out["verdict"] == "unknown"


def test_les_pieces_obligatoires_dependent_du_preaccord():
    sans = assess(budget_max=None, down_payment=200_000, max_monthly_payment=None,
                  has_bank_preapproval=False, documents=[("cin", "validated")])
    assert sans["missing_documents"] == ["justificatif_revenu", "releve_bancaire"]
    avec = assess(budget_max=None, down_payment=200_000, max_monthly_payment=None,
                  has_bank_preapproval=True, documents=[])
    assert avec["required_documents"][-1] == "accord_bancaire"


def test_la_fiche_client_expose_le_financement(client, db_session):
    c = _client_row(db_session, down_payment=300_000, max_monthly_payment=6000,
                    has_bank_preapproval=True)
    body = client.get(f"/backoffice/clients/{c.id}").json()
    assert body["financing"]["verdict"] == "financed"
    assert body["financing"]["missing_documents"] == ["cin", "justificatif_revenu",
                                                      "releve_bancaire", "accord_bancaire"]
    assert body["documents"] == []


def test_lagence_saisit_la_capacite_sur_la_fiche(client, db_session):
    c = _client_row(db_session)
    client.put(f"/backoffice/clients/{c.id}", json={"down_payment": 250_000,
                                                    "max_monthly_payment": 7000,
                                                    "has_bank_preapproval": True})
    body = client.get(f"/backoffice/clients/{c.id}").json()
    assert body["financing"]["down_payment"] == 250_000
    assert body["financing"]["has_bank_preapproval"] is True


def test_lacquereur_depose_une_piece_sur_son_dossier(db_session):
    c = _client_row(db_session)
    me = _buyer_client(db_session)

    created = me.post(f"/buyer-dossier/{c.id}/documents?doc_type=cin&filename=cin.pdf",
                      content=b"%PDF-1.4", headers={"content-type": "application/pdf"})
    assert created.status_code == 201
    assert created.json()["uploaded_by_user_id"] == 7

    dossier = me.get("/buyer-dossier").json()["dossiers"][0]
    assert dossier["client_id"] == c.id
    assert [d["doc_type"] for d in dossier["documents"]] == ["cin"]
    assert "cin" not in dossier["qualification"]["missing_documents"]
    app.dependency_overrides.clear()


def test_un_dossier_qui_nest_pas_le_sien_reste_ferme(db_session):
    """L'adresse du compte est la clé : une autre fiche ne doit rien livrer."""
    autre = _client_row(db_session, email="salma@example.ma")
    me = _buyer_client(db_session)

    assert me.get("/buyer-dossier").json()["dossiers"] == []
    refus = me.post(f"/buyer-dossier/{autre.id}/documents?doc_type=cin&filename=x.pdf",
                    content=b"x", headers={"content-type": "application/pdf"})
    assert refus.status_code == 404
    assert db_session.query(BuyerDocument).count() == 0
    app.dependency_overrides.clear()


def test_type_de_piece_inconnu_refuse(db_session):
    c = _client_row(db_session)
    me = _buyer_client(db_session)
    refus = me.post(f"/buyer-dossier/{c.id}/documents?doc_type=passeport&filename=x.pdf",
                    content=b"x", headers={"content-type": "application/pdf"})
    assert refus.status_code == 400
    app.dependency_overrides.clear()


def test_lagence_valide_une_piece_et_lacquereur_ne_peut_plus_la_retirer(client, db_session):
    c = _client_row(db_session)
    db_session.add(BuyerDocument(client_id=c.id, doc_type="cin", status="received",
                                 file_key="k", filename="cin.pdf"))
    db_session.commit()
    doc_id = db_session.query(BuyerDocument).one().id

    assert client.patch(f"/backoffice/clients/{c.id}/documents/{doc_id}",
                        json={"status": "validated"}).json()["status"] == "validated"

    me = _buyer_client(db_session)
    assert me.delete(f"/buyer-dossier/{c.id}/documents/{doc_id}").status_code == 400
    app.dependency_overrides.clear()


def test_une_piece_rejetee_redevient_manquante(db_session):
    c = _client_row(db_session)
    docs = [BuyerDocument(client_id=c.id, doc_type="cin", status="rejected")]
    assert "cin" in buyer.assess_client(c, docs)["missing_documents"]
