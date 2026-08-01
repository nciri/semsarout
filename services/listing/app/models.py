"""Modèles du service listing (schéma `listing`) — mêmes champs que le monolithe."""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .db import Base


class Property(Base):
    __tablename__ = "property"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    reference = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    property_type = Column(String(20), nullable=False)
    transaction_type = Column(String(20), nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    price_per_sqm = Column(Numeric(10, 2))
    charges = Column(Numeric(10, 2))
    surface = Column(Float)
    land_surface = Column(Float)
    rooms = Column(Integer)
    bedrooms = Column(Integer)
    bathrooms = Column(Integer)
    floor = Column(Integer)
    total_floors = Column(Integer)
    construction_year = Column(Integer)
    features = Column(JSON, default=list)
    energy_class = Column(String(1))
    ges_class = Column(String(1))
    address = Column(String(255))
    city = Column(String(100), nullable=False, index=True)
    neighborhood = Column(String(100))
    postal_code = Column(String(10))
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(String(20), default="draft")
    is_premium = Column(Boolean, default=False)
    is_urgent = Column(Boolean, default=False)
    urgent_until = Column(DateTime)
    is_featured = Column(Boolean, default=False)
    boost_until = Column(DateTime)
    views_count = Column(Integer, default=0)
    contacts_count = Column(Integer, default=0)
    favorites_count = Column(Integer, default=0)
    owner_id = Column(Integer, index=True)
    agency_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime)

    images = relationship("PropertyImage", back_populates="property",
                          order_by="PropertyImage.position", cascade="all, delete-orphan")
    documents = relationship("PropertyDocument", back_populates="property",
                             cascade="all, delete-orphan")


class PropertyImage(Base):
    __tablename__ = "property_image"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    property_id = Column(BigInteger, ForeignKey("property.id"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    thumbnail_url = Column(String(500))
    caption = Column(String(255))
    position = Column(Integer, default=0)
    is_primary = Column(Boolean, default=False)

    property = relationship("Property", back_populates="images")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "url": self.url, "thumbnail_url": self.thumbnail_url,
            "caption": self.caption, "position": self.position, "is_primary": self.is_primary,
        }


class PropertyDocument(Base):
    __tablename__ = "property_document"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    property_id = Column(BigInteger, ForeignKey("property.id"), nullable=False, index=True)
    doc_type = Column(String(30), nullable=False, default="autre")
    file_url = Column(String(255), nullable=False)
    original_name = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    property = relationship("Property", back_populates="documents")
