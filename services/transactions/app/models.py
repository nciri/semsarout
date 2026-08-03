"""Modèles du service transactions — pipeline ventes/locations (schéma `transactions`).

Port fidèle de `backend/app/models/transaction.py` (Transaction, Offer, TransactionDocument).
`PropertyRO` (titre/ville) et `ClientRO` (nom) = projections locales pour les champs dénormalisés
(`property_title`, `client_name`, `seller_name`). PropertyRO est maintenue par `listing.*` ;
ClientRO amorcée à la migration (le domaine crm n'émet pas encore d'événements client).
Les noms d'agents (`agent_name`, …) viennent de l'endpoint interne du monolithe (users_client).
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, DateTime, Integer, Numeric, String, Text,
)

from .db import Base


class Transaction(Base):
    __tablename__ = "transaction"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, nullable=False, index=True)

    property_id = Column(Integer, index=True, nullable=False)
    client_id = Column(Integer, index=True, nullable=False)
    seller_id = Column(Integer)
    agent_id = Column(Integer, nullable=False)

    transaction_type = Column(String(20), nullable=False)
    stage = Column(String(30), default="contact")
    stage_order = Column(Integer, default=0)

    asking_price = Column(Numeric(12, 2))
    offer_price = Column(Numeric(12, 2))
    final_price = Column(Numeric(12, 2))

    commission_rate = Column(Numeric(5, 2))
    commission_amount = Column(Numeric(12, 2))
    commission_split = Column(JSON)

    status = Column(String(20), default="active")
    lost_reason = Column(String(255))

    contact_date = Column(DateTime, default=datetime.utcnow)
    visit_date = Column(DateTime)
    offer_date = Column(DateTime)
    acceptance_date = Column(DateTime)
    compromise_date = Column(DateTime)
    closing_date = Column(DateTime)
    expected_closing_date = Column(DateTime)

    notes = Column(Text)
    probability = Column(Integer, default=50)
    priority = Column(String(20), default="medium")

    agency_id = Column(Integer, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime)


class Offer(Base):
    __tablename__ = "offer"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    transaction_id = Column(BigInteger, index=True, nullable=False)

    amount = Column(Numeric(12, 2), nullable=False)
    conditions = Column(Text)
    offer_type = Column(String(20), default="initial")
    from_party = Column(String(20), nullable=False)
    status = Column(String(20), default="pending")
    expires_at = Column(DateTime)
    response_notes = Column(Text)
    responded_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer)


class TransactionDocument(Base):
    __tablename__ = "transaction_document"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    transaction_id = Column(BigInteger, index=True, nullable=False)

    document_type = Column(String(30), nullable=False)
    name = Column(String(255), nullable=False)
    file_url = Column(String(255), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(100))

    requires_signature = Column(Boolean, default=False)
    signature_status = Column(String(20))
    signed_at = Column(DateTime)
    signature_url = Column(String(255))

    uploaded_by_id = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


class PropertyRO(Base):
    """Projection locale du bien (via `listing.*`) : `property_title` / `property_city`."""
    __tablename__ = "property_ro"

    id = Column(BigInteger, primary_key=True)
    title = Column(String(200))
    city = Column(String(100))


class ClientRO(Base):
    """Projection locale du client (nom) : `client_name` / `seller_name`.
    Amorcée à la migration ; le domaine crm n'émet pas encore d'événements client."""
    __tablename__ = "client_ro"

    id = Column(BigInteger, primary_key=True)
    first_name = Column(String(50))
    last_name = Column(String(50))


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)


# Pipeline stages configuration — parité `backend/app/models/transaction.py`.
SALE_STAGES = [
    {"id": "contact", "name": "Contact initial", "order": 0, "color": "gray"},
    {"id": "visit", "name": "Visite", "order": 1, "color": "blue"},
    {"id": "offer", "name": "Offre", "order": 2, "color": "yellow"},
    {"id": "negotiation", "name": "Négociation", "order": 3, "color": "orange"},
    {"id": "compromise", "name": "Compromis", "order": 4, "color": "purple"},
    {"id": "final_act", "name": "Acte final", "order": 5, "color": "green"},
]

RENT_STAGES = [
    {"id": "contact", "name": "Contact initial", "order": 0, "color": "gray"},
    {"id": "visit", "name": "Visite", "order": 1, "color": "blue"},
    {"id": "application", "name": "Candidature", "order": 2, "color": "yellow"},
    {"id": "verification", "name": "Vérification", "order": 3, "color": "orange"},
    {"id": "lease", "name": "Bail", "order": 4, "color": "purple"},
    {"id": "move_in", "name": "Entrée", "order": 5, "color": "green"},
]
