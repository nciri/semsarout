"""Modèle Product (schéma `catalog`) — mêmes champs/forme que le monolithe."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, Numeric, String, Text

from .db import Base


class Product(Base):
    __tablename__ = "product"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    category = Column(String(40), nullable=False, index=True)
    group = Column(String(20), nullable=False)  # furniture | appliance (dérivé)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    price = Column(Numeric(12, 2), nullable=False, default=0)
    stock = Column(Integer, default=0)
    image_url = Column(String(500))
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "category": self.category, "group": self.group, "name": self.name,
            "description": self.description, "price": float(self.price or 0), "stock": self.stock,
            "image_url": self.image_url, "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
