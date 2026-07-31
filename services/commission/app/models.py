"""Modèles du service commission (schéma `commission`)."""
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Integer, Numeric, String, UniqueConstraint,
)

from .db import Base


class DealCounter(Base):
    """Un compteur d'affaires conclues par compte (particulier / promoteur en direct)."""
    __tablename__ = "deal_counter"

    account_id = Column(Integer, primary_key=True)
    concluded_count = Column(Integer, nullable=False, default=0)
    first_deal_free_used = Column(Boolean, nullable=False, default=False)
    free_conclusion_id = Column(Integer)  # conclusion ayant réservé la 1re affaire offerte
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Conclusion(Base):
    """Une affaire (bail / compromis) : décision de facturabilité + cycle de vie."""
    __tablename__ = "conclusion"
    __table_args__ = (UniqueConstraint("deal_type", "source_ref", name="uq_conclusion_deal"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, nullable=False, index=True)
    deal_type = Column(String(10), nullable=False)          # rental | sale
    source_ref = Column(Integer, nullable=False)            # lease_id / compromis_id
    source_event = Column(String(60))                       # rempli à la conclusion réelle
    billable = Column(Boolean, nullable=False, default=False)
    commission_amount = Column(Numeric(10, 2), default=0)
    invoice_ref = Column(String(60))
    pay_url = Column(String(255))
    paid = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default="pending")  # pending|concluded|voided|reused
    concluded_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommissionRule(Base):
    """Forfait configurable par type d'affaire (versionné dans le temps)."""
    __tablename__ = "commission_rule"

    id = Column(Integer, primary_key=True, autoincrement=True)
    deal_type = Column(String(10), nullable=False, index=True)  # rental | sale
    flat_amount = Column(Numeric(10, 2), nullable=False, default=4999)
    currency = Column(String(3), nullable=False, default="MAD")
    active_from = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
