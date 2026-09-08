import io

from app.geometry import rescale

W = {"id": "w1", "a": {"x": 0, "y": 0}, "b": {"x": 4, "y": 0}, "thickness_m": 0.2}
G = {"walls": [W],
     "rooms": [{"id": "r1", "type": "living", "name": "S", "polygon": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 4, "y": 3}]}],
     "openings": [{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 1, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}]}


def test_rescale_scales_coordinates_and_offsets_not_thickness():
    g = rescale(G, 2)
    assert g["walls"][0]["b"] == {"x": 8, "y": 0} and g["walls"][0]["thickness_m"] == 0.2
    assert g["rooms"][0]["polygon"][2] == {"x": 8, "y": 6}
    assert g["openings"][0]["offset_m"] == 2 and g["openings"][0]["width_m"] == 0.9


def _project(client, headers):
    r = client.post("/design3d/projects", json={"target_type": "property", "target_id": 1, "title": "P"}, headers=headers())
    return r.json()["id"], r.json()["levels"][0]["id"]


def test_recalibrate_rescales(client, headers):
    _, lid = _project(client, headers)
    client.put(f"/design3d/levels/{lid}", json={"base_revision": 0, "geometry": G,
               "calibration": {"p1": {"x": 0.1, "y": 0.1}, "p2": {"x": 0.5, "y": 0.1}, "meters": 4}}, headers=headers())
    r = client.post(f"/design3d/levels/{lid}/recalibrate",
                    json={"base_revision": 1, "calibration": {"p1": {"x": 0.1, "y": 0.1}, "p2": {"x": 0.5, "y": 0.1}, "meters": 8}},
                    headers=headers())
    assert r.status_code == 200
    assert r.json()["geometry"]["walls"][0]["b"]["x"] == 8 and r.json()["revision"] == 2


def test_background_upload_and_stream(client, headers, monkeypatch):
    import app.main as m
    store = {}

    class _S:
        def put(self, key, data, content_type="application/octet-stream", **k): store[key] = (data, content_type)
        def get(self, key): return store[key][0]
    monkeypatch.setattr(m.storage, "plans", lambda: _S())
    _, lid = _project(client, headers)
    r = client.post(f"/design3d/levels/{lid}/background", files={"file": ("plan.png", io.BytesIO(b"\x89PNG..."), "image/png")}, headers=headers())
    assert r.status_code == 200 and r.json()["background_image_key"].endswith("/background.png")
    assert client.get(f"/design3d/levels/{lid}/background", headers=headers()).status_code == 200


def test_background_rejects_pdf_and_oversize(client, headers, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.storage, "plans", lambda: None)
    _, lid = _project(client, headers)
    assert client.post(f"/design3d/levels/{lid}/background", files={"file": ("p.pdf", io.BytesIO(b"%PDF"), "application/pdf")}, headers=headers()).status_code == 400
    big = io.BytesIO(b"\x89PNG" + b"0" * (10 * 1024 * 1024 + 1))
    assert client.post(f"/design3d/levels/{lid}/background", files={"file": ("p.png", big, "image/png")}, headers=headers()).status_code == 413


def test_public_read_requires_ready_and_hides_background(client, headers, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.storage, "plans", lambda: type("S", (), {"put": lambda *a, **k: None, "get": lambda *a: b"img"})())
    pid, lid = _project(client, headers)
    client.post(f"/design3d/levels/{lid}/background", files={"file": ("p.png", io.BytesIO(b"\x89PNG"), "image/png")}, headers=headers())
    assert client.get(f"/public/design3d/projects/{pid}").status_code == 404
    client.put(f"/design3d/projects/{pid}", json={"status": "ready"}, headers=headers())
    body = client.get(f"/public/design3d/projects/{pid}").json()
    assert "background_image_key" not in body["levels"][0] and "revision_author_id" not in body["levels"][0]
    assert client.get(f"/public/design3d/levels/{lid}/background").status_code == 404
    # R7 : base_revision réelle du niveau est encore 0 ici (l'upload de fond n'incrémente pas la révision)
    client.put(f"/design3d/levels/{lid}", json={"base_revision": 0, "show_background_public": True}, headers=headers())
    assert client.get(f"/public/design3d/levels/{lid}/background").status_code == 200


def test_recalibrate_uses_general_scale_ratio_not_naive_meters_ratio(client, headers):
    """R6 : retracer un segment de longueur normalisée différente. Ancien segment 0,4 → 4 m
    (échelle 10 m/unité), nouveau segment 0,2 → 4 m (échelle 20 m/unité) : facteur attendu 2.
    La formule naïve (new.meters / old.meters) donnerait ici 4/4 = 1, donc ce test échouerait
    avec elle."""
    _, lid = _project(client, headers)
    client.put(f"/design3d/levels/{lid}", json={"base_revision": 0, "geometry": G,
               "calibration": {"p1": {"x": 0, "y": 0}, "p2": {"x": 0.4, "y": 0}, "meters": 4}}, headers=headers())
    r = client.post(f"/design3d/levels/{lid}/recalibrate",
                    json={"base_revision": 1, "calibration": {"p1": {"x": 0, "y": 0}, "p2": {"x": 0.2, "y": 0}, "meters": 4}},
                    headers=headers())
    assert r.status_code == 200
    body = r.json()
    assert body["geometry"]["walls"][0]["b"] == {"x": 8, "y": 0}
    assert body["geometry"]["openings"][0]["offset_m"] == 2


def test_recalibrate_degenerate_new_segment_keeps_scale(client, headers):
    """R6 : nouveau segment dégénéré (p1 == p2) → facteur 1.0, pas de division par zéro, pas de
    déformation de la géométrie existante."""
    _, lid = _project(client, headers)
    client.put(f"/design3d/levels/{lid}", json={"base_revision": 0, "geometry": G,
               "calibration": {"p1": {"x": 0.1, "y": 0.1}, "p2": {"x": 0.5, "y": 0.1}, "meters": 4}}, headers=headers())
    r = client.post(f"/design3d/levels/{lid}/recalibrate",
                    json={"base_revision": 1, "calibration": {"p1": {"x": 0.3, "y": 0.3}, "p2": {"x": 0.3, "y": 0.3}, "meters": 4}},
                    headers=headers())
    assert r.status_code == 200
    body = r.json()
    assert body["geometry"]["walls"][0]["b"] == {"x": 4, "y": 0}
    assert body["geometry"]["openings"][0]["offset_m"] == 1


def test_public_project_hides_owner_agency_tenant(client, headers, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.storage, "plans", lambda: type("S", (), {"put": lambda *a, **k: None, "get": lambda *a: b"img"})())
    pid, _ = _project(client, headers)
    client.put(f"/design3d/projects/{pid}", json={"status": "ready"}, headers=headers())
    body = client.get(f"/public/design3d/projects/{pid}").json()
    assert "owner_id" not in body and "agency_id" not in body and "tenant" not in body


def test_public_by_target_hides_owner_agency_tenant(client, headers, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.storage, "plans", lambda: type("S", (), {"put": lambda *a, **k: None, "get": lambda *a: b"img"})())
    pid, _ = _project(client, headers)
    client.put(f"/design3d/projects/{pid}", json={"status": "ready"}, headers=headers())
    r = client.get("/public/design3d/by-target", params={"target_type": "property", "target_id": 1})
    body = r.json()["projects"][0]
    assert "owner_id" not in body and "agency_id" not in body and "tenant" not in body


def test_authenticated_project_still_exposes_owner_and_agency(client, headers):
    pid, _ = _project(client, headers)
    body = client.get(f"/design3d/projects/{pid}", headers=headers()).json()
    assert "owner_id" in body and "agency_id" in body


def test_public_by_target_lists_ready_projects_only(client, headers, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.storage, "plans", lambda: type("S", (), {"put": lambda *a, **k: None, "get": lambda *a: b"img"})())
    pid, lid = _project(client, headers)
    # pas encore ready : absent
    r = client.get("/public/design3d/by-target", params={"target_type": "property", "target_id": 1})
    assert r.status_code == 200 and r.json()["projects"] == []
    client.post(f"/design3d/levels/{lid}/background", files={"file": ("p.png", io.BytesIO(b"\x89PNG"), "image/png")}, headers=headers())
    client.put(f"/design3d/projects/{pid}", json={"status": "ready"}, headers=headers())
    r = client.get("/public/design3d/by-target", params={"target_type": "property", "target_id": 1})
    assert r.status_code == 200
    projects = r.json()["projects"]
    assert len(projects) == 1 and projects[0]["id"] == pid
    lv = projects[0]["levels"][0]
    assert "background_image_key" not in lv and "revision_author_id" not in lv
    # autre bien : rien
    r2 = client.get("/public/design3d/by-target", params={"target_type": "property", "target_id": 999})
    assert r2.status_code == 200 and r2.json()["projects"] == []
