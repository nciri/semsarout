"""Modèles du service messaging (schéma `messaging`).

- `BuyerMessage` : messages acheteur → vendeur/agence (source de vérité, forme identique
  au monolithe).
- `ListingRO` : projection minimale (id) des biens via `listing.*` — pour valider l'existence
  d'un bien à l'envoi. Reconstructible.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, Integer, String, Text

from .db import Base


class BuyerMessage(Base):
    __tablename__ = "buyer_message"

    id = Column(Integer, primary_key=True, autoincrement=True)
    buyer_id = Column(Integer, nullable=False, index=True)
    property_id = Column(Integer, nullable=False, index=True)
    subject = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    buyer_email = Column(String(120))
    buyer_phone = Column(String(20))
    status = Column(String(20), default="new")  # new | read | replied | archived
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "buyer_id": self.buyer_id,
            "property_id": self.property_id,
            "subject": self.subject,
            "message": self.message,
            "buyer_email": self.buyer_email,
            "buyer_phone": self.buyer_phone,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
        }


class ListingRO(Base):
    __tablename__ = "listing_ro"

    id = Column(BigInteger, primary_key=True)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
