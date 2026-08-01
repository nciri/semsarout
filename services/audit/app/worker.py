"""Consumer audit — `audit.logged` → activity_log ; `user.*` → user_ro (noms). Idempotent."""
from datetime import datetime
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer
from .db import SessionLocal, init_db
from .models import ActivityLog, ProcessedMessage, UserRO


def _parse(v):
    return datetime.fromisoformat(v) if v else None


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "audit.logged" and payload.get("id") is not None:
            if db.get(ActivityLog, payload["id"]) is None:
                db.add(ActivityLog(
                    id=payload["id"], user_id=payload.get("user_id"), action=payload.get("action"),
                    entity_type=payload.get("entity_type"), entity_id=payload.get("entity_id"),
                    extra_data=payload.get("extra_data"), ip_address=payload.get("ip_address"),
                    agency_id=payload.get("agency_id"), created_at=_parse(payload.get("created_at"))))
        elif routing_key in ("user.created", "user.updated"):
            u = db.get(UserRO, payload.get("id"))
            if u is None:
                u = UserRO(id=payload.get("id")); db.add(u)
            u.first_name = payload.get("first_name"); u.last_name = payload.get("last_name")
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback(); raise
    finally:
        db.close()


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(settings.rabbitmq_url, service_name=settings.service_name,
                             bindings=["audit.#", "user.#"], exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
