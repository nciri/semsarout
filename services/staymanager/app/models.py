"""Modèles du service staymanager (schéma `staymanager`) — parité `backend/app/models/staymanager.py`.

`PropertyRO` (id/titre/référence) = projection pour le bien imbriqué d'un lien, amorcée à la migration.
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text,
)

from .db import Base


class StayManagerIntegration(Base):
    __tablename__ = "staymanager_integration"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, unique=True, index=True)
    staymanager_user_id = Column(String(100))
    staymanager_email = Column(String(255))
    api_key_encrypted = Column(Text)
    status = Column(String(20), default="pending")
    last_sync_at = Column(DateTime)
    sync_error = Column(Text)
    auto_sync_enabled = Column(Boolean, default=True)
    sync_frequency_hours = Column(Integer, default=6)
    webhook_secret = Column(String(100))
    webhook_url = Column(String(500))
    staymanager_webhook_id = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StayManagerPropertyLink(Base):
    __tablename__ = "staymanager_property_link"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    integration_id = Column(BigInteger, ForeignKey("staymanager_integration.id"), nullable=False, index=True)
    property_id = Column(Integer, nullable=False)
    staymanager_property_id = Column(String(100), nullable=False)
    staymanager_property_name = Column(String(255))
    sync_reservations = Column(Boolean, default=True)
    sync_availability = Column(Boolean, default=True)
    sync_guests = Column(Boolean, default=True)
    last_reservation_sync = Column(DateTime)
    last_availability_sync = Column(DateTime)
    sync_status = Column(String(20), default="pending")
    sync_error = Column(Text)
    ical_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StayManagerReservation(Base):
    __tablename__ = "staymanager_reservation"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    property_link_id = Column(BigInteger, ForeignKey("staymanager_property_link.id"), nullable=False, index=True)
    staymanager_reservation_id = Column(String(100), nullable=False, unique=True, index=True)
    external_id = Column(String(100))
    platform = Column(String(50))
    check_in = Column(DateTime, nullable=False, index=True)
    check_out = Column(DateTime, nullable=False, index=True)
    nights = Column(Integer)
    guest_name = Column(String(255))
    guest_phone = Column(String(50))
    guest_email = Column(String(255))
    guest_count = Column(Integer)
    staymanager_guest_id = Column(String(100))
    status = Column(String(20), default="confirmed", index=True)
    guest_verified = Column(Boolean, default=False)
    verification_status = Column(String(20))
    has_access_code = Column(Boolean, default=False)
    access_code_masked = Column(String(20))
    contract_status = Column(String(20))
    total_price = Column(Numeric(12, 2))
    currency = Column(String(10), default="Dh")
    guest_notes = Column(Text)
    special_requests = Column(Text)
    raw_data = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    synced_at = Column(DateTime)


class StayManagerSyncLog(Base):
    __tablename__ = "staymanager_sync_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    integration_id = Column(BigInteger, ForeignKey("staymanager_integration.id"), nullable=False, index=True)
    property_link_id = Column(BigInteger)
    sync_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False)
    items_synced = Column(Integer, default=0)
    items_created = Column(Integer, default=0)
    items_updated = Column(Integer, default=0)
    items_deleted = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    duration_seconds = Column(Integer)
    trigger = Column(String(20))


class PropertyRO(Base):
    __tablename__ = "property_ro"

    id = Column(BigInteger, primary_key=True)
    agency_id = Column(Integer, index=True)
    title = Column(String(200))
    reference = Column(String(50))
