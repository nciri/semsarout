"""Modèles du service payment (schéma `payment`) — parité `backend/app/api/v1/payments.py`.

`PlanRO` = projection des prix de plan (par slug) pour calculer le montant d'un paiement
d'abonnement. Amorcée à la migration (les plans changent rarement).
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Column, DateTime, Integer, Numeric, String,
)

from .db import Base


class Payment(Base):
    __tablename__ = "payment"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    reference = Column(String(50), unique=True, nullable=False, index=True)
    payment_type = Column(String(20), nullable=False)  # service | subscription
    service_id = Column(String(50))
    plan_id = Column(Integer)
    billing_cycle = Column(String(20))
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="MAD")
    status = Column(String(20), default="pending")  # pending|processing|completed|failed|refunded
    payment_method = Column(String(20))
    gateway_reference = Column(String(100))
    user_id = Column(Integer, index=True)
    agency_id = Column(Integer, index=True)  # v2 : pour l'événement d'activation d'abonnement
    customer_name = Column(String(100))
    customer_email = Column(String(120))
    customer_phone = Column(String(20))
    customer_address = Column(String(255))
    customer_city = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    extra_data = Column(JSON, default=dict)


class PlanRO(Base):
    """Projection des prix de plan (par slug) pour les paiements d'abonnement."""
    __tablename__ = "plan_ro"

    id = Column(Integer, primary_key=True)
    slug = Column(String(50), unique=True, index=True)
    price_monthly = Column(Numeric(10, 2))
    price_yearly = Column(Numeric(10, 2))
