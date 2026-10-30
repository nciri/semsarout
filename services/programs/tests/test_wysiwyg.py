"""Champs WYSIWYG du service programs : `Program.description`, `ProgramLot.description`,
et le message du formulaire de contact (qui devient `crm.Lead.message`).

Le balisage retenu est épinglé charge par charge : vérifier seulement l'absence de `<script>`
laisserait passer une sanitisation qui mange `<strong>`.
"""
import pytest
from semsar_auth import Principal, get_principal
from semsar_events.outbox import OutboxEvent

from app.main import app
from app.models import Program, ProgramLot, ProgramPlan

SALE = '<p class="MsoNormal">Vue <strong>mer</strong></p><script>alert(1)</script>'
PROPRE = "<p>Vue <strong>mer</strong></p>"


@pytest.fixture(autouse=True)
def _agency_principal():
    """Les écritures de programme exigent une agence : le jeton est posé ici, pas en en-tête."""
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="1", roles=["agency_admin"], agency_id=1, is_superadmin=False, features=[], claims={})
    yield
    app.dependency_overrides.pop(get_principal, None)


def _last_event(db_session):
    import json
    msg = db_session.query(OutboxEvent).order_by(OutboxEvent.id.desc()).first()
    return msg.payload if isinstance(msg.payload, dict) else json.loads(msg.payload)


def _program(db_session, agency_id=1, status="active"):
    p = Program(name="Résidence A", slug="residence-a", agency_id=agency_id,
                created_by_id=1, status=status)
    db_session.add(p)
    db_session.commit()
    return p


def _lot(db_session, program):
    plan = ProgramPlan(program_id=program.id, name="Masse")
    db_session.add(plan)
    db_session.flush()
    lot = ProgramLot(program_id=program.id, plan_id=plan.id, reference="L1")
    db_session.add(lot)
    db_session.commit()
    return plan, lot


def test_program_description_is_sanitised_on_update(client, db_session):
    p = _program(db_session)
    r = client.put(f"/programs/{p.id}", json={"description": SALE})
    assert r.status_code == 200
    assert r.json()["program"]["description"] == PROPRE
    # Le nom reste du texte brut : l'assainir ferait apparaître des entités à l'écran.
    r = client.put(f"/programs/{p.id}", json={"name": "Résidence A < B & C"})
    assert r.json()["program"]["name"] == "Résidence A < B & C"
    # L'éditeur vidé (`<p><br></p>`) rend la colonne NULL, pas une chaîne « non vide ».
    r = client.put(f"/programs/{p.id}", json={"description": "<p><br></p>"})
    assert r.json()["program"]["description"] is None


def test_lot_description_is_sanitised_on_update(client, db_session):
    p = _program(db_session)
    _, lot = _lot(db_session, p)
    r = client.put(f"/programs/{p.id}/lots/{lot.id}", json={"description": SALE})
    assert r.status_code == 200
    assert r.json()["lot"]["description"] == PROPRE
    # La référence reste du texte brut.
    r = client.put(f"/programs/{p.id}/lots/{lot.id}", json={"reference": "L<1> & L2"})
    assert r.json()["lot"]["reference"] == "L<1> & L2"


def test_contact_message_is_sanitised_and_the_server_prefix_is_its_own_paragraph(client, db_session):
    """Le préfixe du serveur était du texte collé devant le message. Si le message est du
    HTML, il doit être un paragraphe à part — et le nom du programme y être échappé, sinon
    un nom contenant « < » casse le balisage du message."""
    p = _program(db_session)
    p.name = "Résidence <A> & B"
    db_session.commit()

    r = client.post(f"/programs/{p.id}/contact",
                    json={"name": "Hind", "phone": "0612345678",
                          "email": "h@example.ma", "message": SALE})
    assert r.status_code == 201

    assert _last_event(db_session)["message"] == (
        "<p>[Programme: Résidence &lt;A&gt; &amp; B]</p>" + PROPRE)


def test_lot_interest_message_keeps_the_lot_references_in_the_prefix(client, db_session):
    p = _program(db_session)
    _, lot = _lot(db_session, p)

    r = client.post(f"/programs/{p.id}/lots/interest",
                    json={"name": "Hind", "phone": "0612345678", "lot_ids": [lot.id],
                          "message": "<p>Je veux <em>celui-là</em></p>"})
    assert r.status_code == 201

    assert _last_event(db_session)["message"] == (
        "<p>[Programme: Résidence A — Lots: L1]</p><p>Je veux <em>celui-là</em></p>")
