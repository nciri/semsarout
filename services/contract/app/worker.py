"""Consumer contract — maintient les projections de fusion : `property_ro` (via `listing.*`)
et `transaction_ro` (via `transaction.*`). `agency_ro`/`client_ro` sont amorcées à la migration
(les domaines agence/client n'émettent pas encore d'événements).

    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import ProcessedMessage, PropertyRO, TransactionRO


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "listing.deleted":
            ro = db.get(PropertyRO, payload.get("id"))
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            pid = payload.get("id")
            ro = db.get(PropertyRO, pid)
            if ro is None:
                ro = PropertyRO(id=pid)
                db.add(ro)
            ro.agency_id = payload.get("agency_id")
            ro.address = payload.get("address")
            ro.city = payload.get("city")
            ro.property_type = payload.get("property_type")
            ro.price = payload.get("price")
            ro.surface = payload.get("surface")
            ro.rooms = payload.get("rooms")
            ro.reference = payload.get("reference")
        elif routing_key == "transaction.deleted":
            ro = db.get(TransactionRO, payload.get("id"))
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("transaction.created", "transaction.updated"):
            tid = payload.get("id")
            ro = db.get(TransactionRO, tid)
            if ro is None:
                ro = TransactionRO(id=tid)
                db.add(ro)
            ro.agency_id = payload.get("agency_id")
            ro.property_id = payload.get("property_id")
            ro.client_id = payload.get("client_id")
            ro.agent_id = payload.get("agent_id")
            ro.transaction_type = payload.get("transaction_type")
            ro.reference = payload.get("reference")
            ro.asking_price = payload.get("asking_price")
            ro.commission_rate = payload.get("commission_rate")
            ro.commission_amount = payload.get("commission_amount")
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
        bindings=["listing.#", "transaction.#"], exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
