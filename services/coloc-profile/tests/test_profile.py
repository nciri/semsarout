from sqlalchemy import select

from semsar_events import OutboxEvent

from tests.conftest import headers


def test_get_profile_autocreates_empty(client):
    resp = client.get("/me/profile", headers=headers(user_id=7))
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_id"] == 7 and body["gender"] is None and body["lifestyle"] == []


def test_tenant_and_auth_guards(client):
    assert client.get("/me/profile").status_code in (401, 403)
    assert client.get("/me/profile", headers=headers(tenant="semsar")).status_code == 403


def test_put_profile_validates_and_emits(client, db_session):
    resp = client.put("/me/profile", headers=headers(),
                      json={"gender": "FEMME", "city": "Casablanca",
                            "budget_min": "1000.00", "budget_max": "2500.00"})
    assert resp.status_code == 200
    assert resp.json()["gender"] == "FEMME"
    # budget incohérent → 400
    assert client.put("/me/profile", headers=headers(),
                      json={"budget_min": "3000.00", "budget_max": "2500.00"}).status_code == 400
    # genre inconnu → 400
    assert client.put("/me/profile", headers=headers(),
                      json={"gender": "AUTRE"}).status_code == 400
    row = db_session.scalars(select(OutboxEvent).where(
        OutboxEvent.event_type == "coloc.profile_updated")).first()
    assert row is not None
    assert row.payload["gender"] == "FEMME" and row.payload["complete"] is True
    assert "display_name" not in row.payload  # jamais de PII dans l'événement


def test_put_lifestyle_replaces_and_validates(client, db_session):
    ok = {"answers": [
        {"question_code": "tabac", "value": "non_fumeur", "importance": "DECISIF"},
        {"question_code": "coucher", "value": "tot", "importance": "PREFERENCE"},
    ]}
    resp = client.put("/me/lifestyle", json=ok, headers=headers())
    assert resp.status_code == 200 and len(resp.json()) == 2
    # remplacement complet
    resp = client.put("/me/lifestyle", headers=headers(),
                      json={"answers": [{"question_code": "tabac", "value": "fumeur",
                                         "importance": "PREFERENCE"}]})
    assert [a["value"] for a in resp.json()] == ["fumeur"]
    # hors référentiel → 400
    assert client.put("/me/lifestyle", headers=headers(),
                      json={"answers": [{"question_code": "regime", "value": "x",
                                         "importance": "PREFERENCE"}]}).status_code == 400
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert events.count("coloc.profile_updated") == 2


def test_favorites_idempotent_cycle(client):
    h = headers(user_id=9)
    assert client.post("/me/favorites", json={"listing_id": "a" * 32}, headers=h).status_code == 204
    assert client.post("/me/favorites", json={"listing_id": "a" * 32}, headers=h).status_code == 204
    favs = client.get("/me/favorites", headers=h).json()
    assert len(favs) == 1 and favs[0]["listing_id"] == "a" * 32
    assert client.delete(f"/me/favorites/{'a' * 32}", headers=h).status_code == 204
    assert client.get("/me/favorites", headers=h).json() == []
