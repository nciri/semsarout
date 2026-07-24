"""Modèles du service legal (schéma `legal`)."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String

from .db import Base


class Notary(Base):
    __tablename__ = "notary"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    office = Column(String(150))
    city = Column(String(100))
    phone = Column(String(30))
    email = Column(String(120))
    license_number = Column(String(60))
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class LegalCase(Base):
    __tablename__ = "legal_case"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    case_type = Column(String(20), nullable=False, default="sale")  # sale | rental
    status = Column(String(20), nullable=False, default="open")  # open|in_progress|closed
    notary_id = Column(BigInteger, ForeignKey("notary.id"), nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class LegalTask(Base):
    __tablename__ = "legal_task"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    legal_case_id = Column(BigInteger, ForeignKey("legal_case.id"), nullable=False, index=True)
    label = Column(String(200), nullable=False)
    status = Column(String(20), nullable=False, default="todo")  # todo|in_progress|done
    position = Column(Integer, nullable=False, default=0)
