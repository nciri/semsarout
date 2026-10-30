"""Parties multiples d'un contrat : plusieurs vendeurs, plusieurs locataires.

Le risque couvert est silencieux : `render()` remplace un placeholder non résolu par une
chaîne vide, et `sanitize_html` supprime sans bruit une balise hors allowlist. Un contrat
signé dont l'article « Entre les soussignés » est blanc, ou dont les parties sont collées en
un seul paragraphe illisible, ne lève aucune erreur.
"""
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal

from app.db import Base, get_db
from app.main import app
from app.merge import ROLE_PLACEHOLDERS, build_context, party_blocks, render
from app.models import AgencyRO, ClientRO, Contract, ContractParty, ContractTemplate
from app.sanitize import sanitize_html

AGENCY = 4
OTHER_AGENCY = 9
MIGRATION = Path(__file__).resolve().parents[1] / "db" / "migrate_contract_parties.sql"

BODY = ("<h3>Article 1</h3><p>{{parties_vendeurs}}</p>"
        "<h3>Article 2</h3><p>{{parties_acquereurs}}</p><p>{{client_name}}</p>")


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    return "INTEGER"


class _Client:
    """Double de `ClientRO` pour les tests de fusion pure, sans base."""

    def __init__(self, first_name, last_name, phone=None, email=None):
        self.first_name, self.last_name = first_name, last_name
        self.phone, self.email = phone, email


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'contract.db'}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="7", agency_id=AGENCY, features=["contracts"])
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def jeu(db_session):
    db_session.add_all([
        AgencyRO(id=AGENCY, name="Agence Atlas", address="Gueliz", license_number="L-1"),
        ClientRO(id=10, agency_id=AGENCY, first_name="Sara", last_name="Bennani",
                 phone="0600000000"),
        ClientRO(id=11, agency_id=AGENCY, first_name="Omar", last_name="Tazi"),
        ClientRO(id=12, agency_id=AGENCY, first_name="Nadia", last_name="Idrissi"),
        ClientRO(id=99, agency_id=OTHER_AGENCY, first_name="Youssef", last_name="Alami"),
        ContractTemplate(id=1, agency_id=AGENCY, document_type="compromise",
                         name="Compromis", body_html=BODY),
    ])
    db_session.commit()


def _create(client, **over):
    return client.post("/backoffice/contracts", json={"template_id": 1, **over})


# ---- Table et migration ----
def test_le_modele_porte_la_table_des_parties():
    assert ContractParty.__tablename__ == "contract_party"
    cols = set(ContractParty.__table__.columns.keys())
    assert {"contract_id", "client_id", "role", "position"} <= cols
    # Pas de clé étrangère entre services (ADR) : `client_id` est un entier nu.
    assert not any(c.foreign_keys for c in ContractParty.__table__.columns)


def test_la_migration_est_rejouable_et_deployee():
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS contract.contract_party" in sql
    assert "CREATE INDEX IF NOT EXISTS" in sql
    # Chaque instruction doit être idempotente : le script repasse à chaque déploiement.
    for stmt in (s.strip() for s in sql.split(";")):
        corps = "\n".join(x for x in stmt.splitlines() if not x.strip().startswith("--")).strip()
        if corps:
            assert "IF NOT EXISTS" in corps, f"instruction non rejouable : {corps[:60]}"
    # `create_all` n'émet aucun ALTER : sans cette ligne, la prod n'aurait pas la table.
    liste = (Path(__file__).resolve().parents[3] / "infra" / "prod" / "deploy-remote.sh")
    assert "contract/migrate_contract_parties.sql" in liste.read_text(encoding="utf-8")


def test_la_migration_cree_bien_la_table(db_session):
    """Le script passe sur PostgreSQL ; ici on vérifie au moins qu'il est rejouable deux fois
    sur la définition SQLAlchemy sans erreur (parité du nom de table et de ses colonnes)."""
    Base.metadata.create_all(db_session.get_bind(), checkfirst=True)
    db_session.add(ContractParty(contract_id=1, client_id=10, role="vendeur", position=0))
    db_session.commit()
    assert db_session.query(ContractParty).count() == 1


# ---- Contexte de fusion ----
def test_un_role_a_plusieurs_parties_les_liste_toutes():
    sara, omar = _Client("Sara", "Bennani"), _Client("Omar", "Tazi")
    blocs = party_blocks([("vendeur", sara), ("vendeur", omar)])
    vendeurs = blocs["parties_vendeurs"]
    assert vendeurs.index("Sara Bennani") < vendeurs.index("Omar Tazi")
    assert vendeurs.count("<span>") == 2
    assert "<br>" in vendeurs
    assert "en qualité de vendeur" in vendeurs


def test_chaque_role_recoit_ses_propres_parties():
    blocs = party_blocks([("vendeur", _Client("Sara", "Bennani")),
                          ("acquereur", _Client("Omar", "Tazi"))])
    assert "Sara Bennani" in blocs["parties_vendeurs"]
    assert "Sara Bennani" not in blocs["parties_acquereurs"]
    assert "Omar Tazi" in blocs["parties_acquereurs"]
    assert "en qualité de acquéreur" in blocs["parties_acquereurs"]


def test_un_role_non_saisi_sort_en_blanc_jamais_avec_le_nom_d_un_autre():
    blocs = party_blocks([("vendeur", _Client("Sara", "Bennani"))])
    assert "Sara" not in blocs["parties_locataires"]
    assert blocs["parties_locataires"], "un blanc à compléter, pas une chaîne vide"
    assert "……" in blocs["parties_locataires"]


def test_sans_partie_chaque_role_sort_en_ligne_a_completer():
    """Contrat créé avant ce chantier : un `client_id`, aucune ligne de partie.

    Le client unique ne doit SURTOUT pas tenir tous les rôles : sur un bail il serait nommé
    bailleur ET locataire, sur un compromis vendeur ET acquéreur. Un blanc se lit comme un
    champ à remplir, un nom sous le mauvais rôle comme une affirmation — dans un acte signé.
    Le client connu reste porté par `{{client_name}}` et par `client_id`, et l'éditeur
    permet de nommer les parties. Ne pas « réparer » ce blanc en y remettant le client.
    """
    blocs = party_blocks([])
    for cle in ROLE_PLACEHOLDERS.values():
        assert blocs[cle], f"{cle} vide : render() laisserait un article d'identification blanc"
        assert "……" in blocs[cle], f"{cle} sans blanc à compléter"
        assert "<strong>" not in blocs[cle], f"{cle} nomme quelqu'un sans partie saisie"


def test_l_identification_laisse_la_cin_et_le_domicile_a_completer():
    bloc = party_blocks([("vendeur", _Client("Sara", "Bennani", phone="0600000000"))])
    ligne = bloc["parties_vendeurs"]
    assert "carte nationale d'identité électronique n° ……" in ligne
    assert "demeurant ……" in ligne
    assert "nationalité ……" in ligne
    assert "téléphone 0600000000" in ligne


def test_le_nom_d_un_client_ne_peut_pas_injecter_de_html():
    bloc = party_blocks([("vendeur", _Client("<script>alert(1)</script>", "Bennani"))])
    assert "<script>" not in bloc["parties_vendeurs"]
    assert "&lt;script&gt;" in bloc["parties_vendeurs"]


@pytest.mark.parametrize("nb", [1, 3])
def test_le_bloc_survit_a_la_sanitisation(nb):
    parties = [("locataire", _Client(f"Prénom{i}", f"Nom{i}")) for i in range(nb)]
    bloc = party_blocks(parties)["parties_locataires"]
    propre = sanitize_html(bloc)
    for balise in ("span", "strong", "br"):
        assert len(re.findall(rf"<{balise}\b", bloc)) == len(re.findall(rf"<{balise}\b", propre))
    for i in range(nb):
        assert f"Prénom{i} Nom{i}" in propre


def test_le_rendu_ne_laisse_aucune_accolade_ni_aucun_bloc_vide():
    ctx = build_context(None, client=_Client("Sara", "Bennani"),
                        parties=[("vendeur", _Client("Omar", "Tazi"))])
    rendu = render("<p>{{parties_vendeurs}}</p><p>{{parties_acquereurs}}</p><p>{{client_name}}</p>",
                   ctx)
    assert "{{" not in rendu
    assert "Omar Tazi" in rendu
    # Le client unique du contrat n'est pas promu acquéreur parce que le rôle est vide.
    vendeurs, acquereurs = rendu.split("</p><p>")[0], rendu.split("</p><p>")[1]
    assert "Sara Bennani" not in vendeurs and "Sara Bennani" not in acquereurs
    assert "……" in acquereurs


# ---- API ----
def test_la_creation_enregistre_les_parties_dans_l_ordre(client, jeu, db_session):
    r = _create(client, parties=[{"client_id": 11, "role": "vendeur"},
                                 {"client_id": 10, "role": "vendeur"},
                                 {"client_id": 12, "role": "acquereur"}])
    assert r.status_code == 201, r.text
    contrat = r.json()["contract"]
    assert [(p["client_id"], p["role"]) for p in contrat["parties"]] == [
        (11, "vendeur"), (10, "vendeur"), (12, "acquereur")]
    # Le `client_id` unique est dérivé de la première partie : les deux ne peuvent pas diverger.
    assert contrat["client_id"] == 11
    corps = contrat["body_html"]
    assert corps.index("Omar Tazi") < corps.index("Sara Bennani") < corps.index("Nadia Idrissi")
    assert "Omar Tazi" in corps.split("Article 2")[0]
    assert "Nadia Idrissi" in corps.split("Article 2")[1]


def test_un_contrat_sans_partie_garde_son_client_sans_lui_preter_de_role(client, jeu):
    contrat = _create(client, client_id=10).json()["contract"]
    assert contrat["parties"] == []
    assert contrat["client_id"] == 10
    vendeurs, acquereurs, nom = re.findall(r"<p>(.*?)</p>", contrat["body_html"])
    # `{{client_name}}` reste résolu — le client connu n'est pas perdu…
    assert nom == "Sara Bennani"
    # …mais il n'est nommé dans aucun des deux blocs de rôle, et chacun reste à compléter.
    for bloc in (vendeurs, acquereurs):
        assert "Sara Bennani" not in bloc and "<strong>" not in bloc
        assert "……" in bloc


def test_une_partie_d_une_autre_agence_est_refusee(client, jeu, db_session):
    r = _create(client, parties=[{"client_id": 99, "role": "vendeur"}])
    assert r.status_code == 400
    assert "introuvable" in r.json()["error"]
    assert db_session.query(Contract).count() == 0


def test_un_role_inconnu_est_refuse(client, jeu):
    r = _create(client, parties=[{"client_id": 10, "role": "notaire"}])
    assert r.status_code == 400
    assert "Rôle" in r.json()["error"]


def test_le_meme_client_ne_tient_pas_deux_fois_le_meme_role(client, jeu):
    r = _create(client, parties=[{"client_id": 10, "role": "vendeur"},
                                 {"client_id": 10, "role": "vendeur"}])
    assert r.status_code == 400


def test_l_edition_remplace_les_parties_et_rejoue_le_bloc_dans_le_corps(client, jeu, db_session):
    cid = _create(client, parties=[{"client_id": 10, "role": "vendeur"}]).json()["contract"]["id"]
    r = client.put(f"/backoffice/contracts/{cid}", json={"parties": [
        {"client_id": 10, "role": "vendeur"}, {"client_id": 11, "role": "vendeur"}]})
    assert r.status_code == 200, r.text
    contrat = r.json()["contract"]
    assert [p["client_id"] for p in contrat["parties"]] == [10, 11]
    assert "Sara Bennani" in contrat["body_html"] and "Omar Tazi" in contrat["body_html"]
    # Une seule ligne de plus : le bloc est remplacé, pas dupliqué.
    assert contrat["body_html"].count("en qualité de vendeur") == 2


def test_l_edition_des_parties_preserve_les_retouches_du_corps(client, jeu):
    cid = _create(client, parties=[{"client_id": 10, "role": "vendeur"}]).json()["contract"]["id"]
    corps = client.get(f"/backoffice/contracts/{cid}").json()["contract"]["body_html"]
    retouche = corps + "<p>Clause particulière ajoutée par l'agent.</p>"
    client.put(f"/backoffice/contracts/{cid}", json={"body_html": retouche})
    r = client.put(f"/backoffice/contracts/{cid}", json={"parties": [
        {"client_id": 11, "role": "vendeur"}]})
    final = r.json()["contract"]["body_html"]
    assert "Clause particulière ajoutée par l'agent." in final
    bloc = final.split("Article 2")[0]
    assert "Omar Tazi" in bloc and "Sara Bennani" not in bloc


def test_l_edition_des_parties_realigne_le_client_du_contrat(client, jeu, db_session):
    cid = _create(client, parties=[{"client_id": 10, "role": "vendeur"}]).json()["contract"]["id"]
    client.put(f"/backoffice/contracts/{cid}", json={"parties": [
        {"client_id": 12, "role": "acquereur"}]})
    db_session.expire_all()
    assert db_session.get(Contract, cid).client_id == 12


def test_les_parties_d_un_contrat_ne_fuient_pas_sur_un_autre(client, jeu, db_session):
    a = _create(client, parties=[{"client_id": 10, "role": "vendeur"}]).json()["contract"]["id"]
    b = _create(client, parties=[{"client_id": 11, "role": "vendeur"}]).json()["contract"]["id"]
    assert [p["client_id"] for p in client.get(f"/backoffice/contracts/{a}").json()
            ["contract"]["parties"]] == [10]
    assert [p["client_id"] for p in client.get(f"/backoffice/contracts/{b}").json()
            ["contract"]["parties"]] == [11]
