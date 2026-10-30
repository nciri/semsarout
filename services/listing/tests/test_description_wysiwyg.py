"""Description d'un bien : saisie WYSIWYG, donc du HTML stocké et assaini à l'écriture.

C'est le champ texte le plus exposé du produit : la fiche publique d'un bien l'affiche à
n'importe quel visiteur, et il est écrit depuis trois écrans (dossier de vente public,
tableau de bord, back-office). Un seul chemin d'écriture non assaini suffit à faire un XSS
stocké public.
"""
import app.main as m
from app.models import Property
from semsar_auth import Principal, get_principal

AGENCY = 3
OWNER = 11

SALE = '<p class="MsoNormal">Salon <strong>refait</strong></p><script>alert(1)</script>'
PROPRE = "<p>Salon <strong>refait</strong></p>"


def _as_agent():
    m.app.dependency_overrides[get_principal] = lambda: Principal(
        sub=str(OWNER), roles=["agent"], agency_id=AGENCY, is_superadmin=False,
        features=[], claims={})


def _payload(**over):
    body = {"title": "Riad Médina", "property_type": "villa", "transaction_type": "sale",
            "price": 2500000, "city": "Marrakech", "surface": 180, "description": SALE}
    body.update(over)
    return body


def test_every_write_path_sanitises_the_description(client):
    _as_agent()
    try:
        created = client.post("/properties", json=_payload()).json()["property"]
        assert created["description"] == PROPRE

        updated = client.put(f"/properties/{created['id']}",
                             json={"description": SALE}).json()["property"]
        assert updated["description"] == PROPRE

        bo = client.post("/backoffice/properties", json=_payload()).json()
        assert bo["description"] == PROPRE
        assert client.put(f"/backoffice/properties/{bo['id']}",
                          json={"description": SALE}).json()["description"] == PROPRE

        # Le titre reste du texte brut : l'assainir ferait apparaître des entités à l'écran.
        assert client.put(f"/properties/{created['id']}",
                          json={"title": "Duplex < 200 m² & terrasse"}
                          ).json()["property"]["title"] == "Duplex < 200 m² & terrasse"

        # Un éditeur vidé rend `<p><br></p>` : du HTML valide, mais une description absente.
        assert client.put(f"/properties/{created['id']}",
                          json={"description": "<p><br></p>"}).json()["property"]["description"] is None
    finally:
        m.app.dependency_overrides.pop(get_principal, None)


def test_the_public_sale_request_path_sanitises_too(client, db_session):
    """Cinquième chemin d'écriture, et le plus exposé : l'auteur de la description sur
    `/vendre` est un **client en libre-service**, pas un agent. Le bien créé est `pending`,
    il est ouvert par un agent dans l'éditeur du back-office, puis publié sur la fiche
    publique — où il est rendu en HTML pour n'importe quel visiteur. C'est aussi le
    constructeur `Property(...)` le plus long du service, donc l'endroit où un refactor
    laisserait tomber l'appel au nettoyage sans que rien ne le signale."""
    _as_agent()
    try:
        r = client.post("/sale-requests", json={
            "property": {"property_type": "villa", "city": "Marrakech", "surface": 180,
                         "description": SALE},
            "desired_price": 2500000,
            "photos": ["https://cdn.semsarout.com/a.jpg"],
        })
        assert r.status_code == 201, r.text
        prop = db_session.query(Property).order_by(Property.id.desc()).first()
        assert prop.description == PROPRE
        assert prop.status == "pending"
    finally:
        m.app.dependency_overrides.pop(get_principal, None)


def test_description_length_measures_the_text_not_the_markup(client):
    """L'indicateur de complétude d'une annonce compte des caractères lisibles : compter le
    balisage ferait passer une description vide pour une description fournie."""
    _as_agent()
    try:
        client.post("/backoffice/properties",
                    json=_payload(description="<p><strong>Six.</strong></p>"))
        rows = client.get("/backoffice/properties/insights").json()["properties"]
        assert rows[0]["description_length"] == len("Six.")
    finally:
        m.app.dependency_overrides.pop(get_principal, None)
