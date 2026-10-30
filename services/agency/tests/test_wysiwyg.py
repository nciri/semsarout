"""Description d'agence : saisie WYSIWYG, donc du HTML stocké et assaini à l'écriture.

La description est affichée sur la **fiche publique de l'agence** : un chemin d'écriture non
assaini est un XSS stocké déclenché pour n'importe quel visiteur. Deux écrans écrivent la
même colonne (le formulaire de création et celui d'édition de « Mon agence ») et deux routes
la reçoivent : `POST /agencies` et `PUT /agencies/{slug}`.
"""
import pytest
from semsar_auth import Principal, get_principal

from app.main import app
from app.models import Agency

SALE = '<p class="MsoNormal">Agence <strong>de quartier</strong></p><script>alert(1)</script>'
PROPRE = "<p>Agence <strong>de quartier</strong></p>"


@pytest.fixture
def sans_agence(db_session):
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=["agency_admin"], agency_id=None, is_superadmin=False,
        features=[], claims={})
    yield
    app.dependency_overrides.pop(get_principal, None)


@pytest.fixture
def agence(db_session):
    a = Agency(id=4, name="Immobilière Anfa", slug="immobiliere-anfa",
               email="contact@anfa.ma", description="Ancienne description", settings={})
    db_session.add(a)
    db_session.commit()
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=["agency_admin"], agency_id=4, is_superadmin=False,
        features=[], claims={})
    yield a
    app.dependency_overrides.pop(get_principal, None)


def test_creation_sanitises_the_description(client, sans_agence):
    r = client.post("/agencies", json={"name": "Immobilière Anfa", "email": "c@anfa.ma",
                                       "description": SALE, "address": "12 bd Anfa < 14"})

    assert r.status_code == 201
    assert r.json()["agency"]["description"] == PROPRE
    # L'adresse reste du texte brut : l'assainir ferait apparaître des entités à l'écran.
    assert r.json()["agency"]["address"] == "12 bd Anfa < 14"


def test_update_sanitises_the_description(client, agence):
    r = client.put(f"/agencies/{agence.slug}", json={"description": SALE})

    assert r.status_code == 200
    assert r.json()["agency"]["description"] == PROPRE
    # Le nom reste du texte brut.
    r = client.put(f"/agencies/{agence.slug}", json={"name": "Anfa < Immo & Co"})
    assert r.json()["agency"]["name"] == "Anfa < Immo & Co"
    # L'éditeur vidé (`<p><br></p>`) rend la colonne NULL, pas une chaîne « non vide ».
    r = client.put(f"/agencies/{agence.slug}", json={"description": "<p><br></p>"})
    assert r.json()["agency"]["description"] is None
