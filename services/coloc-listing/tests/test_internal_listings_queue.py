import app.main as m
from app.models import ColocProperty, Listing


def _property() -> ColocProperty:
    return ColocProperty(owner_id=1, city="Casablanca", property_type="APPARTEMENT")


def _listing(prop: ColocProperty, status: str = "BROUILLON") -> Listing:
    return Listing(property=prop, owner_id=1, title="T", bed_type="CHAMBRE_INDIVIDUELLE",
                   rent="1000.00", housing_gender="FEMININ", status=status)


def test_queue_forbidden_without_token(client):
    assert client.get("/internal/listings/queue").status_code == 403


def test_queue_defaults_to_en_moderation(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p = _property()
    db_session.add(p)
    db_session.add(_listing(p, "PUBLIEE"))
    db_session.add(_listing(p, "EN_MODERATION"))
    db_session.add(_listing(p, "BROUILLON"))
    db_session.commit()
    resp = client.get("/internal/listings/queue", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["status"] == "EN_MODERATION"
    assert items[0]["owner_id"] == 1
    assert items[0]["created_at"] is not None


def test_queue_filters_by_status(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p = _property()
    db_session.add(p)
    db_session.add(_listing(p, "PUBLIEE"))
    db_session.add(_listing(p, "REJETEE"))
    db_session.commit()
    resp = client.get("/internal/listings/queue", params={"status": "REJETEE"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1 and items[0]["status"] == "REJETEE"


def test_queue_rejects_unknown_status(client, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    resp = client.get("/internal/listings/queue", params={"status": "NOPE"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 400


def test_queue_wrong_tenant_returns_empty(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p = _property()
    db_session.add(p)
    db_session.add(_listing(p, "EN_MODERATION"))
    db_session.commit()
    resp = client.get("/internal/listings/queue", params={"tenant": "semsar"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["items"] == []
