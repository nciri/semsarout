from decimal import Decimal

from app.models import CompatibilityProfile, ListingCriteriaRow, MatchingWeights

from tests.conftest import INTERNAL


def test_internal_token_required(client):
    resp = client.post("/internal/scores", json={"user_id": 7, "listing_ids": ["x"]})
    assert resp.status_code == 403


def test_scores_endpoint(client, db_session):
    db_session.add(CompatibilityProfile(seeker_id=7, gender="FEMME",
                                        budget_min=Decimal("1000"), budget_max=Decimal("2500"),
                                        city="Casablanca", lifestyle={}, importance={}))
    db_session.add(ListingCriteriaRow(listing_id="l1", housing_gender="FEMININ",
                                      rent=Decimal("1000"), city="Casablanca", capacity=2,
                                      house_rules={}))
    db_session.commit()
    resp = client.post("/internal/scores", headers=INTERNAL,
                       json={"user_id": 7, "listing_ids": ["l1", "absent"]})
    assert resp.status_code == 200
    assert resp.json() == {"scores": {"l1": 100, "absent": None}}


def test_get_weights_requires_token(client):
    assert client.get("/internal/weights").status_code == 403


def test_get_weights_default(client):
    resp = client.get("/internal/weights", headers=INTERNAL)
    assert resp.status_code == 200
    assert resp.json() == {"version": "default-v1", "budget": 0.4, "lifestyle": 0.6}


def test_get_weights_active_version(client, db_session):
    db_session.add(MatchingWeights(version="v2", weights={"budget": 0.3, "lifestyle": 0.7},
                                   active=True))
    db_session.commit()
    resp = client.get("/internal/weights", headers=INTERNAL)
    assert resp.status_code == 200
    assert resp.json() == {"version": "v2", "budget": 0.3, "lifestyle": 0.7}


def test_put_weights_requires_token(client):
    resp = client.put("/internal/weights", json={"budget": 0.5, "lifestyle": 0.5})
    assert resp.status_code == 403


def test_put_weights_rejects_invalid_sum(client):
    resp = client.put("/internal/weights", headers=INTERNAL,
                      json={"budget": 0.5, "lifestyle": 0.8})
    assert resp.status_code == 422


def test_put_weights_creates_new_active_version(client, db_session):
    db_session.add(MatchingWeights(version="v1", weights={"budget": 0.4, "lifestyle": 0.6},
                                   active=True))
    db_session.commit()
    resp = client.put("/internal/weights", headers=INTERNAL,
                      json={"budget": 0.3, "lifestyle": 0.7})
    assert resp.status_code == 200
    body = resp.json()
    assert body["budget"] == 0.3
    assert body["lifestyle"] == 0.7
    active_rows = db_session.query(MatchingWeights).filter(
        MatchingWeights.active.is_(True)).all()
    assert len(active_rows) == 1
    assert active_rows[0].version == body["version"]
