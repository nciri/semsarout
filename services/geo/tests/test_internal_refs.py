"""`/internal/neighborhood-prices` : lu par analytics (moyennes) et listing (fourchettes par bien)."""
import app.main as m
from app.models import NeighborhoodPriceRef


def test_refs_require_the_internal_token(client, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "jeton-de-test")
    assert client.get("/internal/neighborhood-prices").status_code == 403


def test_refs_carry_type_and_bounds(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "jeton-de-test")
    db_session.add(NeighborhoodPriceRef(city="Kénitra", neighborhood="Bir Rami", transaction_type="sale",
                                        avg_price_sqm=6000, min_price_sqm=4500, max_price_sqm=8000))
    db_session.commit()
    r = client.get("/internal/neighborhood-prices", headers={"x-internal-token": "jeton-de-test"})
    assert r.json() == {"refs": [{"city": "Kénitra", "neighborhood": "Bir Rami", "property_type": None,
                                  "transaction_type": "sale", "avg_price_sqm": 6000.0,
                                  "min_price_sqm": 4500.0, "max_price_sqm": 8000.0}]}
