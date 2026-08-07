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

LEASE_STATUSES = {"pending", "active", "ended", "cancelled"}
PAYMENT_TYPES = {"deposit", "rent"}
PAYMENT_STATUSES = {"pending", "escrowed", "released", "refunded"}
INTENT_STATUSES = {"processing", "succeeded", "failed"}
EDL_TYPES = {"entree", "sortie"}
EDL_STATUSES = {"draft", "signed"}
TENANT_M3A = "m3a-l3achrane"


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


class ColocLease(Base):
    """Bail de colocation (domaine m3a-l3achrane). PAS d'intégration PSP réelle : ce
    modèle et les statuts `ColocPayment` ci-dessous représentent les ÉTATS d'un séquestre
    (dépôt/loyer bloqué puis libéré/remboursé), sans aucun mouvement d'argent effectif —
    voir README du service pour le cadrage complet."""

    __tablename__ = "leases"

    id = Column(String(32), primary_key=True, default=_uuid)
    tenant = Column(String(40), default=TENANT_M3A, nullable=False, index=True)
    listing_id = Column(String(32), ForeignKey("listings.id"), nullable=False, index=True)
    tenant_user_id = Column(BigInteger, nullable=False, index=True)  # locataire
    owner_id = Column(BigInteger, nullable=False, index=True)  # bailleur (propriétaire de l'annonce)
    rent_amount = Column(Numeric(12, 2), nullable=False)
    deposit_amount = Column(Numeric(12, 2), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    status = Column(String(20), default="pending", nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    payments = relationship("ColocPayment", cascade="all, delete-orphan",
                            order_by="ColocPayment.created_at", lazy="selectin")
    etats_des_lieux = relationship("EtatDesLieux", cascade="all, delete-orphan",
                                   order_by="EtatDesLieux.created_at", lazy="selectin")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "tenant": self.tenant, "listing_id": self.listing_id,
            "tenant_user_id": self.tenant_user_id, "owner_id": self.owner_id,
            "rent_amount": float(self.rent_amount), "deposit_amount": float(self.deposit_amount),
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "status": self.status, "created_at": self.created_at.isoformat(),
            "payments": [p.to_dict() for p in self.payments],
            "etats_des_lieux": [e.to_dict() for e in self.etats_des_lieux],
        }


class ColocPayment(Base):
    """Paiement (caution ou loyer) rattaché à un bail. Machine à états séquestre :
    pending → escrowed → released|refunded. Modélise le CADRE, pas un traitement réel
    d'argent (pas de PSP intégré)."""

    __tablename__ = "lease_payments"

    id = Column(String(32), primary_key=True, default=_uuid)
    lease_id = Column(String(32), ForeignKey("leases.id"), nullable=False, index=True)
    type = Column(String(10), nullable=False)  # 'deposit' | 'rent'
    amount = Column(Numeric(12, 2), nullable=False)
    period = Column(String(7))  # 'YYYY-MM' pour un loyer ; null pour une caution
    status = Column(String(20), default="pending", nullable=False, index=True)
    # Couture PSP (simulé par défaut, voir app/payment_provider.py) : référence de
    # l'intent créé côté "provider" et son propre statut (processing/succeeded/failed),
    # distinct du statut séquestre ci-dessus qui reste la source de vérité métier.
    provider = Column(String(20))
    intent_id = Column(String(64), index=True)
    intent_status = Column(String(20))
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "lease_id": self.lease_id, "type": self.type,
            "amount": float(self.amount), "period": self.period, "status": self.status,
            "provider": self.provider, "intent_id": self.intent_id,
            "intent_status": self.intent_status,
            "created_at": self.created_at.isoformat(), "updated_at": self.updated_at.isoformat(),
        }


class EtatDesLieux(Base):
    """État des lieux (entrée/sortie) rattaché à un bail. Sous-domaine autonome —
    remplace la déduction par position (front) d'une étape « état des lieux » par une
    vraie donnée : pièces/items, statut brouillon/signé, signatures des deux parties."""

    __tablename__ = "etats_des_lieux"
    __table_args__ = (UniqueConstraint("lease_id", "type", name="uq_edl_lease_type"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    lease_id = Column(String(32), ForeignKey("leases.id"), nullable=False, index=True)
    type = Column(String(10), nullable=False)  # 'entree' | 'sortie'
    status = Column(String(10), default="draft", nullable=False, index=True)
    items = Column(JSON, default=list, nullable=False)  # [{piece, etat, commentaire}, ...]
    owner_signed_at = Column(DateTime(timezone=True))
    tenant_signed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "lease_id": self.lease_id, "type": self.type,
            "status": self.status, "items": self.items or [],
            "owner_signed_at": self.owner_signed_at.isoformat() if self.owner_signed_at else None,
            "tenant_signed_at": self.tenant_signed_at.isoformat() if self.tenant_signed_at else None,
            "created_at": self.created_at.isoformat(), "updated_at": self.updated_at.isoformat(),
        }
