"""Modèles du service audit (schéma `audit`).

- `ActivityLog` : journal d'audit transverse (projection — source = les writers via `audit.logged`).
- `UserRO` : noms des acteurs (via `user.*`) pour `user_name`. Reconstructibles.
"""
from datetime import datetime
from sqlalchemy import JSON, BigInteger, Column, DateTime, Integer, String

from .db import Base


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, index=True)
    action = Column(String(50), nullable=False)
    entity_type = Column(String(50), index=True)
    entity_id = Column(Integer)
    extra_data = Column(JSON)
    ip_address = Column(String(45))
    agency_id = Column(Integer, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self, user_name=None) -> dict:
        return {
            "id": self.id, "user_id": self.user_id, "user_name": user_name,
            "action": self.action, "entity_type": self.entity_type, "entity_id": self.entity_id,
            "extra_data": self.extra_data, "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class UserRO(Base):
    __tablename__ = "user_ro"
    id = Column(Integer, primary_key=True)
    first_name = Column(String(50))
    last_name = Column(String(50))

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class ProcessedMessage(Base):
    __tablename__ = "processed_message"
    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
