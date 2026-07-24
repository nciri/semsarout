"""Modèles du service marketplace (schéma `marketplace`).

`ProductRO` est une **projection locale** du catalogue (alimentée par les événements
`product.*`) : elle permet d'afficher le panier et de figer les snapshots au checkout
sans appel synchrone à catalog. La **source de vérité** des produits reste `catalog`.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)

from .db import Base


class ProductRO(Base):
    __tablename__ = "product_ro"

    id = Column(BigInteger, primary_key=True)  # = id produit du catalogue
    name = Column(String(200))
    price = Column(Numeric(12, 2), default=0)
    stock = Column(Integer, default=0)
    image_url = Column(String(500))
    is_active = Column(Boolean, default=True)


class Cart(Base):
    __tablename__ = "cart"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CartItem(Base):
    __tablename__ = "cart_item"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    cart_id = Column(BigInteger, ForeignKey("cart.id"), nullable=False, index=True)
    product_id = Column(BigInteger, nullable=False)
    quantity = Column(Integer, default=1)


class Order(Base):
    __tablename__ = "order"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    reference = Column(String(20), unique=True, nullable=False, index=True)
    agency_id = Column(Integer, nullable=False, index=True)
    buyer_id = Column(Integer, nullable=True)
    property_id = Column(Integer, nullable=True)
    delivery_address = Column(Text)
    status = Column(String(20), default="pending")
    subtotal = Column(Numeric(12, 2), default=0)
    total = Column(Numeric(12, 2), default=0)
    payment_reference = Column(String(50), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self, items=None) -> dict:
        d = {
            "id": self.id, "reference": self.reference, "agency_id": self.agency_id,
            "buyer_id": self.buyer_id, "property_id": self.property_id,
            "delivery_address": self.delivery_address, "status": self.status,
            "subtotal": float(self.subtotal or 0), "total": float(self.total or 0),
            "payment_reference": self.payment_reference,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "items_count": len(items) if items is not None else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if items is not None:
            d["items"] = [i.to_dict() for i in items]
        return d


class OrderItem(Base):
    __tablename__ = "order_item"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    order_id = Column(BigInteger, ForeignKey("order.id"), nullable=False, index=True)
    product_id = Column(BigInteger, nullable=True)
    product_name = Column(String(200), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    quantity = Column(Integer, nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "product_id": self.product_id, "product_name": self.product_name,
            "unit_price": float(self.unit_price or 0), "quantity": self.quantity,
            "line_total": float(self.line_total or 0),
        }


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
