"""Modèles du service analytics (schéma `analytics`)."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, String

from .db import Base


class MetricCounter(Base):
    """Compteur d'événements (monotone, agrégat k-anonymisé). Ex. « listings.created »."""
    __tablename__ = "metric_counter"

    name = Column(String(160), primary_key=True)
    value = Column(BigInteger, nullable=False, default=0)


class ProcessedMessage(Base):
    """Idempotence : un compteur ne doit PAS être incrémenté deux fois sur un rejeu."""
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
