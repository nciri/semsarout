"""Consumer rental — maintient property_ro (titre/ville) via listing.* et client_ro (nom/email)
via crm.client.* pour l'affichage back-office.

    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import ClientRO, ProcessedMessage, PropertyRO


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
            ro = db.get(PropertyRO, pid) or PropertyRO(id=pid)
            ro.title = payload.get("title")
            ro.city = payload.get("city")
            db.add(ro)
        elif routing_key in ("crm.client.created", "crm.client.updated"):
            cid = payload.get("id")
            ro = db.get(ClientRO, cid) or ClientRO(id=cid)
            ro.first_name = payload.get("first_name")
            ro.last_name = payload.get("last_name")
            ro.email = payload.get("email")
            ro.client_type = payload.get("client_type")
            db.add(ro)
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
        bindings=["listing.#", "crm.client.#"], exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
