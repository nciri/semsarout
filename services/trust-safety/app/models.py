"""Modèles du service trust-safety (schéma `trust_safety`).

- `ModerationStatus` : statut de modération par compte (user/agency) — **source du masquage**
  (§6). Amorcé depuis le monolithe, maintenu par les routes suspend/unsuspend.
- `AdminAction` : journal d'audit des actions super-admin (qui, quoi, quand, pourquoi).
"""
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, Integer, String, Text

from .db import Base


class ModerationStatus(Base):
    __tablename__ = "moderation_status"

    entity_type = Column(String(10), primary_key=True)  # user | agency
    entity_id = Column(BigInteger, primary_key=True)
    is_suspended = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    reason = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AdminAction(Base):
    __tablename__ = "admin_action"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    actor_id = Column(Integer, index=True)
    action = Column(String(30), nullable=False)  # suspend | unsuspend | ...
    entity_type = Column(String(10), nullable=False)
    entity_id = Column(BigInteger, nullable=False)
    details = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
