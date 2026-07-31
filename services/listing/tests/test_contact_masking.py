from app import models

# NOT NULL en base (reference/property_type/transaction_type/price/city) : le brief ne les
# liste pas mais le schéma réel les exige — valeurs neutres ajoutées pour permettre l'insert.
_REQUIRED = {
    "reference": "SEM-TEST0001", "property_type": "appartement", "transaction_type": "vente",
    "price": 100000, "city": "Casablanca",
}


def test_reveal_phone_forbidden_for_particulier(client, db_session):
    db_session.add(models.Property(id=1, title="T", owner_id=5, agency_id=None, **_REQUIRED))
    db_session.commit()
    r = client.post("/properties/1/reveal-phone", json={})
    assert r.status_code == 403


def test_agency_reveal_phone_still_works(client, db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "_fetch_contact_phone", lambda p: "0600000000")
    db_session.add(models.Property(id=2, title="T", owner_id=None, agency_id=9,
                                   **{**_REQUIRED, "reference": "SEM-TEST0002"}))
    db_session.commit()
    r = client.post("/properties/2/reveal-phone", json={})
    assert r.status_code == 200
    assert r.json()["phone"] == "0600000000"
