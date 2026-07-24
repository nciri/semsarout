"""Modèles du service billing (schéma `billing`)."""
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
)

from .db import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plan"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    slug = Column(String(40), unique=True, nullable=False)
    name = Column(String(80), nullable=False)
    price = Column(Numeric(12, 2), nullable=False, default=0)
    max_seats = Column(Integer, nullable=False, default=1)  # -1 = illimité
    has_contracts = Column(Boolean, nullable=False, default=False)
    has_legal = Column(Boolean, nullable=False, default=False)
    has_artisans = Column(Boolean, nullable=False, default=False)


class Subscription(Base):
    __tablename__ = "subscription"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    plan_id = Column(BigInteger, ForeignKey("subscription_plan.id"), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending|active|cancelled
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class Invoice(Base):
    __tablename__ = "invoice"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    subscription_id = Column(BigInteger, ForeignKey("subscription.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(String(20), nullable=False, default="unpaid")  # unpaid|paid
    issued_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
