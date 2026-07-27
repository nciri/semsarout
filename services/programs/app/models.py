"""Modèles du service programs (schéma `programs`) — parité `backend/app/models/program.py`.

`AgencyRO` (nom/téléphone) = projection pour `agency_name`/`agency_phone` du dict programme,
amorcée à la migration (le domaine agence n'émet pas d'événements).
"""
from datetime import datetime

from sqlalchemy import (
    JSON, BigInteger, Column, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text,
)

from .db import Base

LOT_STATUSES = ("available", "reserved", "sold")


class Program(Base):
    __tablename__ = "program"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    reference = Column(String(50), unique=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, index=True)
    description = Column(Text)
    program_type = Column(String(50))
    address = Column(String(255))
    city = Column(String(100), index=True)
    neighborhood = Column(String(100))
    latitude = Column(Float)
    longitude = Column(Float)
    total_units = Column(Integer, default=0)
    available_units = Column(Integer, default=0)
    min_price = Column(Numeric(12, 2))
    max_price = Column(Numeric(12, 2))
    delivery_date = Column(Date)
    construction_status = Column(String(50), default="planning")
    amenities = Column(JSON)
    cover_image_url = Column(String(500))
    brochure_url = Column(String(500))
    video_url = Column(String(500))
    status = Column(String(20), default="draft")
    agency_id = Column(Integer, nullable=False, index=True)
    created_by_id = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime)
    views_count = Column(Integer, default=0)
    contacts_count = Column(Integer, default=0)


class ProgramUnit(Base):
    __tablename__ = "program_unit"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    program_id = Column(BigInteger, ForeignKey("program.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    unit_type = Column(String(50))
    surface_min = Column(Float)
    surface_max = Column(Float)
    rooms = Column(Integer)
    bedrooms = Column(Integer)
    bathrooms = Column(Integer)
    price_from = Column(Numeric(12, 2))
    price_to = Column(Numeric(12, 2))
    total_count = Column(Integer, default=0)
    available_count = Column(Integer, default=0)
    features = Column(JSON)
    floor_plan_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProgramImage(Base):
    __tablename__ = "program_image"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    program_id = Column(BigInteger, ForeignKey("program.id"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    caption = Column(String(255))
    image_type = Column(String(50))
    position = Column(Integer, default=0)


class ProgramUnitImage(Base):
    __tablename__ = "program_unit_image"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    unit_id = Column(BigInteger, ForeignKey("program_unit.id"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    caption = Column(String(255))
    image_type = Column(String(50))
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProgramPlan(Base):
    __tablename__ = "program_plan"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    program_id = Column(BigInteger, ForeignKey("program.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    image_url = Column(String(500))
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProgramLot(Base):
    __tablename__ = "program_lot"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    program_id = Column(BigInteger, ForeignKey("program.id"), nullable=False, index=True)
    plan_id = Column(BigInteger, ForeignKey("program_plan.id"), nullable=False, index=True)
    reference = Column(String(50))
    title = Column(String(150))
    lot_type = Column(String(30))
    surface = Column(Float)
    rooms = Column(Integer)
    bedrooms = Column(Integer)
    bathrooms = Column(Integer)
    floor = Column(Integer)
    price = Column(Numeric(12, 2))
    status = Column(String(20), default="available", index=True)
    zone = Column(JSON)
    description = Column(Text)
    image_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AgencyRO(Base):
    __tablename__ = "agency_ro"

    id = Column(Integer, primary_key=True)
    name = Column(String(150))
    phone = Column(String(30))


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
