"""Consumer trust-safety — calcule trust_level depuis KYC + transactions conclues.
Propage le KYC d'un utilisateur aux agences qu'il possède (`Agency.owner_id`),
via l'endpoint interne `GET /internal/agencies?owner_id=` du service `agency`.

    python -m app.worker
"""
import os

import httpx

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal
from .main import upsert_trust_level
from .models import ProcessedMessage

_DEAL_EVENTS = {"commission.settled", "sale.compromis.signed", "rental.lease.signed"}
AGENCY_URL = os.environ.get("AGENCY_URL", "http://localhost:8512")


def _owned_agency_ids(user_id: int) -> list[int]:
    try:
        resp = httpx.get(
            f"{AGENCY_URL}/internal/agencies", params={"owner_id": user_id},
            headers={"x-internal-token": get_settings().internal_token}, timeout=5.0,
        )
        if resp.status_code != 200:
            return []
        return [a["id"] for a in resp.json().get("agencies", [])]
    except httpx.HTTPError:
        return []


def _deal_entity(payload: dict) -> tuple[str, int] | None:
    if payload.get("agency_id"):
        return "agency", int(payload["agency_id"])
    for key in ("account_id", "owner_id"):
        if payload.get(key):
            return "user", int(payload[key])
    return None


def _handle_with_session(db, routing_key: str, payload: dict, message_id: str) -> None:
    if message_id and db.get(ProcessedMessage, message_id) is not None:
        return
    if routing_key == "identity.kyc.verified" and payload.get("user_id") is not None:
        user_id = int(payload["user_id"])
        upsert_trust_level(db, "user", user_id, min_level="verified")
        for agency_id in _owned_agency_ids(user_id):
            upsert_trust_level(db, "agency", agency_id, min_level="verified")
    elif routing_key in _DEAL_EVENTS:
        target = _deal_entity(payload)
        if target is not None:
            upsert_trust_level(db, target[0], target[1], increment_deals=True)
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
    consumer = EventConsumer(
        settings.rabbitmq_url, service_name=settings.service_name,
        bindings=["identity.kyc.verified", "commission.settled",
                 "sale.compromis.signed", "rental.lease.signed"],
        exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
