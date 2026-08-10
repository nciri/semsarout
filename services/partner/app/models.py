"""Modèles du domaine partner (schéma `partner`) — institution/membres/clés API.

Une institution partenaire (`Partner`, ex. université, agence) a des membres
(`PartnerMember`, mappés à un `user_id` identity) et peut s'authentifier soit
par session (membership) soit par clé API (`ApiKey`, hachée — jamais stockée
en clair, jamais sérialisée).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, Date, DateTime, ForeignKey, Numeric, String

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Partner(Base):
    __tablename__ = "partners"

    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    type = Column(String(40), nullable=False)
    tenant = Column(String(60), nullable=False, default="m3a-l3achrane")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "tenant": self.tenant,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PartnerMember(Base):
    __tablename__ = "partner_members"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    role = Column(String(30), nullable=False, default="MEMBER")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "user_id": self.user_id,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Affilie(Base):
    __tablename__ = "affilies"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    full_name = Column(String(160), nullable=False)
    email = Column(String(255), nullable=False)
    external_ref = Column(String(80))
    status = Column(String(20), nullable=False, default="PENDING")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "full_name": self.full_name,
            "email": self.email,
            "external_ref": self.external_ref,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Verification(Base):
    __tablename__ = "verifications"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    affilie_id = Column(String(32), ForeignKey("affilies.id"), nullable=False, index=True)
    doc_type = Column(String(30), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")
    note = Column(String(500))
    submitted_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    decided_at = Column(DateTime(timezone=True))
    decided_by = Column(BigInteger)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "affilie_id": self.affilie_id,
            "doc_type": self.doc_type,
            "status": self.status,
            "note": self.note,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "decided_at": self.decided_at.isoformat() if self.decided_at else None,
            "decided_by": self.decided_by,
        }


class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    listing_id = Column(String(32), nullable=False, index=True)
    affilie_id = Column(String(32), ForeignKey("affilies.id"))
    label = Column(String(160), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="RESERVED")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "listing_id": self.listing_id,
            "affilie_id": self.affilie_id,
            "label": self.label,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "status": self.status,
        }


class Grant(Base):
    __tablename__ = "grants"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    program = Column(String(160), nullable=False)
    affilie_id = Column(String(32), ForeignKey("affilies.id"))
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="MAD")
    status = Column(String(20), nullable=False, default="PLANNED")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "program": self.program,
            "affilie_id": self.affilie_id,
            "amount": float(self.amount) if self.amount is not None else None,
            "currency": self.currency,
            "status": self.status,
        }


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    number = Column(String(60), nullable=False)
    period = Column(String(7), nullable=False)  # "AAAA-MM"
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="MAD")
    status = Column(String(20), nullable=False, default="DRAFT")
    issued_at = Column(DateTime(timezone=True))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "number": self.number,
            "period": self.period,
            "amount": float(self.amount) if self.amount is not None else None,
            "currency": self.currency,
            "status": self.status,
            "issued_at": self.issued_at.isoformat() if self.issued_at else None,
        }


class ApiKey(Base):
    __tablename__ = "partner_api_keys"

    id = Column(String(32), primary_key=True, default=_uuid)
    partner_id = Column(String(32), ForeignKey("partners.id"), nullable=False, index=True)
    label = Column(String(120), nullable=False)
    prefix = Column(String(16), nullable=False)
    key_hash = Column(String(64), nullable=False, unique=True, index=True)
    last_used_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    revoked_at = Column(DateTime(timezone=True))

    def to_dict(self) -> dict:
        # key_hash n'est JAMAIS exposé.
        return {
            "id": self.id,
            "partner_id": self.partner_id,
            "label": self.label,
            "prefix": self.prefix,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
        }
