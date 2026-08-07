"""Modèles du service trust-safety (schéma `trust_safety`).

- `ModerationStatus` : statut de modération par compte (user/agency) — **source du masquage**
  (§6). Amorcé depuis le monolithe, maintenu par les routes suspend/unsuspend.
- `AdminAction` : journal d'audit des actions super-admin (qui, quoi, quand, pourquoi).
- `Report` : signalements utilisateur (annonce/profil/message), file de modération m3a.
"""
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, Integer, String, Text

from .db import Base

TARGET_TYPES = {"listing", "profile", "message"}
REPORT_REASONS = {"spam", "inappropriate", "fraud", "harassment", "other"}
REPORT_STATUSES = {"open", "resolved", "dismissed"}


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


class Report(Base):
    __tablename__ = "report"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant = Column(String(30), nullable=False, default="m3a-l3achrane",
                    server_default="m3a-l3achrane", index=True)
    reporter_id = Column(BigInteger, nullable=False)
    target_type = Column(String(20), nullable=False)  # listing | profile | message
    target_id = Column(String(64), nullable=False)
    reason = Column(String(20), nullable=False)  # spam | inappropriate | fraud | harassment | other
    description = Column(Text)
    status = Column(String(20), nullable=False, default="open", server_default="open", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime)
    resolver_id = Column(BigInteger)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "tenant": self.tenant,
            "reporter_id": self.reporter_id,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "reason": self.reason,
            "description": self.description,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolver_id": self.resolver_id,
        }
