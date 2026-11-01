"""Équipes d'exploitation : rattachement d'un bien, héritage par les tâches, performance.

Les équipes viennent d'identity : elles sont simulées ici, car les tester reviendrait à
tester identity. Ce qui est vérifié, c'est ce que staymanager en fait.
"""
from datetime import datetime, timedelta

import pytest

from app import identity_client
from app.models import CleaningReport, CleaningTask, PropertyRO, PropertyTeam
from tests.conftest import AGENCY

PROPERTY = 77
OTHER_PROPERTY = 78
OTHER_AGENCY = 99
MENAGE_TEAM = 3
MAINTENANCE_TEAM = 4


@pytest.fixture(autouse=True)
def equipes(monkeypatch):
    rows = [
        {"id": MENAGE_TEAM, "agency_id": AGENCY, "name": "Ménage Gueliz", "kind": "menage",
         "color": "#1E7F4E", "description": None, "members_count": 2,
         "memberships": [{"user_id": 7, "job": "agent"}]},
        {"id": MAINTENANCE_TEAM, "agency_id": AGENCY, "name": "Maintenance", "kind": "maintenance",
         "color": None, "description": None, "members_count": 1, "memberships": []},
    ]
    monkeypatch.setattr(identity_client, "teams", lambda agency_id: list(rows))
    monkeypatch.setattr(identity_client, "team_ids", lambda agency_id: {r["id"] for r in rows})
    return rows


@pytest.fixture
def biens(db_session):
    db_session.add_all([
        PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Appartement Gueliz"),
        PropertyRO(id=OTHER_PROPERTY, agency_id=AGENCY, title="Riad Médina"),
    ])
    db_session.commit()


def test_la_liste_rend_les_equipes_et_les_biens_a_affecter(client, biens):
    body = client.get("/backoffice/sejours/equipes").json()
    assert [t["name"] for t in body["teams"]] == ["Ménage Gueliz", "Maintenance"]
    assert body["teams"][0]["performance"] == {"planned": 0, "done": 0, "late": 0,
                                               "urgent_reports": 0, "avg_minutes": None}
    assert [p["property_title"] for p in body["properties"]] == ["Appartement Gueliz", "Riad Médina"]
    assert all(p["team_id"] is None for p in body["properties"])


def test_affecter_un_bien_a_une_equipe_puis_retirer(client, biens, db_session):
    r = client.put(f"/backoffice/sejours/equipes/{PROPERTY}", json={"team_id": MENAGE_TEAM})
    assert r.status_code == 200
    assert db_session.query(PropertyTeam).count() == 1

    r = client.put(f"/backoffice/sejours/equipes/{PROPERTY}", json={"team_id": None})
    assert r.json()["team_id"] is None
    assert db_session.query(PropertyTeam).count() == 0


def test_une_equipe_inconnue_est_refusee(client, biens):
    r = client.put(f"/backoffice/sejours/equipes/{PROPERTY}", json={"team_id": 999})
    assert r.status_code == 400


def test_un_bien_d_une_autre_agence_est_introuvable(client, db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=OTHER_AGENCY, title="Villa voisine"))
    db_session.commit()
    r = client.put(f"/backoffice/sejours/equipes/{PROPERTY}", json={"team_id": MENAGE_TEAM})
    assert r.status_code == 404


def test_le_changement_d_equipe_suit_les_taches_a_venir_mais_pas_l_historique(client, biens, db_session):
    done = CleaningTask(agency_id=AGENCY, property_id=PROPERTY, scheduled_date=datetime(2026, 1, 5).date(),
                        status="done", team_id=MENAGE_TEAM)
    todo = CleaningTask(agency_id=AGENCY, property_id=PROPERTY, scheduled_date=datetime(2026, 12, 5).date(),
                        status="pending", team_id=MENAGE_TEAM)
    db_session.add_all([done, todo])
    db_session.commit()

    client.put(f"/backoffice/sejours/equipes/{PROPERTY}", json={"team_id": MAINTENANCE_TEAM})
    db_session.expire_all()
    assert db_session.get(CleaningTask, done.id).team_id == MENAGE_TEAM
    assert db_session.get(CleaningTask, todo.id).team_id == MAINTENANCE_TEAM


def test_une_tache_nee_d_un_depart_herite_de_l_equipe_du_bien(client, biens, db_session):
    client.put(f"/backoffice/sejours/equipes/{PROPERTY}", json={"team_id": MENAGE_TEAM})
    arrivee = (datetime.utcnow() + timedelta(days=2)).date().isoformat()
    depart = (datetime.utcnow() + timedelta(days=5)).date().isoformat()
    client.post("/backoffice/sejours", json={"property_id": PROPERTY, "check_in": arrivee,
                                             "check_out": depart, "guest_name": "Salma Idrissi"})

    client.get("/backoffice/sejours/menage")  # la lecture du planning crée les tâches dues
    task = db_session.query(CleaningTask).filter(CleaningTask.property_id == PROPERTY).first()
    assert task is not None
    assert task.team_id == MENAGE_TEAM


def test_la_performance_compte_le_fait_le_retard_et_les_rapports_urgents(client, biens, db_session):
    today = datetime.utcnow().date()
    done = CleaningTask(agency_id=AGENCY, property_id=PROPERTY, scheduled_date=today,
                        status="done", team_id=MENAGE_TEAM,
                        started_at=datetime(2026, 10, 1, 9, 0),
                        completed_at=datetime(2026, 10, 1, 10, 30))
    late = CleaningTask(agency_id=AGENCY, property_id=PROPERTY, team_id=MENAGE_TEAM,
                        scheduled_date=today - timedelta(days=2), status="pending")
    db_session.add_all([done, late])
    db_session.flush()
    db_session.add(CleaningReport(task_id=done.id, kind="issue", text_note="Fuite", is_urgent=True))
    db_session.commit()

    team = next(t for t in client.get("/backoffice/sejours/equipes").json()["teams"]
                if t["id"] == MENAGE_TEAM)
    assert team["performance"] == {"planned": 2, "done": 1, "late": 1, "urgent_reports": 1,
                                   "avg_minutes": 90}


def test_le_planning_du_menage_se_filtre_par_equipe(client, biens, db_session):
    today = datetime.utcnow().date()
    db_session.add_all([
        CleaningTask(agency_id=AGENCY, property_id=PROPERTY, scheduled_date=today,
                     status="pending", team_id=MENAGE_TEAM),
        CleaningTask(agency_id=AGENCY, property_id=OTHER_PROPERTY, scheduled_date=today,
                     status="pending", team_id=MAINTENANCE_TEAM),
    ])
    db_session.commit()

    body = client.get(f"/backoffice/sejours/menage?team_id={MENAGE_TEAM}").json()
    assert [t["property_id"] for t in body["tasks"]] == [PROPERTY]
