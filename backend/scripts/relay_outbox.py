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
import pika.exceptions

from app import create_app, db
from app.models.outbox import OutboxEvent

EXCHANGE = os.environ.get("EVENTS_EXCHANGE", "semsar.events")
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://semsar:semsar@localhost:5672/")


_RECOVERABLE = (
    pika.exceptions.AMQPConnectionError,
    pika.exceptions.StreamLostError,
    pika.exceptions.ConnectionClosed,
    pika.exceptions.ChannelClosed,
    pika.exceptions.ChannelWrongStateError,
)


def main() -> None:
    app = create_app()
    with app.app_context():
        # Boucle résiliente : reconnexion auto sur perte de RabbitMQ.
        while True:
            conn = None
            try:
                conn = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
                channel = conn.channel()
                channel.exchange_declare(EXCHANGE, exchange_type="topic", durable=True)
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
            except _RECOVERABLE as exc:
                print(f"[relay_outbox] déconnecté, reconnexion : {exc}", flush=True)
                db.session.rollback()
                time.sleep(2.0)
            except KeyboardInterrupt:
                break
            finally:
                try:
                    if conn is not None and conn.is_open:
                        conn.close()
                except Exception:  # noqa: BLE001
                    pass


if __name__ == "__main__":
    main()
