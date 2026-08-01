"""Calcul paresseux des scores — cache match_scores, invalidation par le worker.

get_scores : pour chaque paire (seeker, listing) demandée, lit le cache ; sinon
calcule depuis les projections et persiste (generate-once / render-many). Un
hard-fail est aussi mis en cache (hard_pass=False) et rendu comme None. Sans
profil scorable (gender/budget_max/city manquants) : tout None, aucun calcul.
"""
from decimal import Decimal

from sqlalchemy.orm import Session

from .models import CompatibilityProfile, ListingCriteriaRow, MatchScore, MatchingWeights
from .scoring import ListingCriteria, SeekerCriteria, Weights, evaluate


def active_weights(db: Session) -> Weights:
    """Pondérations actives, ou le défaut versionné du dépôt initial (0.4/0.6)."""
    row = db.query(MatchingWeights).filter(MatchingWeights.active.is_(True)).first()
    if row is None:
        return Weights(version="default-v1")
    return Weights(version=row.version, budget=float(row.weights["budget"]),
                   lifestyle=float(row.weights["lifestyle"]))


def _seeker_criteria(p: CompatibilityProfile) -> SeekerCriteria:
    return SeekerCriteria(
        gender=p.gender,
        budget_min=Decimal(str(p.budget_min)) if p.budget_min is not None else Decimal("0"),
        budget_max=Decimal(str(p.budget_max)), city_id=p.city,
        lifestyle=dict(p.lifestyle or {}), importance=dict(p.importance or {}),
    )


def get_scores(db: Session, seeker_id: int, listing_ids: list[str]) -> dict[str, int | None]:
    result: dict[str, int | None] = {lid: None for lid in listing_ids}
    if not listing_ids:
        return result
    profile = db.query(CompatibilityProfile).filter(
        CompatibilityProfile.seeker_id == seeker_id).first()
    if profile is None:
        return result

    cached = db.query(MatchScore).filter(MatchScore.seeker_id == seeker_id,
                                         MatchScore.listing_id.in_(listing_ids)).all()
    by_listing = {c.listing_id: c for c in cached}
    missing = [lid for lid in listing_ids if lid not in by_listing]

    if missing:
        weights = active_weights(db)
        seeker = _seeker_criteria(profile)
        rows = db.query(ListingCriteriaRow).filter(
            ListingCriteriaRow.listing_id.in_(missing)).all()
        for row in rows:
            outcome = evaluate(seeker, ListingCriteria(
                listing_id=row.listing_id, housing_gender=row.housing_gender,
                rent=Decimal(str(row.rent)), city_id=row.city, capacity=row.capacity,
                house_rules=dict(row.house_rules or {})), weights)
            score = MatchScore(seeker_id=seeker_id, listing_id=row.listing_id,
                               score=outcome.score, hard_pass=outcome.hard_pass,
                               explanations={"reasons": outcome.explanations},
                               weights_version=weights.version)
            db.add(score)
            by_listing[row.listing_id] = score
        db.commit()

    for lid, cached_row in by_listing.items():
        result[lid] = cached_row.score if cached_row.hard_pass else None
    return result
