"""Outbox transactionnel : les événements sont écrits DANS la transaction métier,
puis publiés de façon fiable par un relais (garantie « au moins une fois »)."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, Index, String
from sqlalchemy import JSON
from sqlalchemy.orm import declarative_base

OutboxBase = declarative_base()


class OutboxEvent(OutboxBase):
    __tablename__ = "outbox"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
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
        publisher.publish(row.event_type, row.payload, message_id=str(row.id))
        row.published_at = datetime.now(timezone.utc)
        count += 1
    if count:
        session.commit()
    return count
