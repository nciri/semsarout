import hashlib
import hmac
import json
from datetime import date

from tests.conftest import headers

LISTING_PAYLOAD = {
    "property": {"city": "Marrakech", "neighborhood": "Guéliz", "property_type": "APPARTEMENT",
                 "area_m2": 55, "amenities": {}},
    "title": "Chambre Guéliz", "description": "", "bed_type": "CHAMBRE_INDIVIDUELLE",
    "rent": "2000.00", "housing_gender": "MASCULIN", "capacity": 2,
}

OWNER_ID = 31
TENANT_USER_ID = 77
WEBHOOK_SECRET = "dev-webhook-secret-change-me"  # défaut de app/config.py (dev only)


def _create_lease(client) -> dict:
    resp = client.post("/listings", json=LISTING_PAYLOAD, headers=headers(OWNER_ID))
    listing_id = resp.json()["id"]
    payload = {"listing_id": listing_id, "tenant_user_id": TENANT_USER_ID, "rent_amount": "2000.00",
              "deposit_amount": "2000.00", "start_date": str(date.today())}
    resp = client.post("/leases", json=payload, headers=headers(OWNER_ID))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


def test_tenant_creates_intent(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent",
                       headers=headers(TENANT_USER_ID))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["provider"] == "simulated"
    assert body["intent_id"].startswith("sim_")
    assert body["intent_status"] == "processing"
    assert body["status"] == "pending"  # séquestre non encore confirmé


def test_owner_cannot_create_intent(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent",
                       headers=headers(OWNER_ID))
    assert resp.status_code == 403


def test_webhook_succeeded_moves_payment_to_escrowed_and_activates_lease(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    intent = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent",
                         headers=headers(TENANT_USER_ID)).json()

    payload = json.dumps({"intent_id": intent["intent_id"], "event": "succeeded"}).encode()
    resp = client.post("/internal/payments/webhook", content=payload,
                       headers={"x-webhook-signature": _sign(payload),
                                "content-type": "application/json"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "escrowed"
    assert body["intent_status"] == "succeeded"

    lease_resp = client.get(f"/leases/{lease['id']}", headers=headers(OWNER_ID)).json()
    assert lease_resp["status"] == "active"


def test_webhook_failed_leaves_payment_pending(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    intent = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent",
                         headers=headers(TENANT_USER_ID)).json()

    payload = json.dumps({"intent_id": intent["intent_id"], "event": "failed"}).encode()
    resp = client.post("/internal/payments/webhook", content=payload,
                       headers={"x-webhook-signature": _sign(payload),
                                "content-type": "application/json"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "pending"
    assert body["intent_status"] == "failed"


def test_webhook_rejects_bad_signature(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    intent = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent",
                         headers=headers(TENANT_USER_ID)).json()

    payload = json.dumps({"intent_id": intent["intent_id"], "event": "succeeded"}).encode()
    resp = client.post("/internal/payments/webhook", content=payload,
                       headers={"x-webhook-signature": "not-the-right-signature",
                                "content-type": "application/json"})
    assert resp.status_code == 403


def test_webhook_unknown_intent_404(client):
    payload = json.dumps({"intent_id": "sim_doesnotexist", "event": "succeeded"}).encode()
    resp = client.post("/internal/payments/webhook", content=payload,
                       headers={"x-webhook-signature": _sign(payload),
                                "content-type": "application/json"})
    assert resp.status_code == 404


def test_tenant_confirms_own_intent_demo(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent", headers=headers(TENANT_USER_ID))
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent/confirm",
                       headers=headers(TENANT_USER_ID))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "escrowed"
    assert body["intent_status"] == "succeeded"


def test_owner_cannot_confirm_intent_demo(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent", headers=headers(TENANT_USER_ID))
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent/confirm",
                       headers=headers(OWNER_ID))
    assert resp.status_code == 403


def test_confirm_demo_requires_existing_intent(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent/confirm",
                       headers=headers(TENANT_USER_ID))
    assert resp.status_code == 409


def test_intent_requires_pending_payment(client):
    lease = _create_lease(client)
    deposit_id = next(p["id"] for p in lease["payments"] if p["type"] == "deposit")
    # Owner escrows directly (legacy path, still supported) — payment no longer pending.
    client.post(f"/leases/{lease['id']}/payments/{deposit_id}/escrow", headers=headers(OWNER_ID))
    resp = client.post(f"/leases/{lease['id']}/payments/{deposit_id}/intent",
                       headers=headers(TENANT_USER_ID))
    assert resp.status_code == 409
