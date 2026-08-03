from decimal import Decimal

from app.models import CompatibilityProfile, ListingCriteriaRow

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
