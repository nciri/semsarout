"""Consumer messaging — projette listing_ro et amorce les fils médiés.

    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import Conversation, ListingRO, ProcessedMessage


def _open_thread(db, context_type, context_ref_id, property_id, owner_party, requester_party) -> None:
    exists = (db.query(Conversation)
              .filter(Conversation.property_id == property_id,
                      Conversation.requester_party == requester_party,
                      Conversation.context_type == context_type).first())
    if exists is None:
        db.add(Conversation(property_id=property_id, owner_party=owner_party,
                            requester_party=requester_party, context_type=context_type,
                            context_ref_id=context_ref_id, status="open"))


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
            if db.get(ListingRO, payload.get("id")) is None:
                db.add(ListingRO(id=payload.get("id")))
        elif routing_key == "rental.application.received":
            _open_thread(db, "rental_application", payload.get("id"), payload.get("property_id"),
                         payload.get("owner_id"), payload.get("applicant_user_id"))
        elif routing_key == "sale.inquiry.created":
            _open_thread(db, "sale_inquiry", payload.get("id"), payload.get("property_id"),
                         payload.get("seller_party"), payload.get("buyer_party"))
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
        bindings=["listing.#", "rental.application.received", "sale.inquiry.created"],
        exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
