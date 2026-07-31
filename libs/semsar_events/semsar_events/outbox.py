"""Outbox transactionnel : les événements sont écrits DANS la transaction métier,
puis publiés de façon fiable par un relais (garantie « au moins une fois »)."""
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, Index, Integer, String
from sqlalchemy import JSON
from sqlalchemy.orm import declarative_base

_log = logging.getLogger("semsar_events.relay")

OutboxBase = declarative_base()


class OutboxEvent(OutboxBase):
    __tablename__ = "outbox"

    # Integer sur SQLite (alias du rowid → autoincrément natif), BIGINT en Postgres :
    # BigInteger seul n'est pas reconnu comme rowid alias par SQLite et ne s'auto-incrémente pas.
    id = Column(Integer().with_variant(BigInteger(), "postgresql"), primary_key=True, autoincrement=True)
    aggregate_type = Column(String(80), nullable=False)
    aggregate_id = Column(String(80), nullable=False)
    event_type = Column(String(120), nullable=False)  # routing key, ex. « listing.published »
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc))
    published_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_outbox_unpublished", "published_at"),)


def enqueue(session, aggregate_type: str, aggregate_id, event_type: str, payload: dict) -> None:
    """À appeler DANS la même session/transaction que la mutation métier."""
    session.add(
        OutboxEvent(
            aggregate_type=aggregate_type,
            aggregate_id=str(aggregate_id),
            event_type=event_type,
            payload=payload,
        )
    )


def relay_batch(session, publisher, batch_size: int = 100) -> int:
    """Publie les événements non encore publiés et les marque. Renvoie le nombre publié.
    À exécuter en boucle par un worker (Celery/beat ou process dédié)."""
    rows = (
        session.query(OutboxEvent)
        .filter(OutboxEvent.published_at.is_(None))
        .order_by(OutboxEvent.id)
        .limit(batch_size)
        .all()
    )
    count = 0
    for row in rows:
        # message_id namespacé par aggregate_type (domaine) : les id d'outbox sont locaux à
        # chaque publisher → sans namespace ils collisionnent chez un consumer multi-publisher
        # (ex. crm consomme listing.* ET transaction.*). aggregate_type est disjoint par domaine.
        publisher.publish(row.event_type, row.payload,
                          message_id=f"{row.aggregate_type}:{row.id}")
        row.published_at = datetime.now(timezone.utc)
        count += 1
    if count:
        session.commit()
    return count


def run_relay(session_factory, url: str, exchange: str = "semsar.events",
              idle_sleep: float = 1.0) -> None:
    """Boucle de relais **résiliente** : ne meurt jamais sur une erreur transitoire (perte
    RabbitMQ, hoquet DB). En cas d'échec, reconnecte le publisher, temporise, et réessaie —
    les événements non publiés restent en attente jusqu'au retour du courtier."""
    from .publisher import EventPublisher

    publisher = EventPublisher(url, exchange)
    try:
        while True:
            try:
                session = session_factory()
                try:
                    published = relay_batch(session, publisher)
                finally:
                    session.close()
                time.sleep(idle_sleep if published == 0 else 0.0)
            except Exception as exc:  # noqa: BLE001
                _log.warning("relais : lot échoué, reconnexion + backoff : %s", exc)
                publisher.reset()
                time.sleep(2.0)
    finally:
        publisher.close()
