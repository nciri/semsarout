"""Modèles du service directory (schéma `directory`) — mêmes formes que le monolithe."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, Integer, Numeric, String, Text

from .db import Base


class Artisan(Base):
    __tablename__ = "artisan"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=True, index=True)  # NULL = catalogue partagé plateforme
    trade = Column(String(40), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    company = Column(String(150))
    city = Column(String(100))
    phone = Column(String(30))
    email = Column(String(120))
    notes = Column(Text)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class WorkOrder(Base):
    __tablename__ = "work_order"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    artisan_id = Column(BigInteger, nullable=True)
    property_id = Column(Integer, nullable=True)
    title = Column(String(200), nullable=False)
    trade = Column(String(40), nullable=False)
    status = Column(String(20), default="requested")
    cost_estimate = Column(Numeric(12, 2), nullable=True)
    cost_final = Column(Numeric(12, 2), nullable=True)
    scheduled_date = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
