from datetime import date

from tests.conftest import headers

LISTING_PAYLOAD = {
    "property": {"city": "Fès", "neighborhood": "Ville Nouvelle", "property_type": "APPARTEMENT",
                 "area_m2": 60, "amenities": {}},
    "title": "Chambre Fès", "description": "", "bed_type": "CHAMBRE_INDIVIDUELLE",
    "rent": "1500.00", "housing_gender": "FEMININ", "capacity": 2,
}

OWNER_ID = 21
TENANT_USER_ID = 66
STRANGER_ID = 999


def _create_lease(client) -> dict:
    resp = client.post("/listings", json=LISTING_PAYLOAD, headers=headers(OWNER_ID))
    listing_id = resp.json()["id"]
    payload = {"listing_id": listing_id, "tenant_user_id": TENANT_USER_ID, "rent_amount": "1500.00",
              "deposit_amount": "1500.00", "start_date": str(date.today())}
    resp = client.post("/leases", json=payload, headers=headers(OWNER_ID))
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_owner_creates_entree_edl(client):
    lease = _create_lease(client)
    resp = client.post(f"/leases/{lease['id']}/etat-des-lieux",
                       json={"type": "entree", "items": [{"piece": "Chambre", "etat": "bon"}]},
                       headers=headers(OWNER_ID))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["type"] == "entree"
    assert body["status"] == "draft"
    assert body["items"][0]["piece"] == "Chambre"


def test_tenant_cannot_create_edl(client):
    lease = _create_lease(client)
    resp = client.post(f"/leases/{lease['id']}/etat-des-lieux",
                       json={"type": "entree", "items": []}, headers=headers(TENANT_USER_ID))
    assert resp.status_code == 403


def test_duplicate_type_rejected(client):
    lease = _create_lease(client)
    client.post(f"/leases/{lease['id']}/etat-des-lieux", json={"type": "entree", "items": []},
               headers=headers(OWNER_ID))
    resp = client.post(f"/leases/{lease['id']}/etat-des-lieux", json={"type": "entree", "items": []},
                       headers=headers(OWNER_ID))
    assert resp.status_code == 409


def test_list_visible_to_owner_tenant_admin_not_stranger(client):
    lease = _create_lease(client)
    client.post(f"/leases/{lease['id']}/etat-des-lieux", json={"type": "entree", "items": []},
               headers=headers(OWNER_ID))
    assert client.get(f"/leases/{lease['id']}/etat-des-lieux", headers=headers(OWNER_ID)).status_code == 200
    assert client.get(f"/leases/{lease['id']}/etat-des-lieux",
                      headers=headers(TENANT_USER_ID)).status_code == 200
    assert client.get(f"/leases/{lease['id']}/etat-des-lieux",
                      headers=headers(STRANGER_ID, superadmin=True)).status_code == 200
    assert client.get(f"/leases/{lease['id']}/etat-des-lieux",
                      headers=headers(STRANGER_ID)).status_code == 403


def test_update_only_while_draft(client):
    lease = _create_lease(client)
    edl = client.post(f"/leases/{lease['id']}/etat-des-lieux", json={"type": "sortie", "items": []},
                      headers=headers(OWNER_ID)).json()
    resp = client.patch(f"/leases/{lease['id']}/etat-des-lieux/{edl['id']}",
                        json={"items": [{"piece": "Salon", "etat": "moyen"}]},
                        headers=headers(OWNER_ID))
    assert resp.status_code == 200
    assert resp.json()["items"][0]["piece"] == "Salon"


def test_sign_by_both_parties_marks_signed(client):
    lease = _create_lease(client)
    edl = client.post(f"/leases/{lease['id']}/etat-des-lieux", json={"type": "entree", "items": []},
                      headers=headers(OWNER_ID)).json()
    resp = client.post(f"/leases/{lease['id']}/etat-des-lieux/{edl['id']}/sign",
                       headers=headers(OWNER_ID))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "draft"
    assert body["owner_signed_at"] is not None
    assert body["tenant_signed_at"] is None

    resp = client.post(f"/leases/{lease['id']}/etat-des-lieux/{edl['id']}/sign",
                       headers=headers(TENANT_USER_ID))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "signed"
    assert body["tenant_signed_at"] is not None


def test_sign_forbidden_to_stranger(client):
    lease = _create_lease(client)
    edl = client.post(f"/leases/{lease['id']}/etat-des-lieux", json={"type": "entree", "items": []},
                      headers=headers(OWNER_ID)).json()
    resp = client.post(f"/leases/{lease['id']}/etat-des-lieux/{edl['id']}/sign",
                       headers=headers(STRANGER_ID))
    assert resp.status_code == 403


def test_update_after_fully_signed_rejected(client):
    lease = _create_lease(client)
    edl = client.post(f"/leases/{lease['id']}/etat-des-lieux", json={"type": "entree", "items": []},
                      headers=headers(OWNER_ID)).json()
    client.post(f"/leases/{lease['id']}/etat-des-lieux/{edl['id']}/sign", headers=headers(OWNER_ID))
    client.post(f"/leases/{lease['id']}/etat-des-lieux/{edl['id']}/sign", headers=headers(TENANT_USER_ID))
    resp = client.patch(f"/leases/{lease['id']}/etat-des-lieux/{edl['id']}",
                        json={"items": [{"piece": "Cuisine", "etat": "bon"}]},
                        headers=headers(OWNER_ID))
    assert resp.status_code == 409
