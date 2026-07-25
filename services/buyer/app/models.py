"""Modèles du service buyer (schéma `buyer`) — parité `backend/app/models/buyer.py`.

`/buyer/messages*` reste au service **messaging** (déjà extrait) — non modélisé ici.
Le bien imbriqué (favoris) vient du service **listing** (dict complet, `app/listing_client.py`) :
aucune projection de bien ici (listing en est propriétaire).
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, DateTime, Integer, Numeric, String, Text,
)

from .db import Base


class SavedSearch(Base):
    __tablename__ = "saved_search"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    criteria = Column(JSON)
    notify_new_matches = Column(Boolean, default=True)
    last_notified_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Favorite(Base):
    __tablename__ = "favorite"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    property_id = Column(Integer, nullable=False)
    notes = Column(Text)
    rating = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


class PropertyEstimate(Base):
    __tablename__ = "property_estimate"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    property_id = Column(Integer, nullable=False)
    estimated_price = Column(Numeric(12, 2), nullable=False)
    estimated_reason = Column(Text)
    market_analysis = Column(Text)
    comparison_properties = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


