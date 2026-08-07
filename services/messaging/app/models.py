"""Modèles du service messaging (schéma `messaging`).

- `BuyerMessage` : messages acheteur → vendeur/agence (source de vérité, forme identique
  au monolithe).
- `ListingRO` : projection minimale (id) des biens via `listing.*` — pour valider l'existence
  d'un bien à l'envoi. Reconstructible.
- `Conversation`/`Message` : messagerie bidirectionnelle générique (legacy semsar ET
  m3a-l3achrane, distingués par `tenant`).
- `Notification` : notifications in-app (m3a-l3achrane) — feed « non lues d'abord » +
  compteur, alimenté par les événements du domaine (bail/paiement) et par les nouveaux
  messages de cette même messagerie.
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)

from .db import Base

DEFAULT_TENANT = "m3a-l3achrane"


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


class Conversation(Base):
    __tablename__ = "conversation"
    __table_args__ = (UniqueConstraint("tenant", "property_id", "requester_party", "context_type",
                                       name="uq_conversation_thread"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Legacy semsar (contact acheteur/vendeur) n'a pas de tenant : défaut m3a-l3achrane,
    # sans impact sur les fils legacy déjà servis sous ce même tenant implicite.
    tenant = Column(String(30), nullable=False, default=DEFAULT_TENANT,
                    server_default=DEFAULT_TENANT, index=True)
    property_id = Column(Integer, nullable=False, index=True)  # ancre de contexte (listing/bien)
    owner_party = Column(Integer, index=True)       # propriétaire (uid opaque)
    requester_party = Column(Integer, index=True)   # candidat / acheteur (uid opaque)
    context_type = Column(String(30), nullable=False)   # rental_application | sale_inquiry | listing | legacy
    context_ref_id = Column(Integer)
    status = Column(String(20), default="open")     # open | closed | archived
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {"id": self.id, "tenant": self.tenant, "property_id": self.property_id,
                "owner_party": self.owner_party,
                "requester_party": self.requester_party, "context_type": self.context_type,
                "context_ref_id": self.context_ref_id, "status": self.status,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "updated_at": self.updated_at.isoformat() if self.updated_at else None}


class Message(Base):
    __tablename__ = "message"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversation.id"), nullable=False, index=True)
    sender_party = Column(Integer, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime)

    def to_dict(self) -> dict:
        return {"id": self.id, "conversation_id": self.conversation_id,
                "sender_party": self.sender_party, "body": self.body,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "read_at": self.read_at.isoformat() if self.read_at else None}


NOTIFICATION_TYPES = {
    "message.new", "lease.to_sign", "payment.due", "payment.received",
}


class Notification(Base):
    """Notification in-app d'un utilisateur (m3a-l3achrane) : générée par les événements du
    domaine (bail créé → à signer, paiement séquestré/libéré → reçu) et par les nouveaux
    messages de cette même messagerie. `payload` porte les identifiants utiles au front pour
    router/afficher (lease_id, conversation_id, ...) ; `link` un chemin front prêt à l'emploi."""

    __tablename__ = "notification"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant = Column(String(30), nullable=False, default=DEFAULT_TENANT,
                    server_default=DEFAULT_TENANT, index=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    type = Column(String(40), nullable=False)
    payload = Column(JSON, default=dict)
    link = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "tenant": self.tenant, "user_id": self.user_id, "type": self.type,
            "payload": self.payload or {}, "link": self.link,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
        }
