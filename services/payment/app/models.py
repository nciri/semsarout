"""Modèles du service payment (schéma `payment`) — parité `backend/app/api/v1/payments.py`.

`PlanRO` = projection des prix de plan (par slug) pour calculer le montant d'un paiement
d'abonnement. Amorcée à la migration (les plans changent rarement).
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, DateTime, Integer, Numeric, String,
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


class ServicePriceRO(Base):
    """Projection du catalogue tarifaire de billing — source du montant d'une prestation.

    Le prix vivait ici en dur (`SERVICE_PRICES`), et c'est lui qui faisait autorité sur ce qui
    était prélevé : le site pouvait afficher un montant et le client en payer un autre. La
    projection porte AUSSI l'inactif, pour qu'une prestation retirée de l'offre soit refusée en
    la connaissant plutôt que confondue avec un code inexistant.
    """

    __tablename__ = "service_price_ro"

    code = Column(String(40), primary_key=True)
    amount = Column(Numeric(10, 2), nullable=False)
    kind = Column(String(20))
    is_active = Column(Boolean, nullable=False, default=True)


class PlanRO(Base):
    """Projection des prix de plan (par slug) pour les paiements d'abonnement."""
    __tablename__ = "plan_ro"

    id = Column(Integer, primary_key=True)
    slug = Column(String(50), unique=True, index=True)
    price_monthly = Column(Numeric(10, 2))
    price_yearly = Column(Numeric(10, 2))

class ProcessedMessage(Base):
    """Déduplication des événements consommés (patron des autres workers du mesh)."""

    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
