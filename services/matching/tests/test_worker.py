from decimal import Decimal

from app.models import CompatibilityProfile, ListingCriteriaRow, MatchScore
from app.worker import _handle_with_session

PROFILE = {"user_id": 7, "gender": "FEMME", "budget_min": 1000.0, "budget_max": 2500.0,
           "city": "Casablanca", "lifestyle": {"tabac": "non-fumeur"},
           "importance": {"tabac": "DECISIF"}, "complete": True}
PUBLISHED = {"listing_id": "l1", "housing_gender": "FEMININ", "rent": 2000.0,
             "city": "Casablanca", "capacity": 3, "house_rules": {"tabac": "non-fumeur"},
             "title": "T", "status": "PUBLIEE"}


def _score(db, seeker=7, listing="l1"):
    db.add(MatchScore(seeker_id=seeker, listing_id=listing, score=80, hard_pass=True,
                      explanations={}, weights_version="default-v1"))
    db.commit()


def test_profile_updated_upserts_and_invalidates(db_session):
    _score(db_session)
    _handle_with_session(db_session, "coloc.profile_updated", PROFILE, "m1")
    p = db_session.query(CompatibilityProfile).filter_by(seeker_id=7).one()
    assert p.city == "Casablanca" and p.lifestyle == {"tabac": "non-fumeur"}
    assert db_session.query(MatchScore).count() == 0  # cache du chercheur invalidé
    # mise à jour (upsert, pas de doublon)
    _handle_with_session(db_session, "coloc.profile_updated", {**PROFILE, "city": "Rabat"}, "m2")
    assert db_session.query(CompatibilityProfile).count() == 1
    assert db_session.query(CompatibilityProfile).one().city == "Rabat"


def test_incomplete_profile_removes_projection(db_session):
    _handle_with_session(db_session, "coloc.profile_updated", PROFILE, "m1")
    _handle_with_session(db_session, "coloc.profile_updated",
                         {**PROFILE, "gender": None, "complete": False}, "m2")
    assert db_session.query(CompatibilityProfile).count() == 0


def test_listing_published_upserts_and_invalidates(db_session):
    _score(db_session, seeker=8)
    _handle_with_session(db_session, "coloc.listing_published", PUBLISHED, "m1")
    row = db_session.query(ListingCriteriaRow).filter_by(listing_id="l1").one()
    assert row.rent == Decimal("2000") and row.house_rules == {"tabac": "non-fumeur"}
    assert db_session.query(MatchScore).count() == 0  # cache de l'annonce invalidé


def test_status_changed_removes_criteria_and_scores(db_session):
    _handle_with_session(db_session, "coloc.listing_published", PUBLISHED, "m1")
    _score(db_session)
    _handle_with_session(db_session, "coloc.listing_status_changed",
                         {"listing_id": "l1", "previous_status": "PUBLIEE",
                          "new_status": "ARCHIVEE"}, "m2")
    assert db_session.query(ListingCriteriaRow).count() == 0
    assert db_session.query(MatchScore).count() == 0


def test_idempotent(db_session):
    _handle_with_session(db_session, "coloc.listing_published", PUBLISHED, "same")
    _handle_with_session(db_session, "coloc.listing_published", PUBLISHED, "same")
    assert db_session.query(ListingCriteriaRow).count() == 1
