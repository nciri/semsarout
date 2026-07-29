"""Modèles du service billing (schéma `billing`) — parité `backend/app/models/subscription.py`.

SubscriptionPlan/Subscription reproduisent les `to_dict` du monolithe (routes legacy). Invoice est
créé par `change-plan` (chorégraphie paiement v2 : facture *unpaid* + `billing.invoice.created`).
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text,
)

from .db import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plan"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    slug = Column(String(50), unique=True, nullable=False)
    description = Column(Text)
    max_listings = Column(Integer, nullable=False)
    max_featured = Column(Integer, default=0)
    max_urgent = Column(Integer, default=0)
    has_api_access = Column(Boolean, default=False)
    has_csv_import = Column(Boolean, default=False)
    has_staymanager_sync = Column(Boolean, default=False)
    has_lead_contact = Column(Boolean, default=True)
    has_analytics = Column(Boolean, default=False)
    has_priority_support = Column(Boolean, default=False)
    has_dedicated_account_manager = Column(Boolean, default=False)
    has_programs = Column(Boolean, default=False)
    max_programs = Column(Integer, default=0)
    has_contracts = Column(Boolean, default=False)
    has_legal = Column(Boolean, default=False)
    has_artisans = Column(Boolean, default=False)
    has_rental = Column(Boolean, default=False)
    max_seats = Column(Integer, default=0)
    max_teams = Column(Integer, default=0)
    price_monthly = Column(Numeric(10, 2), nullable=False)
    price_yearly = Column(Numeric(10, 2))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Subscription(Base):
    __tablename__ = "subscription"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("subscription_plan.id"), nullable=False)
    billing_cycle = Column(String(10), default="monthly")
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), default="active")
    start_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_date = Column(DateTime)
    trial_end = Column(DateTime)
    cancelled_at = Column(DateTime)
    listings_used = Column(Integer, default=0)
    featured_used = Column(Integer, default=0)
    urgent_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Invoice(Base):
    __tablename__ = "invoice"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, index=True)
    subscription_id = Column(Integer, ForeignKey("subscription.id"), nullable=False)
    agency_id = Column(Integer, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), default="unpaid")  # unpaid|paid
    period_label = Column(String(40))
    issued_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime)
    reminder_count = Column(Integer, default=0)   # relances impayé envoyées (dunning) — anti-doublon
    last_reminder_at = Column(DateTime)           # date de la dernière relance (cadence)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
