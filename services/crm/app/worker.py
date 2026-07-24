"""Consumer crm — projette le titre des biens (via `listing.*`) pour `property_title`.

    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import Lead, ProcessedMessage, PropertyRO


def _create_lead(db, payload: dict) -> None:
    """Un contact sur une annonce (`listing.contacted`) devient un lead crm."""
    db.add(Lead(
        name=payload.get("name"), email=payload.get("email"), phone=payload.get("phone"),
        message=payload.get("message"), source=payload.get("source") or "contact_form",
        service=payload.get("service"), status="new",
        property_id=payload.get("property_id"), agency_id=payload.get("agency_id"),
    ))


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "listing.contacted":
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
