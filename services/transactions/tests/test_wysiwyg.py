"""Notes d'un dossier : saisie WYSIWYG, et la recherche doit ignorer le balisage.

C'est le cas que l'étape 1 avait signalé comme le plus net du balayage : `?q=` filtrait en
SQL `Transaction.notes.ilike('%terme%')`. Une fois la colonne en HTML, une recherche sur
« p » remontait **toutes** les transactions annotées, et une recherche sur « bon de visite »
ne trouvait plus « bon de <b>visite</b> ».

Le choix retenu : une colonne dérivée `notes_text`, écrite par le même point que `notes`, sur
laquelle porte la recherche. Pas une projection à la volée, parce qu'il n'y a pas de
`regexp_replace` portable (les tests tournent sur SQLite) ; pas un filtre en Python, parce
que `count()` et la pagination sont faits en base et seraient faux.
"""
from app.models import Transaction

SALE = '<p class="MsoNormal">Bon de <b>visite</b> signé</p><script>alert(1)</script>'
PROPRE = "<p>Bon de <b>visite</b> signé</p>"


def _bien(db_session, pid=1):
    from app.models import PropertyRO
    if db_session.get(PropertyRO, pid) is None:
        db_session.add(PropertyRO(id=pid, title="Riad Médina", city="Marrakech"))
        db_session.commit()
    return pid


def _create(client, **over):
    body = {"transaction_type": "sale", "stage": "contact", "client_id": 1, "property_id": 1}
    body.update(over)
    r = client.post("/backoffice/transactions", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_notes_are_sanitised_on_create_and_update(client, db_session):
    _bien(db_session)
    created = _create(client, notes=SALE)
    assert created["notes"] == PROPRE

    updated = client.put(f"/backoffice/transactions/{created['id']}",
                         json={"notes": '<ul><li>Compromis</li></ul><iframe src="x"></iframe>'})
    assert updated.json()["notes"] == "<ul><li>Compromis</li></ul>"
    # `lost_reason` reste du texte brut : l'assainir ferait apparaître des entités à l'écran.
    plain = client.put(f"/backoffice/transactions/{created['id']}",
                       json={"lost_reason": "Budget < 900000 & cash"})
    assert plain.json()["lost_reason"] == "Budget < 900000 & cash"

    # L'éditeur vidé (`<p><br></p>`) rend les deux colonnes NULL.
    vide = client.put(f"/backoffice/transactions/{created['id']}", json={"notes": "<p><br></p>"})
    assert vide.json()["notes"] is None
    assert db_session.get(Transaction, created["id"]).notes_text is None


def test_a_search_on_a_letter_that_only_appears_inside_a_tag_name_finds_nothing(client, db_session):
    """Le cas exact signalé par l'étape 1.

    Le texte visible est choisi pour ne contenir **aucune** des lettres cherchées : chaque
    marqueur n'existe que dans le balisage. Sans la colonne dérivée, « p » remontait toutes
    les transactions annotées.
    """
    _bien(db_session)
    _create(client, notes='<ul><li>Garage</li></ul><p class="MsoNormal">Jardin</p>')
    _create(client, notes=None)

    for marqueur in ("p", "ul", "li", "class", "MsoNormal", "div", "strong"):
        assert client.get(f"/backoffice/transactions?q={marqueur}").json()["total"] == 0, marqueur

    # Le texte visible, lui, reste trouvable.
    assert client.get("/backoffice/transactions?q=Jardin").json()["total"] == 1


def test_a_search_crosses_the_markup_of_a_phrase_it_cuts(client, db_session):
    """L'autre moitié du même bug : « bon de visite » doit trouver « bon de <b>visite</b> »."""
    _bien(db_session)
    created = _create(client, notes=SALE)

    found = client.get("/backoffice/transactions?q=bon de visite").json()
    assert [t["id"] for t in found["transactions"]] == [created["id"]]
    assert found["total"] == 1

    # Et la référence reste cherchable comme avant.
    assert client.get(f"/backoffice/transactions?q={created['reference']}").json()["total"] == 1


def test_the_text_projection_follows_every_write(client, db_session):
    _bien(db_session)
    created = _create(client, notes="<p>Première note</p>")
    assert db_session.get(Transaction, created["id"]).notes_text == "Première note"

    client.put(f"/backoffice/transactions/{created['id']}",
               json={"notes": "<p>Seconde</p><ul><li>note</li></ul>"})
    db_session.expire_all()
    assert db_session.get(Transaction, created["id"]).notes_text == "Seconde\nnote"
    # La recherche suit la réécriture : l'ancien terme ne remonte plus.
    assert client.get("/backoffice/transactions?q=Première").json()["total"] == 0
    assert client.get("/backoffice/transactions?q=Seconde").json()["total"] == 1
