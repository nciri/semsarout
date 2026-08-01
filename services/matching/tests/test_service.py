from decimal import Decimal

from app.models import CompatibilityProfile, ListingCriteriaRow, MatchScore
from app.service import get_scores


def _fill(db, *, seeker=True, listings=("l1",)):
    if seeker:
        db.add(CompatibilityProfile(seeker_id=7, gender="FEMME", budget_min=Decimal("1000"),
                                    budget_max=Decimal("2500"), city="Casablanca",
                                    lifestyle={"tabac": "non_fumeur"},
                                    importance={"tabac": "DECISIF"}))
    for lid in listings:
        db.add(ListingCriteriaRow(listing_id=lid, housing_gender="FEMININ",
                                  rent=Decimal("2000"), city="Casablanca", capacity=3,
                                  house_rules={"tabac": "non_fumeur"}))
    db.commit()


def test_lazy_compute_and_cache(db_session):
    _fill(db_session)
    scores = get_scores(db_session, 7, ["l1"])
    assert isinstance(scores["l1"], int) and 0 < scores["l1"] <= 100
    cached = db_session.query(MatchScore).filter_by(seeker_id=7, listing_id="l1").one()
    assert cached.hard_pass is True and cached.weights_version == "default-v1"
    # 2e appel : lit le cache (même valeur, pas de nouvelle ligne)
    assert get_scores(db_session, 7, ["l1"]) == scores
    assert db_session.query(MatchScore).count() == 1


def test_hard_fail_cached_as_null(db_session):
    _fill(db_session, listings=())
    db_session.add(ListingCriteriaRow(listing_id="l2", housing_gender="MASCULIN",
                                      rent=Decimal("2000"), city="Casablanca", capacity=3,
                                      house_rules={}))
    db_session.commit()
    scores = get_scores(db_session, 7, ["l2"])
    assert scores["l2"] is None
    assert db_session.query(MatchScore).filter_by(listing_id="l2").one().hard_pass is False


def test_no_profile_returns_all_null_without_compute(db_session):
    _fill(db_session, seeker=False)
    assert get_scores(db_session, 99, ["l1"]) == {"l1": None}
    assert db_session.query(MatchScore).count() == 0


def test_unknown_listing_null(db_session):
    _fill(db_session)
    assert get_scores(db_session, 7, ["absent"]) == {"absent": None}


def test_multiple_listings_partial_cache(db_session):
    _fill(db_session, listings=("l1", "l2"))
    # Premier appel : calcule les deux
    scores1 = get_scores(db_session, 7, ["l1", "l2"])
    assert len(scores1) == 2 and all(isinstance(v, int) and v > 0 for v in scores1.values())
    assert db_session.query(MatchScore).count() == 2
    # Deuxième appel avec l3 (nouveau) : lit l1, l2 du cache et calcule l3
    db_session.add(ListingCriteriaRow(listing_id="l3", housing_gender="FEMININ",
                                      rent=Decimal("1500"), city="Casablanca", capacity=2,
                                      house_rules={"tabac": "non_fumeur"}))
    db_session.commit()
    scores2 = get_scores(db_session, 7, ["l1", "l2", "l3"])
    assert scores2["l1"] == scores1["l1"] and scores2["l2"] == scores1["l2"]
    assert isinstance(scores2["l3"], int) and scores2["l3"] > 0
    assert db_session.query(MatchScore).count() == 3
