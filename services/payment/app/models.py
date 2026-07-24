"""Modèles du service payment (schéma `payment`)."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, Integer, Numeric, String

from .db import Base


class Payment(Base):
    __tablename__ = "payment"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, nullable=False, index=True)
    reference = Column(String(40), unique=True, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="MAD")  # code ISO
    purpose = Column(String(30), nullable=False)  # subscription | order | transaction
    # Cycle séquestre : pending -> held (sous séquestre) -> released | refunded ; ou failed
    status = Column(String(20), nullable=False, default="pending")
    external_ref = Column(String(60), nullable=True)  # réf. passerelle CMI (simulée)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
