"""Modèles du domaine partner (schéma `partner`) — institution/membres/clés API.

Une institution partenaire (`Partner`, ex. université, agence) a des membres
(`PartnerMember`, mappés à un `user_id` identity) et peut s'authentifier soit
par session (membership) soit par clé API (`ApiKey`, hachée — jamais stockée
en clair, jamais sérialisée).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, String

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Partner(Base):
    __tablename__ = "partners"

    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    type = Column(String(40), nullable=False)
    tenant = Column(String(60), nullable=False, default="m3a-l3achrane")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "tenant": self.tenant,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PartnerMember(Base):
    __tablename__ = "partner_members"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    role = Column(String(30), nullable=False, default="MEMBER")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "user_id": self.user_id,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ApiKey(Base):
    __tablename__ = "partner_api_keys"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    label = Column(String(120), nullable=False)
    prefix = Column(String(16), nullable=False)
    key_hash = Column(String(64), nullable=False, unique=True, index=True)
    last_used_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    revoked_at = Column(DateTime(timezone=True))

    def to_dict(self) -> dict:
        # key_hash n'est JAMAIS exposé.
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "label": self.label,
            "prefix": self.prefix,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
        }
