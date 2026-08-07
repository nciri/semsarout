import app.main as m
from app.models import ColocProperty, Listing


def _property() -> ColocProperty:
    return ColocProperty(owner_id=1, city="Casablanca", property_type="APPARTEMENT")


def _listing(prop: ColocProperty, status: str = "BROUILLON") -> Listing:
    return Listing(property=prop, owner_id=1, title="T", bed_type="CHAMBRE_INDIVIDUELLE",
                   rent="1000.00", housing_gender="FEMININ", status=status)


def test_stats_forbidden_without_token(client):
    assert client.get("/internal/stats").status_code == 403


def test_stats_counts(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p = _property()
    db_session.add(p)
    db_session.add(_listing(p, "PUBLIEE"))
    db_session.add(_listing(p, "EN_MODERATION"))
    db_session.add(_listing(p, "BROUILLON"))
    db_session.commit()
    resp = client.get("/internal/stats", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_listings"] == 3
    assert body["published_listings"] == 1
    assert body["in_moderation_listings"] == 1


def test_stats_wrong_tenant_returns_zeros(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p = _property()
    db_session.add(p)
    db_session.add(_listing(p, "PUBLIEE"))
    db_session.commit()
    resp = client.get("/internal/stats", params={"tenant": "semsar"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["total_listings"] == 0
