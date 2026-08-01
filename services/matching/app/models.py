"""Modèles matching (schéma `matching`) — portés SANS pgvector (hors périmètre).

Projections locales (compatibility_profiles, listing_criteria) alimentées par le
worker (C5) ; scores en cache (match_scores) calculés paresseusement, invalidés
par événements. seeker_id = id identity (BigInteger), listing_id = hex coloc-listing.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, DateTime, Integer, Numeric, String, UniqueConstraint,
)

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MatchingWeights(Base):
    """Pondérations versionnées (jamais en dur) — format weights = {"budget": x, "lifestyle": y}."""

    __tablename__ = "matching_weights"
    __table_args__ = (UniqueConstraint("version", name="uq_matching_weights_version"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    version = Column(String(40), nullable=False)
    weights = Column(JSON, nullable=False)
    active = Column(Boolean, default=False, nullable=False)


class CompatibilityProfile(Base):
    """Instantané des critères d'un chercheur (projection de coloc.profile_updated)."""

    __tablename__ = "compatibility_profiles"
    __table_args__ = (UniqueConstraint("seeker_id", name="uq_compatibility_profiles_seeker"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    seeker_id = Column(BigInteger, nullable=False, index=True)
    gender = Column(String(10), nullable=False)
    budget_min = Column(Numeric(12, 2))
    budget_max = Column(Numeric(12, 2), nullable=False)
    city = Column(String(80), nullable=False, index=True)
    lifestyle = Column(JSON, default=dict, nullable=False)
    importance = Column(JSON, default=dict, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class ListingCriteriaRow(Base):
    """Instantané des critères d'une annonce (projection de coloc.listing_published)."""

    __tablename__ = "listing_criteria"
    __table_args__ = (UniqueConstraint("listing_id", name="uq_listing_criteria_listing"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    listing_id = Column(String(32), nullable=False, index=True)
    housing_gender = Column(String(20), nullable=False)
    rent = Column(Numeric(12, 2), nullable=False)
    city = Column(String(80), nullable=False, index=True)
    capacity = Column(Integer, default=1, nullable=False)
    house_rules = Column(JSON, default=dict, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class MatchScore(Base):
    """Cache chercheur × annonce (generate-once / render-many)."""

    __tablename__ = "match_scores"
    __table_args__ = (UniqueConstraint("seeker_id", "listing_id", name="uq_match_scores_pair"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    seeker_id = Column(BigInteger, nullable=False, index=True)
    listing_id = Column(String(32), nullable=False, index=True)
    score = Column(Integer, nullable=False)
    hard_pass = Column(Boolean, nullable=False)
    explanations = Column(JSON, default=dict, nullable=False)
    weights_version = Column(String(40), nullable=False)
    computed_at = Column(DateTime(timezone=True), default=_now, nullable=False)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
