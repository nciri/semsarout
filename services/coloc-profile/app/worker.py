"""Consumer coloc-profile — crée/synchronise les profils depuis les événements user.*.

Seuls les comptes du tenant m3a-l3achrane produisent un profil (la clé `tenant`
du payload est posée par identity depuis le plan C). Idempotent par message_id.
    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal
from .main import ensure_profile
from .models import ProcessedMessage

TENANT = "m3a-l3achrane"


def _handle_with_session(db, routing_key: str, payload: dict, message_id: str) -> None:
    if message_id and db.get(ProcessedMessage, message_id) is not None:
        return
    if routing_key in ("user.created", "user.updated") \
            and payload.get("tenant") == TENANT and payload.get("id") is not None:
        profile = ensure_profile(db, int(payload["id"]))
        if payload.get("first_name"):
            profile.display_name = payload["first_name"]
        profile.is_verified = bool(payload.get("is_verified", False))
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
                             bindings=["user.#"], exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
