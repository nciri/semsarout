"""Publication vers l'exchange topic RabbitMQ « semsar.events » — résiliente à la
perte de connexion (reconnexion + réessai)."""
import json
import logging
import time

import pika
import pika.exceptions

_log = logging.getLogger("semsar_events.publisher")

# Erreurs de connexion/canal récupérables → on reconnecte et on réessaie.
_RECOVERABLE = (
    pika.exceptions.AMQPConnectionError,
    pika.exceptions.StreamLostError,
    pika.exceptions.ConnectionClosed,
    pika.exceptions.ChannelClosed,
    pika.exceptions.ChannelWrongStateError,
)


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

    def reset(self) -> None:
        """Ferme et oublie la connexion : la prochaine publication reconnectera."""
        try:
            if self._conn is not None and self._conn.is_open:
                self._conn.close()
        except Exception:  # noqa: BLE001
            pass
        self._conn = None
        self._ch = None

    def publish(self, routing_key: str, payload: dict, message_id: str | None = None,
                attempts: int = 3) -> None:
        body = json.dumps(payload, default=str).encode("utf-8")
        props = pika.BasicProperties(content_type="application/json", delivery_mode=2,
                                     message_id=message_id)
        for attempt in range(1, attempts + 1):
            try:
                self._channel().basic_publish(
                    exchange=self._exchange, routing_key=routing_key, body=body, properties=props)
                return
            except _RECOVERABLE as exc:
                _log.warning("publish échoué (tentative %d/%d), reconnexion : %s",
                             attempt, attempts, exc)
                self.reset()
                if attempt == attempts:
                    raise
                time.sleep(min(2 ** (attempt - 1), 5))  # backoff 1s, 2s, 4s… (plafonné)

    def close(self) -> None:
        if self._conn is not None and self._conn.is_open:
            self._conn.close()
