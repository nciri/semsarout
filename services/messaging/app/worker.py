"""Consumer messaging — projette l'existence des biens (`listing.*`) dans `listing_ro`.

    python -m app.worker

Idempotent (dédup par message_id). Sert uniquement à valider `property_id` à l'envoi.
"""
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
            if db.get(ListingRO, pid) is None:
                db.add(ListingRO(id=pid))
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
