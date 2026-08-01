"""Consumer idempotent : 1 file (+ DLQ) par service, dédoublonnage par message_id.
Résilient : reconnexion automatique en cas de perte de connexion RabbitMQ."""
import json
import logging
import time
from typing import Callable, Iterable

import pika
import pika.exceptions

_log = logging.getLogger("semsar_events.consumer")

_RECOVERABLE = (
    pika.exceptions.AMQPConnectionError,
    pika.exceptions.StreamLostError,
    pika.exceptions.ConnectionClosed,
    pika.exceptions.ChannelClosed,
    pika.exceptions.ChannelWrongStateError,
)


class EventConsumer:
    """Lie une file durable à l'exchange topic et distribue les messages à un handler.

    L'idempotence est déléguée à `already_processed(message_id) -> bool` (ex. via Redis SETNX),
    ce qui garantit un traitement effectif « exactement une fois » malgré la livraison ≥ 1.
    """

    def __init__(
        self,
        url: str,
        service_name: str,
        bindings: Iterable[str],
        exchange: str = "semsar.events",
    ) -> None:
        self._url = url
        self._queue = f"{service_name}.events"
        self._dlq = f"{service_name}.events.dlq"
        self._exchange = exchange
        self._bindings = list(bindings)

    def _declare(self, ch) -> None:
        ch.exchange_declare(self._exchange, exchange_type="topic", durable=True)
        # DLQ
        ch.queue_declare(self._dlq, durable=True)
        # File principale avec renvoi vers la DLQ
        ch.queue_declare(
            self._queue,
            durable=True,
            arguments={"x-dead-letter-exchange": "", "x-dead-letter-routing-key": self._dlq},
        )
        for pattern in self._bindings:
            ch.queue_bind(self._queue, self._exchange, routing_key=pattern)

    def run(
        self,
        handler: Callable[[str, dict, str], None],
        already_processed: Callable[[str], bool] = lambda _mid: False,
    ) -> None:
        """`handler(routing_key, payload, message_id)` : le message_id permet au
        handler d'être idempotent (dédup dans sa propre transaction). `already_processed`
        est un pré-filtre optionnel et bon marché.

        Boucle **résiliente** : sur perte de connexion RabbitMQ, reconnecte et reprend la
        consommation (les messages non ackés sont redélivrés — traitement idempotent requis)."""

        def _on_message(_ch, method, props, body):
            mid = props.message_id or ""
            if mid and already_processed(mid):
                _ch.basic_ack(method.delivery_tag)
                return
            try:
                handler(method.routing_key, json.loads(body), mid)
                _ch.basic_ack(method.delivery_tag)
            except Exception:  # noqa: BLE001 — renvoi en DLQ, pas de requeue infini
                _ch.basic_nack(method.delivery_tag, requeue=False)

        while True:
            conn = None
            try:
                conn = pika.BlockingConnection(pika.URLParameters(self._url))
                ch = conn.channel()
                self._declare(ch)
                ch.basic_qos(prefetch_count=16)
                ch.basic_consume(self._queue, _on_message)
                _log.info("consumer '%s' connecté", self._queue)
                ch.start_consuming()
            except _RECOVERABLE as exc:
                _log.warning("consumer '%s' déconnecté, reconnexion : %s", self._queue, exc)
                time.sleep(2.0)
            except KeyboardInterrupt:
                break
            finally:
                try:
                    if conn is not None and conn.is_open:
                        conn.close()
                except Exception:  # noqa: BLE001
                    pass
