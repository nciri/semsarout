from sqlalchemy import select

from semsar_events import OutboxEvent

from tests.conftest import headers

PAYLOAD = {
    "property": {"city": "Casablanca", "neighborhood": "Gauthier",
                 "property_type": "APPARTEMENT", "area_m2": 90,
                 "amenities": {"wifi": True}},
    "title": "Chambre lumineuse à Gauthier", "description": "Belle chambre.",
    "bed_type": "CHAMBRE_INDIVIDUELLE", "rent": "2200.00",
    "housing_gender": "FEMININ", "furnished": True, "capacity": 3,
}


def _create(client, h=None):
    resp = client.post("/listings", json=PAYLOAD, headers=h or headers())
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_create_requires_auth_and_tenant(client):
    assert client.post("/listings", json=PAYLOAD).status_code in (401, 403)  # sans en-têtes
    assert client.post("/listings", json=PAYLOAD,
                       headers=headers(tenant="semsar")).status_code == 403  # mauvais tenant


def test_mixte_familial_rejected(client):
    resp = client.post("/listings", json={**PAYLOAD, "housing_gender": "MIXTE_FAMILIAL"},
                       headers=headers())
    assert resp.status_code == 422


def test_full_lifecycle_publishes_events(client, db_session):
    lid = _create(client)
    # brouillon : détail public → 404 (ne fuit pas l'existence)
    assert client.get(f"/listings/{lid}", headers=headers()).status_code == 404
    # submit par le propriétaire
    resp = client.post(f"/listings/{lid}/submit", headers=headers())
    assert resp.json()["status"] == "EN_MODERATION"
    # approve refusé au non-superadmin, ok au superadmin
    assert client.post(f"/listings/{lid}/approve", headers=headers()).status_code == 403
    resp = client.post(f"/listings/{lid}/approve", headers=headers(superadmin=True))
    body = resp.json()
    assert body["status"] == "PUBLIEE" and body["published_at"] is not None
    # détail public désormais accessible, sans adresse ni coordonnées
    detail = client.get(f"/listings/{lid}", headers=headers()).json()
    assert detail["title"] == PAYLOAD["title"]
    assert "address" not in detail and "latitude" not in detail
    # événements en outbox
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert "coloc.listing_published" in events
    assert events.count("coloc.listing_status_changed") == 2  # submit + approve


def test_owner_only_updates(client):
    lid = _create(client)
    other = headers(user_id=99)
    assert client.patch(f"/listings/{lid}", json={"rent": "2500.00"}, headers=other).status_code == 403
    resp = client.patch(f"/listings/{lid}", json={"rent": "2500.00"}, headers=headers())
    assert resp.json()["rent"] == 2500.0


def test_not_editable_after_submit(client):
    lid = _create(client)
    client.post(f"/listings/{lid}/submit", headers=headers())
    assert client.patch(f"/listings/{lid}", json={"rent": "2500.00"},
                        headers=headers()).status_code == 409


def test_invalid_transition(client):
    lid = _create(client)  # BROUILLON
    resp = client.post(f"/listings/{lid}/approve", headers=headers(superadmin=True))
    assert resp.status_code == 409  # BROUILLON → PUBLIEE interdit


def test_house_rules_media_roommates(client):
    lid = _create(client)
    resp = client.put(f"/listings/{lid}/house-rules",
                      json={"rules": [{"code": "fumeur", "value": "Non-fumeur"}]},
                      headers=headers())
    assert resp.status_code == 200
    resp = client.post(f"/listings/{lid}/media",
                       json={"url": "/uploads/photos/x.jpg", "position": 0,
                             "media_type": "CHAMBRE"}, headers=headers())
    assert resp.status_code == 201
    resp = client.put(f"/listings/{lid}/roommates",
                      json={"total": 2, "women": 2, "men": 0}, headers=headers())
    assert resp.status_code == 200
    mine = client.get("/me/listings", headers=headers()).json()
    assert len(mine) == 1 and mine[0]["roommates"] == {"total": 2, "women": 2, "men": 0}
