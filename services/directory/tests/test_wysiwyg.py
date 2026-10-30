"""Notes d'un ordre de service : saisie WYSIWYG, donc du HTML stocké et assaini à l'écriture.

Deux écrans écrivent la même colonne (le formulaire de création de la liste et la fiche, qui
enregistre à la sortie du champ), et la valeur part dans l'**ordre de service par email** à
l'artisan via `work_order.created`. Un chemin non assaini, ou une charge d'événement
construite depuis la donnée brute, met du HTML arbitraire dans cet email.
"""
import json

from semsar_events.outbox import OutboxEvent

from app.models import Artisan, WorkOrder

SALE = '<ul><li>Robinet <em>HS</em></li></ul><script>alert(1)</script>'
PROPRE = "<ul><li>Robinet <em>HS</em></li></ul>"


def test_creation_sanitises_the_notes_and_the_event_payload(client, db_session):
    artisan = Artisan(agency_id=4, name="Omar Plombier", trade="plombier",
                      email="omar@example.ma")
    db_session.add(artisan)
    db_session.commit()

    r = client.post("/backoffice/work-orders",
                    json={"title": "Fuite cuisine < évier", "trade": "plombier",
                          "artisan_id": artisan.id, "notes": SALE})

    assert r.status_code == 201
    assert r.json()["work_order"]["notes"] == PROPRE
    # Le titre reste du texte brut : l'assainir ferait apparaître des entités à l'écran.
    assert r.json()["work_order"]["title"] == "Fuite cuisine < évier"

    event = db_session.query(OutboxEvent).order_by(OutboxEvent.id.desc()).first()
    payload = event.payload if isinstance(event.payload, dict) else json.loads(event.payload)
    assert payload["notes"] == PROPRE


def test_update_sanitises_the_notes(client, db_session):
    wo = WorkOrder(agency_id=4, title="Intervention", trade="plombier", status="requested")
    db_session.add(wo)
    db_session.commit()

    r = client.put(f"/backoffice/work-orders/{wo.id}", json={"notes": SALE})
    assert r.status_code == 200
    assert r.json()["work_order"]["notes"] == PROPRE

    # L'éditeur vidé (`<p><br></p>`) rend la colonne NULL, pas une chaîne « non vide ».
    r = client.put(f"/backoffice/work-orders/{wo.id}", json={"notes": "<p><br></p>"})
    assert r.json()["work_order"]["notes"] is None
