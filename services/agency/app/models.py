"""Modèles du service agency (schéma `agency`).

- `Agency` : source de vérité du domaine agence (mêmes champs/forme que le monolithe).
- `ListingRO` : projection (id, agency_id) via `listing.*` — pour `properties_count`. Reconstructible.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text

from .db import Base


class Agency(Base):
    __tablename__ = "agency"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text)
    email = Column(String(120), nullable=False)
    phone = Column(String(20))
    website = Column(String(255))
    address = Column(String(255))
    city = Column(String(100))
    postal_code = Column(String(10))
    logo_url = Column(String(255))
    cover_image_url = Column(String(255))
    license_number = Column(String(50))
    rc_number = Column(String(50))
    ice_number = Column(String(50))
    staymanager_id = Column(String(100))
    api_key = Column(String(100), unique=True)
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_suspended = Column(Boolean, default=False, nullable=False)
    suspended_at = Column(DateTime)
    suspended_reason = Column(String(255))
    deleted_at = Column(DateTime)
    anonymized_at = Column(DateTime)
    owner_id = Column(Integer)

    def to_dict(self, properties_count: int = 0) -> dict:
        return {
            "id": self.id, "name": self.name, "slug": self.slug,
            "description": self.description, "email": self.email, "phone": self.phone,
            "website": self.website, "address": self.address, "city": self.city,
            "postal_code": self.postal_code, "logo_url": self.logo_url,
            "cover_image_url": self.cover_image_url, "is_verified": self.is_verified,
            "properties_count": properties_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_suspended": bool(self.is_suspended), "suspended_reason": self.suspended_reason,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "anonymized_at": self.anonymized_at.isoformat() if self.anonymized_at else None,
        }


class ListingRO(Base):
    """Projection (id, agency_id) via `listing.*` — pour `properties_count`. Reconstructible.
    Le dict complet des biens vient du service listing (`app/listing_client.py`)."""
    __tablename__ = "listing_ro"

    id = Column(BigInteger, primary_key=True)
    agency_id = Column(Integer, index=True)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
