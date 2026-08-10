"""Consumer — livre les webhooks partenaires abonnés sur les événements `partner.*`.

    python -m app.worker
"""
import time

import httpx
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .delivery import deliver
from .models import Webhook, WebhookDelivery, _now


def _http_post(url: str, data: bytes, headers: dict) -> int:
    try:
        resp = httpx.post(url, content=data, headers=headers, timeout=5.0)
        return resp.status_code
    except httpx.HTTPError:
        return 599


def _backoff(attempt: int) -> None:
    time.sleep(min(2**attempt, 30))


def dispatch_event(db, partner_id: str, event_type: str, payload: dict, *,
                    post=_http_post, sleep=_backoff) -> list[WebhookDelivery]:
    """Mapping event → webhooks → deliver : pour `event_type` (`partner.*`),
    livre à tous les `Webhook` actifs du partenaire `partner_id` abonnés à cet
    event, et persiste (sans commit — laissé à l'appelant) une
    `WebhookDelivery` par livraison tentée. Cloisonné strictement par
    `partner_id` — jamais de livraison croisée entre partenaires."""
    webhooks = (
        db.query(Webhook)
        .filter(Webhook.partner_id == partner_id, Webhook.active.is_(True))
        .all()
    )
    deliveries = []
    for webhook in webhooks:
        if event_type not in (webhook.events or []):
            continue
        result = deliver(
            {"url": webhook.url, "secret": webhook.secret}, event_type, payload,
            post=post, max_attempts=3, sleep=sleep,
        )
        delivery = WebhookDelivery(
            webhook_id=webhook.id, event_type=event_type, payload=payload,
            status=result.status, attempts=result.attempts,
            last_attempt_at=_now(), response_code=result.response_code,
        )
        db.add(delivery)
        deliveries.append(delivery)
    return deliveries


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    if not routing_key.startswith("partner."):
        return
    partner_id = payload.get("partner_id")
    if not partner_id:
        return
    db = SessionLocal()
    try:
        dispatch_event(db, partner_id, routing_key, payload)
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
        bindings=["partner.#"], exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
