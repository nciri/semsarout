"""Modèles du service crm — sous-domaine leads (schéma `crm`).

`PropertyRO` = projection locale du titre des biens (via `listing.*`) pour
`property_title`. Les clients/visites/transactions viendront dans les stages suivants.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, Integer, Numeric, String, Text

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


class Client(Base):
    __tablename__ = "client"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    email = Column(String(120), index=True)
    phone = Column(String(20))
    phone_secondary = Column(String(20))
    whatsapp = Column(String(20))
    address = Column(String(255))
    city = Column(String(100))
    postal_code = Column(String(10))
    client_type = Column(String(20), nullable=False, default="buyer")
    status = Column(String(20), default="active")
    source = Column(String(30), default="website")
    source_detail = Column(String(255))
    search_criteria = Column(JSON, default=dict)
    budget_min = Column(Numeric(12, 2))
    budget_max = Column(Numeric(12, 2))
    notes = Column(Text)
    next_follow_up = Column(DateTime)
    rating = Column(Integer, default=3)
    tags = Column(JSON, default=list)
    assigned_to_id = Column(Integer)
    agency_id = Column(Integer, index=True)
    lead_id = Column(Integer)
    gdpr_consent = Column(Boolean, default=False)
    gdpr_consent_date = Column(DateTime)
    marketing_consent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_contact_at = Column(DateTime)


class ClientInteraction(Base):
    __tablename__ = "client_interaction"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    client_id = Column(BigInteger, index=True, nullable=False)
    interaction_type = Column(String(20), nullable=False)
    direction = Column(String(20))
    subject = Column(String(255))
    content = Column(Text)
    duration = Column(Integer)
    property_id = Column(Integer)
    created_by_id = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


class Visit(Base):
    __tablename__ = "visit"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    property_id = Column(Integer, index=True)
    client_id = Column(Integer, index=True)
    visitor_name = Column(String(100))
    visitor_email = Column(String(120))
    visitor_phone = Column(String(20))
    agent_id = Column(Integer)
    scheduled_at = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=30)
    status = Column(String(20), default="scheduled")
    visit_type = Column(String(20), default="in_person")
    notes = Column(Text)
    internal_notes = Column(Text)
    report = Column(Text)
    client_feedback = Column(String(20))
    client_comments = Column(Text)
    confirmed_at = Column(DateTime)
    confirmation_method = Column(String(20))
    agency_id = Column(Integer, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime)
    cancelled_at = Column(DateTime)
    cancellation_reason = Column(String(255))


class CalendarEvent(Base):
    __tablename__ = "calendar_event"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    event_type = Column(String(20), default="meeting")
    start_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime)
    all_day = Column(Boolean, default=False)
    recurrence = Column(JSON)
    location = Column(String(255))
    attendees = Column(JSON, default=list)
    client_id = Column(Integer)
    property_id = Column(Integer)
    user_id = Column(Integer)
    agency_id = Column(Integer, index=True)
    status = Column(String(20), default="pending")
    color = Column(String(20), default="blue")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PropertyRO(Base):
    __tablename__ = "property_ro"

    id = Column(BigInteger, primary_key=True)
    title = Column(String(200))
    address = Column(String(255))
    city = Column(String(100))


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
