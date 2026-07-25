"""Consumer agency — projette (id, agency_id) des biens via `listing.*` pour properties_count.

    python -m app.worker
Idempotent (dédup par message_id). Reconstructible.
"""
from datetime import datetime

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import ListingRO, ProcessedMessage


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        pid = payload.get("id")
        if routing_key == "listing.deleted":
            ro = db.get(ListingRO, pid)
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            ro = db.get(ListingRO, pid)
            if ro is None:
                ro = ListingRO(id=pid)
                db.add(ro)
            ro.agency_id = payload.get("agency_id")
            for f in ("reference", "title", "price", "city", "property_type",
                      "transaction_type", "surface", "rooms", "bedrooms", "status"):
                setattr(ro, f, payload.get(f))
            pub = payload.get("published_at")
            ro.published_at = datetime.fromisoformat(pub) if pub else None
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url, service_name=settings.service_name,
        bindings=["listing.#"], exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
