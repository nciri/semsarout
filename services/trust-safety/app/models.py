"""Modèles du service trust-safety (schéma `trust_safety`).

- `ModerationStatus` : statut de modération par compte (user/agency) — **source du masquage**
  (§6). Amorcé depuis le monolithe, maintenu par les routes suspend/unsuspend.
- `AdminAction` : journal d'audit des actions super-admin (qui, quoi, quand, pourquoi).
- `Report` : signalements utilisateur (annonce/profil/message), file de modération m3a.
"""
from datetime import datetime

from sqlalchemy import (JSON, BigInteger, Boolean, Column, DateTime, Integer, String, Text,
                        UniqueConstraint)

from .db import Base

TARGET_TYPES = {"listing", "profile", "message", "agency"}
REPORT_REASONS = {"spam", "inappropriate", "fraud", "harassment", "other"}
REPORT_STATUSES = {"open", "resolved", "dismissed"}
LEVEL_ORDER = {"none": 0, "verified": 1, "verified_experience": 2}


class ModerationStatus(Base):
    __tablename__ = "moderation_status"

    entity_type = Column(String(10), primary_key=True)  # user | agency
    entity_id = Column(BigInteger, primary_key=True)
    is_suspended = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    reason = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TrustLevel(Base):
    """Score de confiance réel (remplace `is_verified` déclaratif) : `none` (pas de KYC),
    `verified` (KYC vérifié), `verified_experience` (KYC + ≥1 transaction conclue).
    Forcé à `none` immédiatement sur suspension ou signalement fraude confirmé — jamais lissé."""
    __tablename__ = "trust_level"

    entity_type = Column(String(10), primary_key=True)  # user | agency
    entity_id = Column(BigInteger, primary_key=True)
    level = Column(String(20), nullable=False, default="none", server_default="none")
    deal_count = Column(Integer, nullable=False, default=0, server_default="0")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {"level": self.level, "deal_count": self.deal_count}


class ProcessedMessage(Base):
    """Idempotence du worker événementiel (KYC/deals) — dédup par `message_id`."""
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)


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


class UserBlock(Base):
    """Un utilisateur qui en bloque un autre. Multi-tenant comme `Report` : le blocage vaut pour
    le tenant où il a été posé, jamais au-delà."""

    __tablename__ = "user_block"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant = Column(String(30), nullable=False, default="m3a-l3achrane",
                    server_default="m3a-l3achrane", index=True)
    blocker_id = Column(BigInteger, nullable=False, index=True)
    blocked_id = Column(BigInteger, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant", "blocker_id", "blocked_id",
                                       name="uq_user_block"),)

    def to_dict(self) -> dict:
        return {"id": self.id, "blocked_id": self.blocked_id,
                "created_at": self.created_at.isoformat() if self.created_at else None}


# Critères notés après un séjour. Figés côté code : ce sont des clés, les libellés vivent en i18n.
REVIEW_CRITERIA = ("respect", "proprete", "communication", "conformite")
# Publication en double aveugle : un avis n'est visible que lorsque l'autre partie a rendu le
# sien, ou passé ce délai — sinon le premier à écrire influencerait le second.
REVIEW_BLIND_DAYS = 14


class Review(Base):
    """Évaluation mutuelle après un séjour (une par auteur et par bail)."""

    __tablename__ = "review"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant = Column(String(30), nullable=False, default="m3a-l3achrane",
                    server_default="m3a-l3achrane", index=True)
    lease_id = Column(String(64), nullable=False, index=True)
    author_id = Column(BigInteger, nullable=False, index=True)
    subject_id = Column(BigInteger, nullable=False, index=True)
    criteria = Column(JSON, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant", "lease_id", "author_id", name="uq_review_author"),)

    @property
    def stars(self) -> int:
        values = [v for v in (self.criteria or {}).values() if isinstance(v, int)]
        # Arrondi au plus proche, 0,5 vers le haut : `round` de Python arrondit 4,5 à 4, ce qui
        # ferait perdre une étoile sur des notes pourtant bonnes.
        return int(sum(values) / len(values) + 0.5) if values else 0

    def to_dict(self, author_name: str | None = None) -> dict:
        return {
            "id": self.id, "lease_id": self.lease_id, "author_id": self.author_id,
            "author_name": author_name, "subject_id": self.subject_id,
            "criteria": self.criteria, "stars": self.stars, "comment": self.comment,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
