"""Équipes métier : type d'équipe, rôle tenu dedans, appartenances multiples.

Ce que ces cas défendent : une agence range ses équipes par métier, y place quelqu'un avec
le rôle qu'il y tient, et peut prêter un membre à une seconde équipe sans le sortir de la
sienne.
"""
from werkzeug.security import generate_password_hash

import app.main as m
from app.models import AgencyRO, Team, TeamMembership, UserRO
from semsar_auth import Principal, get_principal

AGENCY = 1
OWNER = 10
AGENT = 11


def _setup(db_session):
    db_session.add(AgencyRO(id=AGENCY, owner_id=OWNER, features=[], max_seats=10, max_teams=5,
                            is_suspended=False, is_deleted=False))
    for uid, first in ((OWNER, "Nadia"), (AGENT, "Rachid")):
        db_session.add(UserRO(id=uid, email=f"u{uid}@ex.ma",
                              password_hash=generate_password_hash("x"), first_name=first,
                              last_name="Alami", tenant="semsar", agency_id=AGENCY))
    db_session.commit()


def _as_owner():
    m.app.dependency_overrides[get_principal] = lambda: Principal(
        sub=str(OWNER), roles=["agency_admin"], agency_id=AGENCY, is_superadmin=False,
        features=[], claims={})


def _teardown():
    m.app.dependency_overrides.pop(get_principal, None)


def test_une_equipe_porte_son_metier_sa_couleur_et_sa_description(client, db_session):
    _setup(db_session)
    _as_owner()
    r = client.post("/backoffice/teams", json={"name": "Ménage Gueliz", "kind": "menage",
                                               "color": "#1E7F4E", "description": "Rotation"})
    _teardown()
    assert r.status_code == 201
    team = r.json()["team"]
    assert team["kind"] == "menage"
    assert team["color"] == "#1E7F4E"
    assert team["description"] == "Rotation"


def test_un_metier_inconnu_est_refuse(client, db_session):
    _setup(db_session)
    _as_owner()
    r = client.post("/backoffice/teams", json={"name": "Équipe X", "kind": "astronautes"})
    _teardown()
    assert r.status_code == 400


def test_la_vue_d_equipe_publie_le_catalogue_des_metiers(client, db_session):
    _setup(db_session)
    _as_owner()
    body = client.get("/backoffice/team").json()
    _teardown()
    kinds = {k["kind"] for k in body["team_kinds"]}
    assert {"menage", "maintenance", "conciergerie", "commerciale", "generale"} <= kinds
    menage = next(k for k in body["team_kinds"] if k["kind"] == "menage")
    assert "blanchisserie" in menage["jobs"]
    assert menage["operations"] is True


def test_rattacher_un_renfort_sans_le_sortir_de_son_equipe(client, db_session):
    _setup(db_session)
    _as_owner()
    menage = client.post("/backoffice/teams", json={"name": "Ménage", "kind": "menage"}).json()["team"]
    maintenance = client.post("/backoffice/teams",
                              json={"name": "Maintenance", "kind": "maintenance"}).json()["team"]
    client.put(f"/backoffice/team/members/{AGENT}", json={"team_id": menage["id"]})

    r = client.post(f"/backoffice/teams/{maintenance['id']}/membres",
                    json={"user_id": AGENT, "job": "technicien"})
    body = client.get("/backoffice/team").json()
    _teardown()

    assert r.status_code == 201
    assert db_session.get(UserRO, AGENT).team_id == menage["id"]
    renfort = next(t for t in body["teams"] if t["id"] == maintenance["id"])
    assert renfort["memberships"] == [{"user_id": AGENT, "job": "technicien"}]
    assert renfort["members_count"] == 1


def test_un_role_etranger_au_metier_est_refuse(client, db_session):
    _setup(db_session)
    _as_owner()
    team = client.post("/backoffice/teams", json={"name": "Ménage", "kind": "menage"}).json()["team"]
    r = client.post(f"/backoffice/teams/{team['id']}/membres",
                    json={"user_id": AGENT, "job": "negociateur"})
    _teardown()
    assert r.status_code == 400


def test_changer_le_metier_ramene_les_roles_devenus_invalides(client, db_session):
    _setup(db_session)
    _as_owner()
    team = client.post("/backoffice/teams", json={"name": "Ménage", "kind": "menage"}).json()["team"]
    client.post(f"/backoffice/teams/{team['id']}/membres",
                json={"user_id": AGENT, "job": "blanchisserie"})
    client.put(f"/backoffice/teams/{team['id']}", json={"kind": "maintenance"})
    _teardown()

    db_session.expire_all()
    row = db_session.query(TeamMembership).filter(TeamMembership.team_id == team["id"]).one()
    assert row.job == "technicien"


def test_supprimer_l_equipe_efface_ses_appartenances(client, db_session):
    _setup(db_session)
    _as_owner()
    team = client.post("/backoffice/teams", json={"name": "Ménage", "kind": "menage"}).json()["team"]
    client.post(f"/backoffice/teams/{team['id']}/membres", json={"user_id": AGENT, "job": "agent"})
    client.delete(f"/backoffice/teams/{team['id']}")
    _teardown()

    assert db_session.query(TeamMembership).count() == 0
    assert db_session.query(Team).count() == 0


def test_la_route_interne_exige_le_jeton(client, db_session):
    _setup(db_session)
    assert client.get("/internal/teams", params={"agency_id": AGENCY}).status_code == 403
