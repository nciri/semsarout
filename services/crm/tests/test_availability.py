"""Disponibilités de l'agent : créneaux hebdomadaires servant à proposer des visites."""


def test_vide_par_defaut_puis_enregistre_et_relit(client):
    assert client.get("/backoffice/visits/availability").json() == {"slots": []}

    slots = [{"weekday": 1, "start_time": "09:00", "end_time": "12:30", "slot_minutes": 30},
             {"weekday": 0, "start_time": "14:00", "end_time": "18:00", "slot_minutes": 60}]
    assert client.put("/backoffice/visits/availability", json={"slots": slots}).status_code == 200

    # Relecture triée par jour puis par heure : l'agenda se lit dans l'ordre de la semaine.
    got = client.get("/backoffice/visits/availability").json()["slots"]
    assert [s["weekday"] for s in got] == [0, 1]
    assert got[0]["start_time"] == "14:00" and got[0]["slot_minutes"] == 60


def test_enregistrer_remplace_la_liste_entiere(client):
    client.put("/backoffice/visits/availability", json={"slots": [
        {"weekday": 1, "start_time": "09:00", "end_time": "12:00", "slot_minutes": 30},
        {"weekday": 2, "start_time": "09:00", "end_time": "12:00", "slot_minutes": 30}]})
    client.put("/backoffice/visits/availability", json={"slots": [
        {"weekday": 3, "start_time": "10:00", "end_time": "11:00", "slot_minutes": 15}]})

    got = client.get("/backoffice/visits/availability").json()["slots"]
    assert got == [{"weekday": 3, "start_time": "10:00", "end_time": "11:00", "slot_minutes": 15}]


def test_refuse_les_creneaux_incoherents(client):
    bad = [
        {"weekday": 9, "start_time": "09:00", "end_time": "10:00", "slot_minutes": 30},
        {"weekday": 1, "start_time": "25:00", "end_time": "26:00", "slot_minutes": 30},
        {"weekday": 1, "start_time": "18:00", "end_time": "09:00", "slot_minutes": 30},
        {"weekday": 1, "start_time": "09:00", "end_time": "10:00", "slot_minutes": 5},
        {"weekday": 1, "start_time": "09:00", "end_time": "10:00", "slot_minutes": 999},
    ]
    for slot in bad:
        r = client.put("/backoffice/visits/availability", json={"slots": [slot]})
        assert r.status_code == 400, slot

    # Une saisie refusée ne doit rien laisser derrière elle.
    assert client.get("/backoffice/visits/availability").json() == {"slots": []}


def test_une_visite_reste_accessible_par_son_identifiant(client, db_session):
    """La route « availability » ne doit pas masquer /backoffice/visits/{id}."""
    from datetime import datetime

    from app.models import Visit

    v = Visit(scheduled_at=datetime(2026, 9, 30, 10, 0), agency_id=1, visitor_name="Salma")
    db_session.add(v)
    db_session.commit()
    assert client.get(f"/backoffice/visits/{v.id}").status_code == 200
