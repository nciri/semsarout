"""Modèles du service geo (schéma `geo`).

- `NeighborhoodPriceRef` : référence prix/m² manuelle par quartier (source de vérité geo,
  mêmes champs/forme que le monolithe).
- `ListingRO` : projection des biens (via `listing.*`) — juste ce qu'il faut pour le
  positionnement prix (prix, surface, localisation, type, statut). Reconstructible.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, Float, Integer, Numeric, String

from .db import Base


class NeighborhoodPriceRef(Base):
    __tablename__ = "neighborhood_price_ref"

    id = Column(Integer, primary_key=True, autoincrement=True)
    city = Column(String(100), nullable=False, index=True)
    neighborhood = Column(String(100), nullable=False, index=True)
    property_type = Column(String(20), nullable=True)  # None = tous types
    transaction_type = Column(String(20), nullable=False)  # sale | rent
    avg_price_sqm = Column(Numeric(12, 2), nullable=False)
    min_price_sqm = Column(Numeric(12, 2))
    max_price_sqm = Column(Numeric(12, 2))
    source = Column(String(150), default="manuel")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "city": self.city,
            "neighborhood": self.neighborhood,
            "property_type": self.property_type,
            "transaction_type": self.transaction_type,
            "avg_price_sqm": float(self.avg_price_sqm) if self.avg_price_sqm is not None else None,
            "min_price_sqm": float(self.min_price_sqm) if self.min_price_sqm is not None else None,
            "max_price_sqm": float(self.max_price_sqm) if self.max_price_sqm is not None else None,
            "source": self.source,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ListingRO(Base):
    """Projection lecture des biens — alimentée par `listing.*` (worker)."""
    __tablename__ = "listing_ro"

    id = Column(BigInteger, primary_key=True)
    price = Column(Numeric(12, 2))
    price_per_sqm = Column(Numeric(12, 2))
    surface = Column(Float)
    city = Column(String(100), index=True)
    neighborhood = Column(String(100), index=True)
    property_type = Column(String(20))
    transaction_type = Column(String(20), index=True)
    status = Column(String(20), index=True)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
