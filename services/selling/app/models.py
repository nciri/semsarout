"""Modèles du service selling (schéma `selling`)."""
from datetime import datetime

from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint,
)

from .db import Base


class PurchaseInquiry(Base):
    __tablename__ = "purchase_inquiry"
    __table_args__ = (UniqueConstraint("property_id", "buyer_party", name="uq_inquiry_buyer"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, nullable=False, index=True)
    seller_party = Column(Integer, index=True)      # propriétaire (uid opaque)
    buyer_party = Column(Integer, index=True)       # acheteur (uid opaque)
    status = Column(String(20), default="open")     # open|offer_pending|accepted|compromis_pending|concluded|withdrawn|rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Offer(Base):
    __tablename__ = "offer"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inquiry_id = Column(Integer, ForeignKey("purchase_inquiry.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="MAD")
    status = Column(String(20), default="pending")  # pending|accepted|rejected|countered
    created_at = Column(DateTime, default=datetime.utcnow)
    decided_at = Column(DateTime)


class Compromis(Base):
    __tablename__ = "compromis"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inquiry_id = Column(Integer, ForeignKey("purchase_inquiry.id"), nullable=False, index=True)
    accepted_offer_id = Column(Integer, ForeignKey("offer.id"))
    status = Column(String(20), default="draft")    # draft|sent|signed|voided
    payload = Column(Text)                           # JSON des données du compromis (parties, bien, prix…)
    signed_at = Column(DateTime)
    signed_pdf_key = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)


class SignatureRequest(Base):
    __tablename__ = "signature_request"
    __table_args__ = (UniqueConstraint("doc_type", "doc_ref_id", name="uq_selling_signature"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    doc_type = Column(String(20), nullable=False)    # compromis
    doc_ref_id = Column(Integer, nullable=False)
    envelope_id = Column(String(64))
    document_id = Column(String(64))
    status = Column(String(20), default="pending")
    signed_pdf_key = Column(String(255))
    signers = Column(Text)
    error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"
    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
