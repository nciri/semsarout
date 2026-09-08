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


def test_shelf_only_for_owner_and_dismiss(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    assert client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=2, agency_id=9)).status_code == 403
    sid = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"][0]["id"]
    assert client.post(f"/design3d/levels/{lid}/shelf/{sid}/dismiss", headers=headers(user_id=1, agency_id=9)).status_code == 200
    assert client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"] == []


def test_sync_summary_scoped(client, headers):
    pid, lid = _project(client, headers)
    _project(client, headers, owner=5, agency=10)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    r = client.get("/design3d/sync", headers=headers(user_id=1, agency_id=9)).json()
    assert [p["id"] for p in r["projects"]] == [pid]
    lv = r["projects"][0]["levels"][0]
    assert lv["id"] == lid and lv["revision"] == 1 and lv["shelved_count"] == 1
