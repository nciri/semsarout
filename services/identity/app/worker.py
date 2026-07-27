"""Consumer identity — maintient la projection compte (`user_ro`) via les événements `user.*`.

    python -m app.worker

Le monolithe reste source de vérité pour les écritures utilisateur (register, profil,
suspension via trust-safety) et émet `user.created/updated/deleted` ; identity projette ces
changements pour que l'émission des JWT (login) reflète l'état courant (dont les suspensions).
Idempotent (dédup par message_id).
"""
from datetime import datetime

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import AgencyRO, ProcessedMessage, UserRO

_COLS = (
    "email", "password_hash", "first_name", "last_name", "phone", "avatar_url", "user_type",
    "account_role", "interest", "is_active", "is_verified", "suspended_reason",
    "dashboard_config", "agency_id", "team_id",
)
_DATES = ("created_at", "last_login", "suspended_at", "deleted_at", "anonymized_at")


def _parse(v):
    return datetime.fromisoformat(v) if v else None


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        uid = payload.get("id")
        if routing_key.startswith("agency."):
            # Modération d'agence (possédée par le service agency) → resync du flag de blocage
            # login sur `agency_ro` (`_login_blocked` lit AgencyRO.is_suspended/is_deleted).
            ag = db.get(AgencyRO, uid)
            if ag is not None:
                if "is_suspended" in payload:
                    ag.is_suspended = bool(payload["is_suspended"])
                if "is_deleted" in payload:
                    ag.is_deleted = bool(payload["is_deleted"])
                if "suspended_reason" in payload:
                    ag.suspended_reason = payload["suspended_reason"]
                if payload.get("name"):
                    ag.name = payload["name"]
            if message_id:
                db.add(ProcessedMessage(message_id=message_id))
            db.commit()
            return
        if routing_key == "user.deleted":
            u = db.get(UserRO, uid)
            if u is not None:
                db.delete(u)
        elif routing_key in ("user.created", "user.updated"):
            u = db.get(UserRO, uid)
            if u is None:
                u = UserRO(id=uid)
                db.add(u)
            for c in _COLS:
                if c in payload:
                    setattr(u, c, payload[c])
            for c in _DATES:
                if c in payload:
                    setattr(u, c, _parse(payload[c]))
            u.is_suspended = bool(payload.get("is_suspended"))
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
        bindings=["user.#", "agency.#"], exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
