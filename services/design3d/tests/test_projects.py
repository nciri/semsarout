def _create(client, headers, **over):
    body = {"target_type": "property", "target_id": 42, "title": "Réno A"}
    body.update(over)
    return client.post("/design3d/projects", json=body, headers=headers)


def test_requires_entitlement(client, headers):
    r = _create(client, headers(features=()))
    assert r.status_code == 403


def test_create_makes_default_level_and_keeps_client_id(client, headers):
    r = _create(client, headers(), id="a" * 32)
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == "a" * 32 and body["owner_id"] == 7
    assert len(body["levels"]) == 1 and body["levels"][0]["name"] == "RDC"
    assert body["levels"][0]["geometry"] == {"walls": [], "rooms": [], "openings": []}


def test_client_id_taken_by_other_owner_is_409(client, headers):
    assert _create(client, headers(user_id=1), id="b" * 32).status_code == 201
    assert _create(client, headers(user_id=2), id="b" * 32).status_code == 409


def test_list_is_scoped(client, headers):
    _create(client, headers(user_id=1))
    _create(client, headers(user_id=2))
    r = client.get("/design3d/projects", params={"target_type": "property", "target_id": 42}, headers=headers(user_id=1))
    assert len(r.json()["projects"]) == 1


def test_agency_colleague_can_read_and_edit(client, headers):
    pid = _create(client, headers(user_id=1, agency_id=9)).json()["id"]
    r = client.get(f"/design3d/projects/{pid}", headers=headers(user_id=2, agency_id=9))
    assert r.status_code == 200
    assert client.put(f"/design3d/projects/{pid}", json={"title": "B"}, headers=headers(user_id=2, agency_id=9)).status_code == 200


def test_other_agency_is_403(client, headers):
    pid = _create(client, headers(user_id=1, agency_id=9)).json()["id"]
    assert client.get(f"/design3d/projects/{pid}", headers=headers(user_id=3, agency_id=10)).status_code == 403


def test_particulier_scoped_to_owner(client, headers):
    pid = _create(client, headers(user_id=1)).json()["id"]
    assert client.get(f"/design3d/projects/{pid}", headers=headers(user_id=2)).status_code == 403


def test_add_and_delete_level_last_protected(client, headers):
    pid = _create(client, headers()).json()["id"]
    lv = client.post(f"/design3d/projects/{pid}/levels", json={"name": "Étage 1"}, headers=headers()).json()
    assert lv["position"] == 1
    assert client.delete(f"/design3d/levels/{lv['id']}", headers=headers()).status_code == 204
    only = client.get(f"/design3d/projects/{pid}", headers=headers()).json()["levels"][0]["id"]
    assert client.delete(f"/design3d/levels/{only}", headers=headers()).status_code == 400


def test_status_ready_emits_event_and_delete_works(client, headers, db_session):
    from semsar_events.outbox import OutboxEvent
    pid = _create(client, headers()).json()["id"]
    assert client.put(f"/design3d/projects/{pid}", json={"status": "ready"}, headers=headers()).status_code == 200
    assert db_session.query(OutboxEvent).filter_by(event_type="design3d.project.ready").count() == 1
    assert client.delete(f"/design3d/projects/{pid}", headers=headers()).status_code == 204
    assert client.get(f"/design3d/projects/{pid}", headers=headers()).status_code == 404


def test_create_level_with_id_from_other_owner_project_is_409_no_leak(client, headers):
    project_a = _create(client, headers(user_id=1, agency_id=9)).json()
    level_a_id = project_a["levels"][0]["id"]
    project_b = _create(client, headers(user_id=2, agency_id=10)).json()

    r = client.post(f"/design3d/projects/{project_b['id']}/levels", json={"name": "Intrus", "id": level_a_id},
                    headers=headers(user_id=2, agency_id=10))
    assert r.status_code == 409
    body = r.json()
    assert "geometry" not in body
    assert "calibration" not in body
    assert "background_image_key" not in body


def test_liste_sans_cible_renvoie_les_projets_de_l_agence(client, headers, other_agency_client):
    client.post("/design3d/projects", headers=headers(agency_id=9),
               json={"id": "a" * 32, "target_type": "property", "target_id": 1, "title": "A"})
    other_agency_client.post("/design3d/projects",
                             json={"id": "b" * 32, "target_type": "property", "target_id": 2, "title": "B"})
    r = client.get("/design3d/projects", headers=headers(agency_id=9))
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["projects"]] == ["a" * 32]


def test_liste_avec_cible_reste_filtree(client, headers):
    client.post("/design3d/projects", headers=headers(),
               json={"id": "c" * 32, "target_type": "property", "target_id": 7, "title": "C"})
    r = client.get("/design3d/projects", params={"target_type": "property", "target_id": 8}, headers=headers())
    assert r.status_code == 200
    assert r.json()["projects"] == []


def test_liste_sans_cible_bornee_par_limit_par_defaut(client, headers):
    for i in range(51):
        client.post("/design3d/projects", headers=headers(),
                   json={"target_type": "property", "target_id": i, "title": str(i)})
    r = client.get("/design3d/projects", headers=headers())
    assert r.status_code == 200
    assert len(r.json()["projects"]) == 50


def test_liste_sans_cible_porte_les_resumes_de_niveaux_sans_geometrie(client, headers):
    """Le dialogue de reprise doit tenir en un appel, sans transporter la géométrie."""
    pid = _create(client, headers()).json()["id"]
    r = client.get("/design3d/projects", headers=headers())
    assert r.status_code == 200
    (project,) = [p for p in r.json()["projects"] if p["id"] == pid]
    assert len(project["levels"]) == 1
    assert set(project["levels"][0]) == {"id", "name", "position", "wall_height_m"}


def test_liste_avec_cible_garde_sa_forme_sans_niveaux(client, headers):
    """Les appelants qui fournissent une cible ne doivent voir aucun changement."""
    client.post("/design3d/projects", headers=headers(),
                json={"id": "d" * 32, "target_type": "property", "target_id": 42, "title": "D"})
    r = client.get("/design3d/projects", params={"target_type": "property", "target_id": 42}, headers=headers())
    assert r.status_code == 200
    (project,) = r.json()["projects"]
    assert "levels" not in project


def test_limite_hors_bornes_refusee_avant_la_base(client, headers):
    """`limit` doit être validé par l'API, pas par le moteur de base.

    SQLite ignore un LIMIT négatif (d'où des suites vertes trompeuses) alors que
    PostgreSQL, sur lequel tourne la production, le REFUSE : une requête
    malformée y produisait un 500 au lieu d'un 422. La borne haute protège
    accessoirement la réponse, qui porte désormais les résumés de niveaux.
    """
    for value in (-1, 0, 1000):
        r = client.get("/design3d/projects", params={"limit": value}, headers=headers())
        assert r.status_code == 422, f"limit={value} devrait être refusé"
    assert client.get("/design3d/projects", params={"limit": 1}, headers=headers()).status_code == 200
    assert client.get("/design3d/projects", params={"limit": 100}, headers=headers()).status_code == 200


def test_create_level_idempotent_same_project(client, headers):
    pid = _create(client, headers()).json()["id"]
    level_id = "c" * 32
    first = client.post(f"/design3d/projects/{pid}/levels", json={"name": "Étage 1", "id": level_id}, headers=headers())
    second = client.post(f"/design3d/projects/{pid}/levels", json={"name": "Étage 1", "id": level_id}, headers=headers())
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    levels = client.get(f"/design3d/projects/{pid}", headers=headers()).json()["levels"]
    assert len([lv for lv in levels if lv["id"] == level_id]) == 1
