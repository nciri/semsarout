W = {"id": "w1", "a": {"x": 0, "y": 0}, "b": {"x": 4, "y": 0}, "thickness_m": 0.2}
G1 = {"walls": [W], "rooms": [], "openings": []}
G2 = {"walls": [{**W, "b": {"x": 5, "y": 0}}], "rooms": [], "openings": []}


def _project(client, headers, owner=1, agency=9):
    r = client.post("/design3d/projects", json={"target_type": "property", "target_id": 1, "title": "P"},
                    headers=headers(user_id=owner, agency_id=agency))
    return r.json()["id"], r.json()["levels"][0]["id"]


def _put(client, headers, lid, base, geometry, **who):
    return client.put(f"/design3d/levels/{lid}", json={"base_revision": base, "geometry": geometry}, headers=headers(**who))


def test_fresh_write_increments_revision(client, headers):
    _, lid = _project(client, headers)
    r = _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    assert r.status_code == 200 and r.json()["revision"] == 1 and r.json()["shelved"] is False


def test_invalid_geometry_is_422(client, headers):
    _, lid = _project(client, headers)
    bad = {"walls": [{**W, "b": {"x": 0, "y": 0}}], "rooms": [], "openings": []}
    assert _put(client, headers, lid, 0, bad, user_id=1, agency_id=9).status_code == 422


def test_owner_stale_wins_and_shelves_colleague(client, headers):
    _, lid = _project(client, headers)
    assert _put(client, headers, lid, 0, G2, user_id=2, agency_id=9).status_code == 200   # collègue écrit d'abord (rev 1)
    r = _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)                          # propriétaire, base obsolète
    assert r.status_code == 200 and r.json()["revision"] == 2 and r.json()["shelved"] is True
    assert r.json()["geometry"] == G1
    shelf = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"]
    assert len(shelf) == 1 and shelf[0]["author_id"] == 2 and shelf[0]["geometry"] == G2


def test_owner_stale_over_own_version_does_not_shelve(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G2, user_id=1, agency_id=9)
    r = _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    assert r.json()["shelved"] is False


def test_colleague_stale_is_409_and_shelved(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    r = _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    assert r.status_code == 409 and r.json()["level"]["revision"] == 1
    shelf = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"]
    assert len(shelf) == 1 and shelf[0]["author_id"] == 2


def test_one_unreviewed_entry_per_author(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    shelf = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"]
    assert len(shelf) == 1


def test_shelf_dismiss_by_owner(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    sid = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"][0]["id"]
    assert client.post(f"/design3d/levels/{lid}/shelf/{sid}/dismiss", headers=headers(user_id=1, agency_id=9)).status_code == 200
    assert client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"] == []


def test_shelf_author_reads_and_dismisses_its_own_entry(client, headers):
    """Le collègue qui perd la course doit pouvoir consulter ce qui a été mis de côté.

    Son travail est bien archivé côté serveur, mais l'étagère était réservée au
    propriétaire : de son point de vue, sa version avait purement disparu.
    """
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    assert _put(client, headers, lid, 0, G2, user_id=2, agency_id=9).status_code == 409
    r = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=2, agency_id=9))
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1 and items[0]["author_id"] == 2 and items[0]["geometry"] == G2
    assert client.post(f"/design3d/levels/{lid}/shelf/{items[0]['id']}/dismiss",
                       headers=headers(user_id=2, agency_id=9)).status_code == 200
    assert client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=2, agency_id=9)).json()["items"] == []


def test_shelf_author_sees_only_its_own_entries(client, headers):
    """Ouvrir l'étagère à son auteur n'ouvre pas celle des autres."""
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=3, agency_id=9)
    items = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=2, agency_id=9)).json()["items"]
    assert [s["author_id"] for s in items] == [2]
    owner_items = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"]
    assert sorted(s["author_id"] for s in owner_items) == [2, 3]
    foreign = next(s for s in owner_items if s["author_id"] == 3)
    assert client.post(f"/design3d/levels/{lid}/shelf/{foreign['id']}/dismiss",
                       headers=headers(user_id=2, agency_id=9)).status_code == 403


_WINDOW = {"id": "o1", "type": "window", "wall_id": "w1", "offset_m": 1.0,
           "width_m": 1.0, "height_m": 1.2, "sill_m": 1.0}
G_WINDOW = {"walls": [W], "rooms": [], "openings": [_WINDOW]}


def test_lowering_wall_height_alone_revalidates_stored_geometry(client, headers):
    """La hauteur seule ne contournait pas la validation : les ouvertures la débordaient.

    C'est pourtant l'invariant que les briques 3D consommeront (allège + hauteur
    d'ouverture ≤ hauteur de mur).
    """
    pid, lid = _project(client, headers)
    assert _put(client, headers, lid, 0, G_WINDOW, user_id=1, agency_id=9).status_code == 200
    r = client.put(f"/design3d/levels/{lid}", json={"base_revision": 1, "wall_height_m": 2.0},
                   headers=headers(user_id=1, agency_id=9))
    assert r.status_code == 422
    assert "dépasse la hauteur du mur" in " ".join(r.json()["details"])
    # Rien n'a été enregistré : ni la hauteur, ni une révision de plus.
    lv = client.get(f"/design3d/projects/{pid}", headers=headers(user_id=1, agency_id=9)).json()["levels"][0]
    assert float(lv["wall_height_m"]) == 2.7 and lv["revision"] == 1


def test_raising_wall_height_alone_stays_allowed(client, headers):
    pid, lid = _project(client, headers)
    _put(client, headers, lid, 0, G_WINDOW, user_id=1, agency_id=9)
    r = client.put(f"/design3d/levels/{lid}", json={"base_revision": 1, "wall_height_m": 3.0},
                   headers=headers(user_id=1, agency_id=9))
    assert r.status_code == 200 and float(r.json()["wall_height_m"]) == 3.0


def test_sync_summary_scoped(client, headers):
    pid, lid = _project(client, headers)
    _project(client, headers, owner=5, agency=10)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    r = client.get("/design3d/sync", headers=headers(user_id=1, agency_id=9)).json()
    assert [p["id"] for p in r["projects"]] == [pid]
    lv = r["projects"][0]["levels"][0]
    assert lv["id"] == lid and lv["revision"] == 1 and lv["shelved_count"] == 1
