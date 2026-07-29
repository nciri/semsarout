"""Modèles du service rental (schéma `rental`) — gestion locative.

Personnes (locataire/propriétaire) = crm.Client, référencés par client_id ; l'email est résolu
par le service notification via crm /internal/client/{id}. PropertyRO (titre/ville) est une
projection locale maintenue par listing.* ; ClientRO (nom) sert l'affichage back-office.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text

from .db import Base


class Mandate(Base):
    __tablename__ = "mandate"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, nullable=False, index=True)
    agency_id = Column(Integer, index=True, nullable=False)
    property_id = Column(Integer, index=True, nullable=False)
    landlord_client_id = Column(Integer, index=True, nullable=False)
    mandate_type = Column(String(20), default="gestion")     # gestion | location
    fee_percent = Column(Numeric(5, 2))
    landlord_iban = Column(String(34))                        # chiffré au repos en cible (pgcrypto)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    status = Column(String(20), default="draft")             # draft|active|expired|terminated
    signed_at = Column(DateTime)
    expiry_notice_sent_at = Column(DateTime)                 # avis d'échéance (anti-doublon)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Lease(Base):
    __tablename__ = "lease"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, nullable=False, index=True)
    mandate_id = Column(Integer, index=True, nullable=False)
    property_id = Column(Integer, index=True, nullable=False)
    tenant_client_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    rent_amount = Column(Numeric(12, 2), nullable=False)
    charges_amount = Column(Numeric(12, 2), default=0)
    deposit_amount = Column(Numeric(12, 2), default=0)
    deposit_returned_at = Column(DateTime)
    deposit_return_amount = Column(Numeric(12, 2))
    payment_day = Column(Integer, default=1)                 # jour d'échéance (1-28)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    irl_index_ref = Column(String(40))                       # indice de référence (révision)
    last_revision_at = Column(DateTime)
    revision_notice_sent_at = Column(DateTime)               # avis de révision (anti-doublon)
    status = Column(String(20), default="draft")             # draft|active|ended|terminated
    signed_at = Column(DateTime)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PropertyRO(Base):
    """Projection locale du bien (via listing.*) : property_title / property_city."""
    __tablename__ = "property_ro"

    id = Column(Integer, primary_key=True)
    title = Column(String(200))
    city = Column(String(100))


class ClientRO(Base):
    """Projection locale du client (nom) pour l'affichage back-office."""
    __tablename__ = "client_ro"

    id = Column(Integer, primary_key=True)
    first_name = Column(String(50))
    last_name = Column(String(50))
    email = Column(String(120))
    client_type = Column(String(20))


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
