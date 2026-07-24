"""Relais outbox du monolithe -> RabbitMQ (Phase 1).

Lancer depuis backend/ :  python scripts/relay_outbox.py
Prérequis : table `outbox` créée (db/outbox.sql), `pika` installé, RabbitMQ up.
Le monolithe doit tourner avec SEMSAR_OUTBOX_ENABLED=1 pour PRODUIRE les événements.
"""
import json
import os
import time
from datetime import datetime

import pika

from app import create_app, db
from app.models.outbox import OutboxEvent

EXCHANGE = os.environ.get("EVENTS_EXCHANGE", "semsar.events")
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://semsar:semsar@localhost:5672/")


def main() -> None:
    app = create_app()
    conn = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
    channel = conn.channel()
    channel.exchange_declare(EXCHANGE, exchange_type="topic", durable=True)
    with app.app_context():
        while True:
            rows = (
                OutboxEvent.query.filter(OutboxEvent.published_at.is_(None))
                .order_by(OutboxEvent.id)
                .limit(100)
                .all()
            )
            for row in rows:
                channel.basic_publish(
                    exchange=EXCHANGE,
                    routing_key=row.event_type,
                    body=json.dumps(row.payload, default=str).encode("utf-8"),
                    properties=pika.BasicProperties(
                        content_type="application/json",
                        delivery_mode=2,
                        message_id=str(row.id),
                    ),
                )
                row.published_at = datetime.utcnow()
            if rows:
                db.session.commit()
            time.sleep(1.0 if not rows else 0.0)


if __name__ == "__main__":
    main()
