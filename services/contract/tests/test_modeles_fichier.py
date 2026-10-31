"""Modèles de contrats déposés en fichier (Word ou PDF), à côté des modèles HTML.

Deux risques, tous deux silencieux pour l'agence :
  1. un modèle fichier choisi dans l'écran de création de contrat — la fusion travaille sur
     `body_html`, qui est NULL pour ces modèles, donc `render()` lève sur un None et l'agence
     voit une erreur 500 au lieu d'un refus explicable ;
  2. un dépôt sans contrôle de type ni de taille — n'importe quel binaire atterrit dans le
     stockage objet sous un nom de modèle de contrat, et le téléchargement le ressort tel quel.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal

from app import main as m
from app.db import Base, get_db
from app.main import app
from app.models import AgencyRO, ContractTemplate

AGENCY = 4
AUTRE_AGENCE = 9
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    return "INTEGER"


class _Stockage:
    """Double du stockage objet : garde les octets en mémoire, comme MinIO le ferait."""

    def __init__(self):
        self.objets = {}

    def put(self, key, data, content_type="application/octet-stream", **extra):
        self.objets[key] = (data, content_type)

    def get(self, key):
        return self.objets[key][0]


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'contract.db'}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    session.add(AgencyRO(id=AGENCY, name="Agence Atlas", address="Gueliz", license_number="L-1"))
    session.commit()
    yield session
    session.close()


@pytest.fixture
def stockage(monkeypatch):
    s = _Stockage()
    monkeypatch.setattr(m, "template_storage", lambda: s)
    return s


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="7", agency_id=AGENCY, features=["contracts", "contract_templates"])
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _depose(client, nom="Mandat Atlas.docx", mime=DOCX, contenu=b"PK\x03\x04 docx", type_doc="mandate_sale"):
    return client.post(
        "/backoffice/contract-templates/upload",
        data={"name": "Mandat maison Atlas", "document_type": type_doc},
        files={"file": (nom, contenu, mime)},
    )


def test_depot_word_cree_un_modele_telechargeable(client, stockage):
    r = _depose(client)
    assert r.status_code == 201, r.text
    tpl = r.json()["template"]
    assert tpl["file_name"] == "Mandat Atlas.docx"
    assert tpl["file_mime"] == DOCX
    assert tpl["has_file"] is True
    # Le fichier est allé au stockage objet, pas en base : la colonne ne porte que sa clé.
    assert len(stockage.objets) == 1

    r = client.get(f"/backoffice/contract-templates/{tpl['id']}/file")
    assert r.status_code == 200
    assert r.content == b"PK\x03\x04 docx"
    assert r.headers["content-type"] == DOCX
    # Sans `attachment`, le navigateur tente d'afficher un .docx au lieu de l'enregistrer.
    assert "attachment" in r.headers["content-disposition"]
    assert "Mandat Atlas.docx" in r.headers["content-disposition"]


def test_depot_pdf_accepte(client, stockage):
    r = _depose(client, nom="Bail.pdf", mime="application/pdf", contenu=b"%PDF-1.7")
    assert r.status_code == 201, r.text
    assert r.json()["template"]["file_mime"] == "application/pdf"


def test_un_type_non_bureautique_est_refuse(client, stockage):
    r = _depose(client, nom="photo.png", mime="image/png", contenu=b"\x89PNG")
    assert r.status_code == 400
    assert stockage.objets == {}  # rien n'a été écrit


def test_un_fichier_trop_gros_est_refuse(client, stockage):
    r = _depose(client, contenu=b"x" * (m._MAX_MODELE + 1))
    assert r.status_code == 413
    assert stockage.objets == {}


def test_un_depot_sans_fichier_ni_nom_est_refuse(client, stockage):
    r = client.post("/backoffice/contract-templates/upload",
                    data={"name": "", "document_type": "other"},
                    files={"file": ("x.pdf", b"%PDF", "application/pdf")})
    assert r.status_code == 400


def test_le_modele_d_une_autre_agence_reste_invisible(client, db_session, stockage):
    autre = ContractTemplate(agency_id=AUTRE_AGENCE, document_type="lease", name="Bail voisin",
                             body_html=None, file_key="contract-templates/9/x.pdf",
                             file_name="x.pdf", file_mime="application/pdf")
    db_session.add(autre)
    db_session.commit()
    assert client.get(f"/backoffice/contract-templates/{autre.id}/file").status_code == 404


def test_un_modele_html_n_a_pas_de_fichier_a_telecharger(client, db_session, stockage):
    html = ContractTemplate(agency_id=AGENCY, document_type="other", name="Modele HTML",
                            body_html="<p>{{client_name}}</p>")
    db_session.add(html)
    db_session.commit()
    r = client.get(f"/backoffice/contract-templates/{html.id}/file")
    assert r.status_code == 404


def test_generer_un_contrat_depuis_un_modele_fichier_est_refuse_proprement(client, stockage):
    """Le refus explicite vaut mieux qu'un 500 : la fusion n'a aucun corps HTML à rendre."""
    tid = _depose(client).json()["template"]["id"]
    r = client.post("/backoffice/contracts", json={"template_id": tid, "title": "Essai"})
    assert r.status_code == 400
    assert "fichier" in r.json()["error"].lower()


def test_le_depot_est_reserve_au_plan_entreprise(db_session, stockage):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="7", agency_id=AGENCY, features=["contracts"])  # pas de `contract_templates`
    with TestClient(app) as c:
        assert _depose(c).status_code == 403
    app.dependency_overrides.clear()


def test_le_nom_de_fichier_ne_peut_pas_injecter_d_en_tete(client, stockage):
    """`Content-Disposition` est construit avec le nom fourni par le client : un guillemet ou
    un retour chariot y casserait l'en-tête, voire en ajouterait un second."""
    r = _depose(client, nom='../../evil"\r\nX-Injecte: 1.docx')
    assert r.status_code == 201, r.text
    tpl = r.json()["template"]
    assert '"' not in tpl["file_name"]
    assert "\r" not in tpl["file_name"] and "\n" not in tpl["file_name"]
    assert "/" not in tpl["file_name"]          # basename seul, pas de chemin
    assert tpl["file_name"].endswith(".docx")   # extension alignée sur le MIME validé

    r = client.get(f"/backoffice/contract-templates/{tpl['id']}/file")
    assert r.status_code == 200
    cd = r.headers["content-disposition"]
    assert "x-injecte" not in {k.lower() for k in r.headers}
    assert "\r" not in cd and "\n" not in cd


def test_l_extension_suit_le_mime_valide_pas_le_nom_fourni(client, stockage):
    """Un `.docx` annoncé en PDF ressortirait en .docx et s'ouvrirait de travers."""
    r = _depose(client, nom="piege.docx", mime="application/pdf", contenu=b"%PDF-1.7")
    assert r.json()["template"]["file_name"].endswith(".pdf")


def test_un_envoi_annonce_trop_gros_est_refuse_avant_analyse(client, stockage):
    """Starlette analyse tout le multipart AVANT le gestionnaire, en mémoire puis sur disque :
    sans refus sur `Content-Length`, un envoi de plusieurs gigaoctets est déjà écrit quand le
    plafond se mesure. Le plafond lu après coup ne protégeait donc rien."""
    r = client.post(
        "/backoffice/contract-templates/upload",
        data={"name": "Trop gros", "document_type": "other"},
        files={"file": ("x.pdf", b"%PDF", "application/pdf")},
        headers={"Content-Length": str(m._MAX_MODELE + 1)},
    )
    assert r.status_code == 413
    assert stockage.objets == {}
