from datetime import date

from tests.conftest import headers

LISTING_PAYLOAD = {
    "property": {"city": "Rabat", "neighborhood": "Agdal", "property_type": "APPARTEMENT",
                 "area_m2": 70, "amenities": {}},
    "title": "Chambre Agdal", "description": "", "bed_type": "CHAMBRE_INDIVIDUELLE",
    "rent": "1800.00", "housing_gender": "MASCULIN",
    "capacity": 2,
}

OWNER_ID = 11
TENANT_USER_ID = 55


def _create_listing(client, owner_id=OWNER_ID) -> str:
    resp = client.post("/listings", json=LISTING_PAYLOAD, headers=headers(owner_id))
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_lease(client, listing_id, owner_id=OWNER_ID, tenant_id=TENANT_USER_ID,
                  start=None) -> dict:
    payload = {"listing_id": listing_id, "tenant_user_id": tenant_id, "rent_amount": "1800.00",
              "deposit_amount": "1800.00", "start_date": str(start or date.today())}
    resp = client.post("/leases", json=payload, headers=headers(owner_id))
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_me_leases_lists_all_tenant_leases(client):
    listing_1 = _create_listing(client)
    listing_2 = _create_listing(client)
    lease_1 = _create_lease(client, listing_1)
    lease_2 = _create_lease(client, listing_2)

    resp = client.get("/me/leases", headers=headers(TENANT_USER_ID))
    assert resp.status_code == 200
    body = resp.json()
    assert {b["id"] for b in body} == {lease_1["id"], lease_2["id"]}


def test_me_leases_empty_list_when_no_lease(client):
    resp = client.get("/me/leases", headers=headers(999))
    assert resp.status_code == 200
    assert resp.json() == []


def test_me_leases_scoped_to_caller_only(client):
    listing_1 = _create_listing(client)
    _create_lease(client, listing_1, tenant_id=TENANT_USER_ID)

    resp = client.get("/me/leases", headers=headers(999))
    assert resp.status_code == 200
    assert resp.json() == []


def test_me_lease_still_works_for_compat(client):
    listing_1 = _create_listing(client)
    lease = _create_lease(client, listing_1)
    resp = client.get("/me/lease", headers=headers(TENANT_USER_ID))
    assert resp.status_code == 200
    assert resp.json()["id"] == lease["id"]
