"""Modèles du service legal (schéma `legal`) — parité `backend/app/models/legal.py`.

`TransactionRO`/`PropertyRO` = projections locales (id, agence, type, référence) pour la
validation d'appartenance + la dérivation type/titre à la création d'un dossier. Amorcées à la
migration, maintenues par `transaction.*` / `listing.*` (voir `app/worker.py`).
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, Column, DateTime, ForeignKey, Integer, String, Text,
)

from .db import Base


class Notary(Base):
    __tablename__ = "notary"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    office = Column(String(200))
    city = Column(String(100))
    phone = Column(String(30))
    email = Column(String(120))
    license_number = Column(String(50))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LegalCase(Base):
    __tablename__ = "legal_case"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    transaction_id = Column(Integer)
    property_id = Column(Integer)
    notary_id = Column(BigInteger, ForeignKey("notary.id"))
    title = Column(String(200), nullable=False)
    case_type = Column(String(20), default="sale")
    status = Column(String(20), default="open")
    notes = Column(Text)
    created_by = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LegalTask(Base):
    __tablename__ = "legal_task"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    legal_case_id = Column(BigInteger, ForeignKey("legal_case.id"), nullable=False, index=True)
    label = Column(String(255), nullable=False)
    status = Column(String(20), default="todo")
    due_date = Column(DateTime)
    assignee_id = Column(Integer)
    position = Column(Integer, default=0)
    notes = Column(Text)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class TransactionRO(Base):
    """Projection : appartenance agence + type/référence d'une transaction (create dossier)."""
    __tablename__ = "transaction_ro"

    id = Column(BigInteger, primary_key=True)
    agency_id = Column(Integer, index=True)
    transaction_type = Column(String(20))
    reference = Column(String(30))


class PropertyRO(Base):
    """Projection : appartenance agence d'un bien (validation du lien à la création)."""
    __tablename__ = "property_ro"

    id = Column(BigInteger, primary_key=True)
    agency_id = Column(Integer, index=True)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
