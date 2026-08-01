"""Consumer geo — projette les biens (`listing.*`) dans `listing_ro` pour le positionnement prix.

    python -m app.worker

Idempotent (dédup par message_id). La projection ne garde que les champs utiles au calcul
prix/m² (prix, surface, localisation, type, statut). Reconstructible en rejouant les événements.
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
        if routing_key == "listing.deleted":
            ro = db.get(ListingRO, payload.get("id"))
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            pid = payload.get("id")
            ro = db.get(ListingRO, pid)
            if ro is None:
                ro = ListingRO(id=pid)
                db.add(ro)
            ro.price = payload.get("price")
            ro.price_per_sqm = payload.get("price_per_sqm")
            ro.surface = payload.get("surface")
            ro.city = payload.get("city")
            ro.neighborhood = payload.get("neighborhood")
            ro.property_type = payload.get("property_type")
            ro.transaction_type = payload.get("transaction_type")
            ro.status = payload.get("status")
        # autres (ex. listing.contacted) : non pertinents pour geo → ignorés
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
