"""Consumer crm — projette le titre des biens (via `listing.*`) pour `property_title`,
et maintient `transaction_ro` (via `transaction.*`) pour `transactions_count` par client.

    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import Lead, ProcessedMessage, PropertyRO, TransactionRO


def _create_lead(db, payload: dict) -> None:
    """Un contact sur une annonce (`listing.contacted`) devient un lead crm."""
    db.add(Lead(
        name=payload.get("name"), email=payload.get("email"), phone=payload.get("phone"),
        message=payload.get("message"), source=payload.get("source") or "contact_form",
        service=payload.get("service"), status="new",
        property_id=payload.get("property_id"), agency_id=payload.get("agency_id"),
        owner_id=payload.get("owner_id"),  # bien de particulier → cloisonnement /my-leads
    ))


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key in ("listing.contacted", "program.contacted"):
            _create_lead(db, payload)
        elif routing_key == "listing.deleted":
            ro = db.get(PropertyRO, payload.get("id"))
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            pid = payload.get("id")
            ro = db.get(PropertyRO, pid)
            if ro is None:
                ro = PropertyRO(id=pid)
                db.add(ro)
            ro.title = payload.get("title")
            ro.address = payload.get("address")
            ro.city = payload.get("city")
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
            ro.client_id = payload.get("client_id")
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
        bindings=["listing.#", "transaction.#", "program.#"], exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
