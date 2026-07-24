"""Modèles du service crm — sous-domaine leads (schéma `crm`).

`PropertyRO` = projection locale du titre des biens (via `listing.*`) pour
`property_title`. Les clients/visites/transactions viendront dans les stages suivants.
"""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text

from .db import Base


class Lead(Base):
    __tablename__ = "lead"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(150))
    email = Column(String(120))
    phone = Column(String(30))
    message = Column(Text)
    notes = Column(Text)
    source = Column(String(30), default="manual")
    service = Column(String(40))
    status = Column(String(20), default="new")
    lost_reason = Column(String(255))
    lost_at = Column(DateTime)
    property_id = Column(Integer, index=True)
    agency_id = Column(Integer, index=True)
    assigned_to_id = Column(Integer)
    is_charged = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    contacted_at = Column(DateTime)
    qualified_at = Column(DateTime)
    converted_at = Column(DateTime)


class PropertyRO(Base):
    __tablename__ = "property_ro"

    id = Column(BigInteger, primary_key=True)
    title = Column(String(200))


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
