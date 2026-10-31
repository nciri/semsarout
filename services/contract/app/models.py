"""Modèles du service contract (schéma `contract`) — parité `backend/app/models/contract.py`.

Projections locales pour la fusion (`build_context`) : AgencyRO (nom/adresse/licence),
PropertyRO (bien), ClientRO (client), TransactionRO (référence/prix/commission). Amorcées à la
migration, maintenues par `listing.*` / `transaction.*` (voir `app/worker.py`). agency_ro/client_ro
non maintenues par événements (agences/clients n'en émettent pas encore) — amorçage suffisant.
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, DateTime, Integer, Numeric, String, Text,
)

from .db import Base


class ContractTemplate(Base):
    __tablename__ = "contract_template"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, index=True)  # NULL = modèle global
    document_type = Column(String(30), nullable=False)
    name = Column(String(150), nullable=False)
    body_html = Column(Text, nullable=False)
    is_builtin = Column(Boolean, default=False)
    created_by = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Contract(Base):
    __tablename__ = "contract"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    document_type = Column(String(30), nullable=False)
    template_id = Column(Integer)
    transaction_id = Column(Integer)
    property_id = Column(Integer)
    client_id = Column(Integer)
    body_html = Column(Text, nullable=False)
    merge_context = Column(JSON)
    status = Column(String(20), default="draft")  # draft|finalized|signed
    pdf_url = Column(String(255))
    created_by = Column(Integer)
    finalized_at = Column(DateTime)
    signed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContractParty(Base):
    """Parties d'un contrat : plusieurs vendeurs, plusieurs locataires, des héritiers d'une
    indivision. `client_id` est un entier nu — pas de clé étrangère entre services. Pas de
    colonne `agency_id` : l'isolation passe par le contrat parent, déjà filtré sur l'agence du
    `Principal` avant toute lecture ou écriture de ses parties, et une colonne dupliquée ne
    ferait qu'ouvrir la possibilité qu'elle contredise celle du contrat.
    """

    __tablename__ = "contract_party"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    contract_id = Column(BigInteger, nullable=False, index=True)
    client_id = Column(Integer, nullable=False)
    role = Column(String(20), nullable=False)  # cf. merge.ROLE_PLACEHOLDERS
    position = Column(Integer, nullable=False, default=0)  # ordre d'apparition au contrat


class AgencyRO(Base):
    __tablename__ = "agency_ro"

    id = Column(Integer, primary_key=True)
    name = Column(String(150))
    address = Column(String(255))
    license_number = Column(String(50))


class PropertyRO(Base):
    __tablename__ = "property_ro"

    id = Column(BigInteger, primary_key=True)
    agency_id = Column(Integer, index=True)
    address = Column(String(255))
    city = Column(String(100))
    property_type = Column(String(50))
    price = Column(Numeric(12, 2))
    surface = Column(Numeric(10, 2))
    rooms = Column(Integer)
    reference = Column(String(50))


class ClientRO(Base):
    __tablename__ = "client_ro"

    id = Column(BigInteger, primary_key=True)
    agency_id = Column(Integer, index=True)
    first_name = Column(String(50))
    last_name = Column(String(50))
    email = Column(String(120))
    phone = Column(String(20))


class TransactionRO(Base):
    __tablename__ = "transaction_ro"

    id = Column(BigInteger, primary_key=True)
    agency_id = Column(Integer, index=True)
    property_id = Column(Integer)
    client_id = Column(Integer)
    agent_id = Column(Integer)
    transaction_type = Column(String(20))
    reference = Column(String(30))
    asking_price = Column(Numeric(12, 2))
    commission_rate = Column(Numeric(5, 2))
    commission_amount = Column(Numeric(12, 2))


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
