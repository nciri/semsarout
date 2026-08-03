"""Consumer matching — projections + invalidation ciblée du cache de scores.

coloc.profile_updated  → upsert compatibility_profiles (delete si non scorable)
                          + DELETE match_scores du chercheur.
coloc.listing_published → upsert listing_criteria + DELETE match_scores de l'annonce.
coloc.listing_status_changed (≠ PUBLIEE) → DELETE criteria + scores de l'annonce.
Idempotent par message_id.
"""
from decimal import Decimal

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal
from .models import CompatibilityProfile, ListingCriteriaRow, MatchScore, ProcessedMessage


def _handle_with_session(db, routing_key: str, payload: dict, message_id: str) -> None:
    if message_id and db.get(ProcessedMessage, message_id) is not None:
        return

    if routing_key == "coloc.profile_updated":
        seeker_id = int(payload["user_id"])
        db.query(MatchScore).filter(MatchScore.seeker_id == seeker_id).delete()
        existing = db.query(CompatibilityProfile).filter(
            CompatibilityProfile.seeker_id == seeker_id).first()
        if not payload.get("complete"):
            if existing is not None:
                db.delete(existing)
        else:
            row = existing or CompatibilityProfile(seeker_id=seeker_id)
            row.gender = payload["gender"]
            row.budget_min = Decimal(str(payload["budget_min"])) \
                if payload.get("budget_min") is not None else None
            row.budget_max = Decimal(str(payload["budget_max"]))
            row.city = payload["city"]
            row.lifestyle = payload.get("lifestyle") or {}
            row.importance = payload.get("importance") or {}
            db.add(row)

    elif routing_key == "coloc.listing_published":
        listing_id = payload["listing_id"]
        db.query(MatchScore).filter(MatchScore.listing_id == listing_id).delete()
        row = db.query(ListingCriteriaRow).filter(
            ListingCriteriaRow.listing_id == listing_id).first() \
            or ListingCriteriaRow(listing_id=listing_id)
        row.housing_gender = payload["housing_gender"]
        row.rent = Decimal(str(payload["rent"]))
        row.city = payload["city"]
        row.capacity = int(payload.get("capacity") or 1)
        row.house_rules = payload.get("house_rules") or {}
        db.add(row)

    elif routing_key == "coloc.listing_status_changed":
        if payload.get("new_status") != "PUBLIEE":
            listing_id = payload["listing_id"]
            db.query(MatchScore).filter(MatchScore.listing_id == listing_id).delete()
            db.query(ListingCriteriaRow).filter(
                ListingCriteriaRow.listing_id == listing_id).delete()

    if message_id:
        db.add(ProcessedMessage(message_id=message_id))
    db.commit()


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        _handle_with_session(db, routing_key, payload, message_id)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    consumer = EventConsumer(settings.rabbitmq_url, service_name=settings.service_name,
                             bindings=["coloc.#"], exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
