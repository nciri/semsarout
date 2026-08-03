"""Modèles coloc-profile (schéma `coloc_profile`) — portés de m3a-l3achrane.

Adaptations actées : user_id BigInteger (identity semsarout), city en chaîne,
display_name/is_verified ajoutés (alimentés par les événements user.*),
tables interests/saved_searches/blocks et champs life_status/visibility non portés
(YAGNI — voir plan C). PII (display_name, bio) jamais dans les événements.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .db import Base

GENDERS = {"FEMME", "HOMME"}


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_profiles_user_id"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    user_id = Column(BigInteger, nullable=False, index=True)
    display_name = Column(String(80))
    is_verified = Column(Boolean, default=False, nullable=False)
    gender = Column(String(10))          # FEMME | HOMME
    birth_date = Column(Date)
    city = Column(String(80))
    bio = Column(String(2000))
    budget_min = Column(Numeric(12, 2))
    budget_max = Column(Numeric(12, 2))
    move_in_date = Column(Date)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    lifestyle_answers = relationship("LifestyleAnswer", cascade="all, delete-orphan",
                                     lazy="selectin")

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id, "display_name": self.display_name,
            "is_verified": self.is_verified, "gender": self.gender,
            "birth_date": self.birth_date.isoformat() if self.birth_date else None,
            "city": self.city, "bio": self.bio,
            "budget_min": float(self.budget_min) if self.budget_min is not None else None,
            "budget_max": float(self.budget_max) if self.budget_max is not None else None,
            "move_in_date": self.move_in_date.isoformat() if self.move_in_date else None,
            "lifestyle": [{"question_code": a.question_code, "value": a.value,
                           "importance": a.importance} for a in self.lifestyle_answers],
        }


class LifestyleAnswer(Base):
    __tablename__ = "lifestyle_answers"
    __table_args__ = (UniqueConstraint("profile_id", "question_code",
                                       name="uq_lifestyle_answers_profile_question"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    profile_id = Column(String(32), ForeignKey("profiles.id"), nullable=False, index=True)
    question_code = Column(String(40), nullable=False)
    value = Column(String(60), nullable=False)
    importance = Column(String(12), default="PREFERENCE", nullable=False)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "listing_id", name="uq_favorites_user_listing"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    user_id = Column(BigInteger, nullable=False, index=True)
    listing_id = Column(String(32), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
