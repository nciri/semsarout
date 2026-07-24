"""Relais outbox → RabbitMQ du service payment.  python -m app.relay"""
import time

from semsar_common import get_settings
from semsar_events import EventPublisher, relay_batch

from .db import SessionLocal


def main() -> None:
    settings = get_settings()
    publisher = EventPublisher(settings.rabbitmq_url, settings.events_exchange)
    try:
        while True:
            db = SessionLocal()
            try:
                published = relay_batch(db, publisher)
            finally:
                db.close()
            time.sleep(1.0 if published == 0 else 0.0)
    finally:
        publisher.close()


if __name__ == "__main__":
    main()
