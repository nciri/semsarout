"""Modèle TranslationCache (schéma `translation`) — cache Postgres des traductions Azure."""
import hashlib
from datetime import datetime

from sqlalchemy import Column, DateTime, Index, Integer, String, Text, UniqueConstraint

from .db import Base


class TranslationCache(Base):
    __tablename__ = "translation_cache"
    __table_args__ = (
        UniqueConstraint("source_hash", "source_lang", "target_lang", name="uq_translation_cache_key"),
        Index("ix_translation_cache_key", "source_hash", "source_lang", "target_lang"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_hash = Column(String(64), nullable=False)
    source_lang = Column(String(8), nullable=False)
    target_lang = Column(String(8), nullable=False)
    source_text = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


def hash_source(text: str) -> str:
    """Empreinte du texte source normalisé (clé de cache)."""
    return hashlib.sha256(_normalize(text).encode("utf-8")).hexdigest()


def _normalize(text: str) -> str:
    return text.strip()
