"""Modèles du service notification (schéma `notification`)."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, String

from .db import Base


class NotificationLog(Base):
    __tablename__ = "notification_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    channel = Column(String(20), nullable=False)  # email|sms|whatsapp|log
    recipient = Column(String(120), nullable=False)
    template = Column(String(120), nullable=False)  # routing key de l'événement source
    status = Column(String(20), nullable=False, default="sent")
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class ProcessedMessage(Base):
    """Registre d'idempotence : un message_id traité n'est jamais rejoué."""
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
