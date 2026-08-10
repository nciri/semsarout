from tests.conftest import headers


def _payload(**kw):
    body = {
        "property": {"city": "Casablanca", "property_type": "APPARTEMENT"},
        "title": "Chambre lumineuse", "bed_type": "CHAMBRE_INDIVIDUELLE",
        "rent": 2500, "housing_gender": "FEMININ", "capacity": 2,
    }
    body.update(kw)
    return body


def test_create_persists_condo_fields(client):
    r = client.post("/listings", json=_payload(is_condo=True, condo_fees=800), headers=headers())
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["is_condo"] is True
    assert d["condo_fees"] == 800.0


def test_create_condo_default_true(client):
    r = client.post("/listings", json=_payload(), headers=headers())
    assert r.status_code == 201, r.text
    assert r.json()["is_condo"] is True
