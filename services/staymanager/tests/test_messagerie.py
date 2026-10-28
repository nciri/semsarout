"""Messagerie de séjour : gabarits de l'agence, moment d'envoi, destinataire, cloisonnement."""
from datetime import datetime, timedelta

import pytest

from app import agency_client, messages
from app.models import PropertyRO, StayManagerReservation, StayMessage, StayMessageTemplate
from semsar_common import get_settings
from tests.conftest import AGENCY

PROPERTY = 42
TOKEN = {"x-internal-token": get_settings().internal_token}


@pytest.fixture(autouse=True)
def _agency_name(monkeypatch):
    monkeypatch.setattr(agency_client, "name_of", lambda agency_id: "Agence Anfa")


@pytest.fixture
def seeded(db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Riad Médina", reference="R-1"))
    db_session.commit()
    return db_session


def _stay(db, *, days_to_check_in=1, email="voyageur@example.com", agency_id=AGENCY):
    now = datetime.utcnow()
    res = StayManagerReservation(
        agency_id=agency_id, property_id=PROPERTY, source="ical", platform="airbnb",
        check_in=now + timedelta(days=days_to_check_in),
        check_out=now + timedelta(days=days_to_check_in + 3), nights=3,
        guest_name="Salma Bennani", guest_email=email, status="confirmed",
        synced_at=now)
    db.add(res)
    db.commit()
    return res


def _template(client, **over):
    body = {"name": "Bienvenue", "trigger": "before_check_in", "offset_hours": 24,
            "subject": "Votre arrivée à {{property_title}}",
            "body": "Bonjour {{guest_name}},\n\nArrivée le {{check_in}}.\n\n{{agency_name}}"}
    body.update(over)
    return client.post("/backoffice/sejours/messages/modeles", json=body)


def test_rendu_des_variables():
    values = {"guest_name": "Salma", "property_title": "Riad"}
    assert messages.render("Bonjour {{guest_name}} — {{property_title}}", values) == "Bonjour Salma — Riad"


def test_variable_inconnue_reste_visible_et_est_refusee(client, seeded):
    # Laisser la faute visible plutôt que la remplacer par du vide : l'agence doit la voir.
    assert messages.render("Prix : {{total_price}}", {"guest_name": "S"}) == "Prix : {{total_price}}"
    r = _template(client, body="Prix : {{total_price}}")
    assert r.status_code == 400
    assert "total_price" in r.json()["error"]


def test_declencheur_et_delai_bornes(client, seeded):
    assert _template(client, trigger="un_jour_peut_etre").status_code == 400
    assert _template(client, offset_hours=10_000).status_code == 400
    assert _template(client, name="").status_code == 400


def test_crud_des_modeles(client, seeded):
    created = _template(client)
    assert created.status_code == 201
    tpl_id = created.json()["template"]["id"]

    listed = client.get("/backoffice/sejours/messages/modeles").json()
    assert [t["name"] for t in listed["templates"]] == ["Bienvenue"]
    assert "guest_name" in listed["placeholders"]

    updated = client.put(f"/backoffice/sejours/messages/modeles/{tpl_id}",
                         json={"name": "Veille d'arrivée", "trigger": "before_check_in",
                               "offset_hours": 48, "subject": "À demain",
                               "body": "Bonjour {{guest_name}}"})
    assert updated.json()["template"]["offset_hours"] == 48

    assert client.delete(f"/backoffice/sejours/messages/modeles/{tpl_id}").status_code == 200
    assert client.get("/backoffice/sejours/messages/modeles").json()["templates"][0]["active"] is False


def test_modele_d_une_autre_agence_est_invisible(client, seeded, db_session):
    db_session.add(StayMessageTemplate(agency_id=AGENCY + 1, name="Autre", trigger_event="on_booking",
                                       subject="x", body="y"))
    db_session.commit()
    assert client.get("/backoffice/sejours/messages/modeles").json()["templates"] == []
    assert client.put("/backoffice/sejours/messages/modeles/1",
                      json={"name": "n", "trigger": "on_booking", "subject": "s",
                            "body": "b"}).status_code == 404


def test_message_du_prepare_avec_variables_remplacees(client, seeded):
    _stay(seeded, days_to_check_in=1)   # arrivée demain, modèle J-24 h → dû maintenant
    _template(client)
    due = client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"]
    assert len(due) == 1
    assert due[0]["subject"] == "Votre arrivée à Riad Médina"
    assert due[0]["body"].startswith("Bonjour Salma Bennani,")
    assert "Agence Anfa" in due[0]["body"]
    assert due[0]["recipient"] == "voyageur@example.com"


def test_message_non_du_tant_que_l_echeance_n_est_pas_atteinte(client, seeded):
    _stay(seeded, days_to_check_in=10)
    _template(client)
    assert client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"] == []


def test_sans_email_le_message_attend_la_saisie_de_l_agence(client, seeded):
    stay = _stay(seeded, days_to_check_in=1, email=None)
    _template(client)
    assert client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"] == []
    journal = client.get("/backoffice/sejours/messages").json()
    assert journal["no_recipient"] == 1
    assert journal["messages"][0]["status"] == "no_recipient"

    patched = client.patch(f"/backoffice/sejours/{stay.id}/contact",
                           json={"guest_email": "tardif@example.com"})
    assert patched.json()["stay"]["id"] == stay.id
    assert client.patch(f"/backoffice/sejours/{stay.id}/contact",
                        json={"guest_email": "pas-une-adresse"}).status_code == 400


def test_un_seul_message_par_modele_et_par_sejour(client, seeded):
    _stay(seeded, days_to_check_in=1)
    _template(client)
    client.get("/internal/sejours/messages/due", headers=TOKEN)
    assert len(client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"]) == 1
    assert seeded.query(StayMessage).count() == 1


def test_verdict_de_l_ordonnanceur_ferme_le_message(client, seeded):
    _stay(seeded, days_to_check_in=1)
    _template(client)
    msg_id = client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"][0]["id"]
    assert client.post(f"/internal/sejours/messages/{msg_id}/sent", json={}, headers=TOKEN).status_code == 200
    assert client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"] == []
    assert client.get("/backoffice/sejours/messages").json()["messages"][0]["status"] == "sent"


def test_echec_d_envoi_est_journalise(client, seeded):
    _stay(seeded, days_to_check_in=1)
    _template(client)
    msg_id = client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"][0]["id"]
    client.post(f"/internal/sejours/messages/{msg_id}/sent",
                json={"error": "SMTP refusé"}, headers=TOKEN)
    journal = client.get("/backoffice/sejours/messages").json()["messages"][0]
    assert (journal["status"], journal["error"]) == ("failed", "SMTP refusé")


def test_modele_du_bien_remplace_le_modele_general(client, seeded):
    _stay(seeded, days_to_check_in=1)
    _template(client, name="Général")
    _template(client, name="Ce bien", property_id=PROPERTY, subject="Arrivée au riad")
    due = client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"]
    assert [m["subject"] for m in due] == ["Arrivée au riad"]


def test_message_tardif_est_abandonne(client, seeded):
    # Arrivée passée de plus de deux jours : le message n'a plus de sens, on ne l'envoie pas.
    _stay(seeded, days_to_check_in=-5)
    _template(client)
    assert client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"] == []


def test_jeton_interne_exige(client, seeded):
    assert client.get("/internal/sejours/messages/due").status_code == 403


def test_adresse_multiple_ou_bizarre_est_refusee(client, seeded):
    stay = _stay(seeded, days_to_check_in=1, email=None)
    for bad in ("a@example.com, b@example.com", "a@example.com;b@example.com",
                "Salma <a@example.com>", "a@example.com\nbcc: c@example.com",
                "sans-arobase", "a@localdomain"):
        assert client.patch(f"/backoffice/sejours/{stay.id}/contact",
                            json={"guest_email": bad}).status_code == 400, bad
    assert client.patch(f"/backoffice/sejours/{stay.id}/contact",
                        json={"guest_email": "salma@example.com"}).status_code == 200


def test_objet_trop_long_est_tronque(client, seeded):
    _stay(seeded, days_to_check_in=1)
    # Le rendu dépasse la colonne (200) : il doit être coupé, pas faire échouer la fournée.
    _template(client, subject="A" * 190 + " {{property_title}}")
    due = client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"]
    assert len(due[0]["subject"]) == messages.SUBJECT_MAX


def test_un_message_qui_annonce_le_code_attend_que_le_code_existe(client, seeded):
    from app.models import PropertyAccess, StayAccessCode

    stay = _stay(seeded, days_to_check_in=1)
    _template(client, name="Code d'entrée",
              subject="Votre code pour {{property_title}}",
              body="Code : {{access_code}}\n\n{{access_instructions}}")
    assert client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"] == []

    seeded.add(PropertyAccess(agency_id=AGENCY, property_id=PROPERTY, mode="manual",
                              instructions="Boîte à clés à droite"))
    seeded.add(StayAccessCode(agency_id=AGENCY, reservation_id=stay.id, mode="manual",
                              code="4821", status="active"))
    seeded.commit()
    due = client.get("/internal/sejours/messages/due", headers=TOKEN).json()["messages"]
    assert "Code : 4821" in due[0]["body"]
    assert "Boîte à clés à droite" in due[0]["body"]
