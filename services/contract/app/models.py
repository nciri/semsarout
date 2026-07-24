"""Modèles du service contract (schéma `contract`)."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, Integer, String, Text

from .db import Base


class Contract(Base):
    __tablename__ = "contract"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    document_type = Column(String(40), nullable=False, default="other")
    status = Column(String(20), nullable=False, default="draft")  # draft|finalized|signed
    body_html = Column(Text, nullable=True)
    worm_key = Column(String(255), nullable=True)  # clé de l'objet archivé (immuable)
    created_by = Column(Integer, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
