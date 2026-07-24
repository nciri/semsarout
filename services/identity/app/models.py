"""Modèles du domaine identity (schéma `identity`)."""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, DateTime, Integer, String

from .db import Base


class KycVerification(Base):
    __tablename__ = "kyc_verification"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    cin = Column(String(32), nullable=False)  # chiffré au repos en cible (pgcrypto)
    status = Column(String(20), nullable=False, default="pending")  # pending|verified|rejected
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
