"""`/internal/properties/{id}/owner` — consommé par selling (seller) et design3d.

design3d y vérifie qu'un projet de conception vise bien un bien du périmètre de
son auteur ; `agency_id` lui est nécessaire, un bien confié à une agence
appartenant nominalement à un seul de ses membres.
"""
import app.main as m
from app import models

_REQUIRED = {
    "reference": "SEM-OWNER001", "property_type": "appartement", "transaction_type": "vente",
    "price": 100000, "city": "Casablanca",
}


def _token(monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "jeton-de-test")
    return {"x-internal-token": "jeton-de-test"}


def test_owner_requires_the_internal_token(client, db_session, monkeypatch):
    _token(monkeypatch)
    assert client.get("/internal/properties/1/owner").status_code == 403


def test_owner_returns_owner_and_agency(client, db_session, monkeypatch):
    headers = _token(monkeypatch)
    db_session.add(models.Property(id=1, title="T", owner_id=5, agency_id=9, **_REQUIRED))
    db_session.commit()
    r = client.get("/internal/properties/1/owner", headers=headers)
    assert r.status_code == 200
    assert r.json() == {"owner_id": 5, "agency_id": 9}


def test_unknown_property_yields_no_owner(client, db_session, monkeypatch):
    headers = _token(monkeypatch)
    r = client.get("/internal/properties/424242/owner", headers=headers)
    assert r.status_code == 200
    assert r.json() == {"owner_id": None, "agency_id": None}
