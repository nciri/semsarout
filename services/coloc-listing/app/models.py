"""Modèles du domaine coloc-listing (schéma `coloc_listing`) — portés de m3a-l3achrane.

Adaptations actées : géo en chaînes city/neighborhood (pas d'UUID geo ni PostGIS),
title/description ajoutés (le front en a besoin), owner_id = id identity (BigInteger),
PK UUID hex applicatives, enums en String validés au niveau API.
L'adresse exacte et les coordonnées ne sont JAMAIS exposées (révélées après
acceptation d'une mise en relation — plan E).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .db import Base

PROPERTY_TYPES = {"APPARTEMENT", "MAISON", "VILLA", "STUDIO", "RESIDENCE_ETUDIANTE", "CHEZ_HABITANT"}
BED_TYPES = {"CHAMBRE_INDIVIDUELLE", "CHAMBRE_PARTAGEE", "LIT_DORTOIR", "STUDIO_ENTIER", "APPARTEMENT_ENTIER"}
HOUSING_GENDERS = {"FEMININ", "MASCULIN", "MIXTE_FAMILIAL"}
MEDIA_TYPES = {"CHAMBRE", "PARTIES_COMMUNES", "AUTRE"}


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ColocProperty(Base):
    __tablename__ = "properties"

    id = Column(String(32), primary_key=True, default=_uuid)
    owner_id = Column(BigInteger, nullable=False, index=True)
    city = Column(String(80), nullable=False, index=True)
    neighborhood = Column(String(120))
    address = Column(String(300))   # jamais exposée publiquement
    latitude = Column(Numeric(9, 6))    # jamais exposées
    longitude = Column(Numeric(9, 6))
    property_type = Column(String(30), nullable=False)
    floor = Column(Integer)
    area_m2 = Column(Integer)
    amenities = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    listings = relationship("Listing", back_populates="property")


class Listing(Base):
    __tablename__ = "listings"

    id = Column(String(32), primary_key=True, default=_uuid)
    property_id = Column(String(32), ForeignKey("properties.id"), nullable=False, index=True)
    owner_id = Column(BigInteger, nullable=False, index=True)
    title = Column(String(160), nullable=False)
    description = Column(Text, default="", nullable=False)
    bed_type = Column(String(30), nullable=False)
    rent = Column(Numeric(12, 2), nullable=False)
    charges_included = Column(Boolean, default=False, nullable=False)
    charges_amount = Column(Numeric(12, 2))
    deposit = Column(Numeric(12, 2))
    currency = Column(String(3), default="MAD", nullable=False)
    furnished = Column(Boolean, default=False, nullable=False)
    housing_gender = Column(String(20), nullable=False)
    capacity = Column(Integer, default=1, nullable=False)
    available_from = Column(Date)
    duration_min_months = Column(Integer)
    duration_max_months = Column(Integer)
    status = Column(String(20), default="BROUILLON", nullable=False, index=True)
    published_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    property = relationship("ColocProperty", back_populates="listings", lazy="joined")
    media = relationship("ListingMedia", cascade="all, delete-orphan",
                         order_by="ListingMedia.position", lazy="selectin")
    house_rules = relationship("HouseRule", cascade="all, delete-orphan", lazy="selectin")
    roommates = relationship("CurrentRoommates", uselist=False,
                             cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self) -> dict:
        p = self.property
        return {
            "id": self.id, "title": self.title, "description": self.description,
            "status": self.status, "city": p.city, "neighborhood": p.neighborhood,
            "property_type": p.property_type, "floor": p.floor, "area_m2": p.area_m2,
            "amenities": [k for k, v in (p.amenities or {}).items() if v],
            "bed_type": self.bed_type, "rent": float(self.rent),
            "charges_included": self.charges_included,
            "charges_amount": float(self.charges_amount) if self.charges_amount is not None else None,
            "deposit": float(self.deposit) if self.deposit is not None else None,
            "currency": self.currency, "furnished": self.furnished,
            "housing_gender": self.housing_gender, "capacity": self.capacity,
            "available_from": self.available_from.isoformat() if self.available_from else None,
            "duration_min_months": self.duration_min_months,
            "duration_max_months": self.duration_max_months,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "media": [{"url": m.url, "position": m.position, "media_type": m.media_type}
                      for m in self.media],
            "house_rules": [{"code": r.code, "value": r.value} for r in self.house_rules],
            "roommates": ({"total": self.roommates.total, "women": self.roommates.women,
                           "men": self.roommates.men} if self.roommates else None),
        }


class ListingMedia(Base):
    __tablename__ = "listing_media"

    id = Column(String(32), primary_key=True, default=_uuid)
    listing_id = Column(String(32), ForeignKey("listings.id"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    position = Column(Integer, default=0, nullable=False)
    media_type = Column(String(20), nullable=False)


class HouseRule(Base):
    __tablename__ = "house_rules"
    __table_args__ = (UniqueConstraint("listing_id", "code", name="uq_house_rules_listing_code"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    listing_id = Column(String(32), ForeignKey("listings.id"), nullable=False, index=True)
    code = Column(String(40), nullable=False)
    value = Column(String(120), nullable=False)


class CurrentRoommates(Base):
    """Agrégat NON NOMINATIF des colocataires en place (aucune identité)."""

    __tablename__ = "current_roommates"
    __table_args__ = (UniqueConstraint("listing_id", name="uq_current_roommates_listing"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    listing_id = Column(String(32), ForeignKey("listings.id"), nullable=False, index=True)
    total = Column(Integer, default=0, nullable=False)
    women = Column(Integer, default=0, nullable=False)
    men = Column(Integer, default=0, nullable=False)
    statuses = Column(JSON, default=dict, nullable=False)
