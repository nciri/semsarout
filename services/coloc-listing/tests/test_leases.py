from datetime import date

from sqlalchemy import select

from semsar_events import OutboxEvent

from tests.conftest import headers

LISTING_PAYLOAD = {
    "property": {"city": "Casablanca", "neighborhood": "Gauthier",
                 "property_type": "APPARTEMENT", "area_m2": 90,
                 "amenities": {"wifi": True}},
    "title": "Chambre lumineuse à Gauthier", "description": "Belle chambre.",
    "bed_type": "CHAMBRE_INDIVIDUELLE", "rent": "2200.00",
    "housing_gender": "FEMININ", "furnished": True, "capacity": 3,
}

OWNER_ID = 7
TENANT_USER_ID = 42

LEASE_PAYLOAD = {
    "tenant_user_id": TENANT_USER_ID, "rent_amount": "2200.00",
    "deposit_amount": "2200.00", "start_date": str(date.today()),
}


def _create_listing(client) -> str:
    resp = client.post("/listings", json=LISTING_PAYLOAD, headers=headers(OWNER_ID))
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_lease(client, listing_id: str) -> dict:
    resp = client.post("/leases", json={**LEASE_PAYLOAD, "listing_id": listing_id},
                       headers=headers(OWNER_ID))
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_lease_requires_ownership(client):
    listing_id = _create_listing(client)
    resp = client.post("/leases", json={**LEASE_PAYLOAD, "listing_id": listing_id},
                       headers=headers(999))
    assert resp.status_code == 403


def test_create_lease_seeds_pending_payments(client, db_session):
    listing_id = _create_listing(client)
    lease = _create_lease(client, listing_id)
    assert lease["status"] == "pending"
    assert lease["owner_id"] == OWNER_ID
    assert lease["tenant_user_id"] == TENANT_USER_ID
    payments = {p["type"]: p for p in lease["payments"]}
    assert set(payments) == {"deposit", "rent"}
    assert payments["deposit"]["status"] == "pending"
    assert payments["rent"]["status"] == "pending"
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert "coloc.lease_created" in events


def test_me_lease_returns_tenant_lease(client):
    listing_id = _create_listing(client)
    lease = _create_lease(client, listing_id)
    resp = client.get("/me/lease", headers=headers(TENANT_USER_ID))
    assert resp.status_code == 200
    assert resp.json()["id"] == lease["id"]


def test_me_lease_null_when_no_lease(client):
    resp = client.get("/me/lease", headers=headers(999))
    assert resp.status_code == 200
    assert resp.json() is None


def test_lease_detail_forbidden_to_stranger(client):
    listing_id = _create_listing(client)
    lease = _create_lease(client, listing_id)
    resp = client.get(f"/leases/{lease['id']}", headers=headers(999))
    assert resp.status_code == 403


def test_lease_detail_visible_to_owner_and_tenant_and_admin(client):
    listing_id = _create_listing(client)
    lease = _create_lease(client, listing_id)
    assert client.get(f"/leases/{lease['id']}", headers=headers(OWNER_ID)).status_code == 200
    assert client.get(f"/leases/{lease['id']}", headers=headers(TENANT_USER_ID)).status_code == 200
    assert client.get(f"/leases/{lease['id']}", headers=headers(999, superadmin=True)).status_code == 200


def test_escrow_release_flow_and_activates_lease(client, db_session):
    listing_id = _create_listing(client)
    lease = _create_lease(client, listing_id)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")

    # Tenant cannot trigger escrow actions (owner/admin only)
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/escrow",
                       headers=headers(TENANT_USER_ID))
    assert resp.status_code == 403

    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/escrow",
                       headers=headers(OWNER_ID))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"  # lease auto-activated on first escrow
    deposit = next(p for p in body["payments"] if p["id"] == deposit_id)
    assert deposit["status"] == "escrowed"

    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/release",
                       headers=headers(OWNER_ID))
    assert resp.status_code == 200
    deposit = next(p for p in resp.json()["payments"] if p["id"] == deposit_id)
    assert deposit["status"] == "released"

    # Terminal state: no further transition allowed
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/refund",
                       headers=headers(OWNER_ID))
    assert resp.status_code == 409

    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert events.count("coloc.payment_status_changed") == 2


def test_refund_from_escrowed(client):
    listing_id = _create_listing(client)
    lease = _create_lease(client, listing_id)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    client.post(f"/leases/{lease['id']}/payments/{deposit_id}/escrow", headers=headers(OWNER_ID))
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/refund",
                       headers=headers(OWNER_ID))
    assert resp.status_code == 200
    deposit = next(p for p in resp.json()["payments"] if p["id"] == deposit_id)
    assert deposit["status"] == "refunded"


def test_internal_leases_requires_token(client):
    resp = client.get("/internal/leases")
    assert resp.status_code == 403


def test_internal_leases_lists_all(client, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    listing_id = _create_listing(client)
    _create_lease(client, listing_id)
    resp = client.get("/internal/leases", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["payments"]


def test_my_leases_lists_both_roles(client):
    listing_id = _create_listing(client)
    _create_lease(client, listing_id)
    owner_view = client.get("/leases/mine", headers=headers(OWNER_ID)).json()
    tenant_view = client.get("/leases/mine", headers=headers(TENANT_USER_ID)).json()
    assert len(owner_view) == 1
    assert len(tenant_view) == 1
