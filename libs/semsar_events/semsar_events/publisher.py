"""Publication vers l'exchange topic RabbitMQ « semsar.events »."""
import json

import pika


class EventPublisher:
    def __init__(self, url: str, exchange: str = "semsar.events") -> None:
        self._url = url
        self._exchange = exchange
        self._conn: pika.BlockingConnection | None = None
        self._ch = None

    def _channel(self):
        if self._ch is None or self._ch.is_closed:
            self._conn = pika.BlockingConnection(pika.URLParameters(self._url))
            self._ch = self._conn.channel()
            self._ch.exchange_declare(self._exchange, exchange_type="topic", durable=True)
        return self._ch

    def publish(self, routing_key: str, payload: dict, message_id: str | None = None) -> None:
        self._channel().basic_publish(
            exchange=self._exchange,
            routing_key=routing_key,
            body=json.dumps(payload, default=str).encode("utf-8"),
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=2,  # persistant
                message_id=message_id,
            ),
        )

    def close(self) -> None:
        if self._conn is not None and self._conn.is_open:
            self._conn.close()
