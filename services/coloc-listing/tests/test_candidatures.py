from sqlalchemy import select

from semsar_events import OutboxEvent

from tests.conftest import headers

LISTING_PAYLOAD = {
    "property": {"city": "Casablanca", "neighborhood": "Maârif",
                 "property_type": "APPARTEMENT", "area_m2": 70,
                 "amenities": {"wifi": True}},
    "title": "Chambre privée à Maârif", "description": "Belle chambre.",
    "bed_type": "CHAMBRE_INDIVIDUELLE", "rent": "2200.00",
    "housing_gender": "FEMININ",
    "furnished": True, "capacity": 3,
}

OWNER_ID = 7
CANDIDATE_ID = 42
OTHER_CANDIDATE_ID = 43
ROOMMATE_ID = 51
STRANGER_ID = 999


def _create_and_publish_listing(client, db_session, *, roommates=None):
    resp = client.post("/listings", json=LISTING_PAYLOAD, headers=headers(OWNER_ID))
    assert resp.status_code == 201, resp.text
    listing_id = resp.json()["id"]
    if roommates is not None:
        # Colocataires en place ne peuvent être posés QUE tant que l'annonce est
        # modifiable (BROUILLON/REJETEE) — avant publication.
        resp = client.put(f"/listings/{listing_id}/roommates", json=roommates, headers=headers(OWNER_ID))
        assert resp.status_code == 200, resp.text
    resp = client.post(f"/listings/{listing_id}/submit", headers=headers(OWNER_ID))
    assert resp.status_code == 200, resp.text
    resp = client.post(f"/listings/{listing_id}/approve", headers=headers(OWNER_ID, superadmin=True))
    assert resp.status_code == 200, resp.text
    return listing_id


def _apply(client, listing_id, candidate_id=CANDIDATE_ID, message="Bonjour !"):
    return client.post("/candidatures", json={"listing_id": listing_id, "message": message},
                       headers=headers(candidate_id))


def test_apply_requires_auth(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    resp = client.post("/candidatures", json={"listing_id": listing_id},
                       headers={"x-semsar-tenant": "m3a-l3achrane"})
    assert resp.status_code == 401


def test_apply_requires_published_listing(client, db_session):
    resp = client.post("/listings", json=LISTING_PAYLOAD, headers=headers(OWNER_ID))
    listing_id = resp.json()["id"]  # still BROUILLON, not published
    resp = _apply(client, listing_id)
    assert resp.status_code == 404


def test_apply_creates_candidature_and_emits_event(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    resp = _apply(client, listing_id)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "received"
    assert body["candidate_user_id"] == CANDIDATE_ID
    assert body["owner_id"] == OWNER_ID
    assert body["listing"]["id"] == listing_id
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert "coloc.candidature_received" in events


def test_apply_dedupes_active_candidature(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    _apply(client, listing_id)
    resp = _apply(client, listing_id)
    assert resp.status_code == 409


def test_apply_allowed_again_after_rejection(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    first = _apply(client, listing_id).json()
    client.post(f"/candidatures/{first['id']}/reject", headers=headers(OWNER_ID))
    resp = _apply(client, listing_id)
    assert resp.status_code == 201


def test_mine_and_received_scoping(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    _apply(client, listing_id, candidate_id=CANDIDATE_ID)
    _apply(client, listing_id, candidate_id=OTHER_CANDIDATE_ID)

    mine = client.get("/candidatures/mine", headers=headers(CANDIDATE_ID)).json()
    assert len(mine) == 1
    assert mine[0]["candidate_user_id"] == CANDIDATE_ID

    received = client.get("/candidatures/received", headers=headers(OWNER_ID)).json()
    assert len(received) == 2

    stranger_received = client.get("/candidatures/received", headers=headers(STRANGER_ID)).json()
    assert stranger_received == []


def test_shortlist_reserved_to_owner(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    cand = _apply(client, listing_id).json()
    resp = client.post(f"/candidatures/{cand['id']}/shortlist", headers=headers(STRANGER_ID))
    assert resp.status_code == 403
    resp = client.post(f"/candidatures/{cand['id']}/shortlist", headers=headers(OWNER_ID))
    assert resp.status_code == 200
    assert resp.json()["status"] == "shortlisted"


def test_accept_direct_when_room_free(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    cand = _apply(client, listing_id).json()
    client.post(f"/candidatures/{cand['id']}/shortlist", headers=headers(OWNER_ID))
    resp = client.post(f"/candidatures/{cand['id']}/accept", headers=headers(OWNER_ID))
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert "coloc.candidature_accepted" in events


def test_accept_transitions_to_pending_roommate_when_room_occupied(client, db_session):
    listing_id = _create_and_publish_listing(
        client, db_session, roommates={"total": 2, "women": 1, "men": 1, "statuses": {}})
    cand = _apply(client, listing_id).json()
    client.post(f"/candidatures/{cand['id']}/shortlist", headers=headers(OWNER_ID))
    resp = client.post(f"/candidatures/{cand['id']}/accept", headers=headers(OWNER_ID))
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending_roommate"
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert "coloc.candidature_accepted" not in events


def test_accept_requires_shortlisted_status(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    cand = _apply(client, listing_id).json()
    resp = client.post(f"/candidatures/{cand['id']}/accept", headers=headers(OWNER_ID))
    assert resp.status_code == 409


def test_reject_forbidden_once_accepted(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    cand = _apply(client, listing_id).json()
    client.post(f"/candidatures/{cand['id']}/shortlist", headers=headers(OWNER_ID))
    client.post(f"/candidatures/{cand['id']}/accept", headers=headers(OWNER_ID))
    resp = client.post(f"/candidatures/{cand['id']}/reject", headers=headers(OWNER_ID))
    assert resp.status_code == 409


def test_roommate_decision_requires_current_roommate(client, db_session):
    listing_id = _create_and_publish_listing(
        client, db_session, roommates={"total": 1, "women": 1, "men": 0, "statuses": {}})
    cand = _apply(client, listing_id).json()
    client.post(f"/candidatures/{cand['id']}/shortlist", headers=headers(OWNER_ID))
    client.post(f"/candidatures/{cand['id']}/accept", headers=headers(OWNER_ID))

    # Stranger (not a tenant on this listing) cannot decide.
    resp = client.post(f"/candidatures/{cand['id']}/roommate-decision",
                       json={"decision": "validated"}, headers=headers(STRANGER_ID))
    assert resp.status_code == 403

    # Make ROOMMATE_ID an actual current roommate via a lease on this listing.
    lease_resp = client.post("/leases", json={
        "listing_id": listing_id, "tenant_user_id": ROOMMATE_ID, "rent_amount": "2200.00",
        "deposit_amount": "2200.00", "start_date": "2026-01-01",
    }, headers=headers(OWNER_ID))
    assert lease_resp.status_code == 201, lease_resp.text

    resp = client.post(f"/candidatures/{cand['id']}/roommate-decision",
                       json={"decision": "validated"}, headers=headers(ROOMMATE_ID))
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert "coloc.candidature_accepted" in events


def test_roommate_decision_rejected(client, db_session):
    listing_id = _create_and_publish_listing(
        client, db_session, roommates={"total": 1, "women": 1, "men": 0, "statuses": {}})
    client.post("/leases", json={
        "listing_id": listing_id, "tenant_user_id": ROOMMATE_ID, "rent_amount": "2200.00",
        "deposit_amount": "2200.00", "start_date": "2026-01-01",
    }, headers=headers(OWNER_ID))
    cand = _apply(client, listing_id).json()
    client.post(f"/candidatures/{cand['id']}/shortlist", headers=headers(OWNER_ID))
    client.post(f"/candidatures/{cand['id']}/accept", headers=headers(OWNER_ID))

    resp = client.post(f"/candidatures/{cand['id']}/roommate-decision",
                       json={"decision": "rejected"}, headers=headers(ROOMMATE_ID))
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


def test_roommate_pending_scoped_to_current_roommate(client, db_session):
    listing_id = _create_and_publish_listing(
        client, db_session, roommates={"total": 1, "women": 1, "men": 0, "statuses": {}})
    client.post("/leases", json={
        "listing_id": listing_id, "tenant_user_id": ROOMMATE_ID, "rent_amount": "2200.00",
        "deposit_amount": "2200.00", "start_date": "2026-01-01",
    }, headers=headers(OWNER_ID))
    cand = _apply(client, listing_id).json()
    client.post(f"/candidatures/{cand['id']}/shortlist", headers=headers(OWNER_ID))
    client.post(f"/candidatures/{cand['id']}/accept", headers=headers(OWNER_ID))

    stranger_view = client.get("/candidatures/roommate-pending", headers=headers(STRANGER_ID)).json()
    assert stranger_view == []

    roommate_view = client.get("/candidatures/roommate-pending", headers=headers(ROOMMATE_ID)).json()
    assert len(roommate_view) == 1
    assert roommate_view[0]["id"] == cand["id"]


def test_roommate_decision_requires_pending_roommate_status(client, db_session):
    listing_id = _create_and_publish_listing(client, db_session)
    cand = _apply(client, listing_id).json()
    resp = client.post(f"/candidatures/{cand['id']}/roommate-decision",
                       json={"decision": "validated"}, headers=headers(ROOMMATE_ID))
    assert resp.status_code == 409
