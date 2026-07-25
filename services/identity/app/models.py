"""Modèles du domaine identity (schéma `identity`).

- `KycVerification` : domaine KYC (existant).
- `UserRO`/`RoleRO`/`AgencyRO` : le domaine **compte** (users/roles/agences). En transition,
  ces tables sont alimentées par migration + événements `user.*` (le monolithe reste source de
  vérité pour les écritures tant qu'il sert ses autres routes). identity **émet les JWT** à
  partir de ces données (login/me/refresh).
"""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship

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


user_role_ro = Table(
    "user_role_ro", Base.metadata,
    Column("user_id", BigInteger, ForeignKey("user_ro.id"), primary_key=True),
    Column("role_id", Integer, ForeignKey("role_ro.id"), primary_key=True),
)


role_permission_ro = Table(
    "role_permission_ro", Base.metadata,
    Column("role_id", Integer, ForeignKey("role_ro.id"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permission_ro.id"), primary_key=True),
)


class PermissionRO(Base):
    __tablename__ = "permission_ro"

    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    slug = Column(String(100), unique=True, nullable=False)
    description = Column(String(255))
    module = Column(String(50))

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "slug": self.slug,
                "description": self.description, "module": self.module}


class RoleRO(Base):
    __tablename__ = "role_ro"

    id = Column(Integer, primary_key=True)
    slug = Column(String(50), unique=True, nullable=False)
    name = Column(String(100))
    description = Column(String(255))
    color = Column(String(20))
    level = Column(Integer, default=100)
    is_system = Column(Boolean, default=False)
    agency_id = Column(Integer, index=True)

    permissions = relationship("PermissionRO", secondary=role_permission_ro,
                               order_by="PermissionRO.id", lazy="selectin")

    def to_dict(self, include_permissions: bool = False, users_count: int = 0) -> dict:
        data = {
            "id": self.id, "name": self.name, "slug": self.slug,
            "description": self.description, "color": self.color, "level": self.level,
            "is_system": self.is_system, "users_count": users_count,
        }
        if include_permissions:
            data["permissions"] = [p.to_dict() for p in self.permissions]
        return data


class UserRO(Base):
    __tablename__ = "user_ro"

    id = Column(BigInteger, primary_key=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    first_name = Column(String(50))
    last_name = Column(String(50))
    phone = Column(String(20))
    avatar_url = Column(String(255))
    user_type = Column(String(20))
    account_role = Column(String(20))
    interest = Column(String(40))
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime)
    last_login = Column(DateTime)
    is_suspended = Column(Boolean, default=False)
    suspended_at = Column(DateTime)
    suspended_reason = Column(Text)
    deleted_at = Column(DateTime)
    anonymized_at = Column(DateTime)
    dashboard_config = Column(JSON)
    agency_id = Column(Integer, index=True)
    team_id = Column(Integer)

    roles = relationship("RoleRO", secondary=user_role_ro, lazy="selectin")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def to_dict(self) -> dict:
        primary = max(self.roles, key=lambda r: r.level) if self.roles else None
        is_superadmin = any(r.slug == "superadmin" for r in self.roles)
        return {
            "id": self.id, "email": self.email, "first_name": self.first_name,
            "last_name": self.last_name, "full_name": self.full_name, "phone": self.phone,
            "avatar_url": self.avatar_url, "user_type": self.user_type,
            "account_role": self.account_role, "interest": self.interest,
            "is_verified": self.is_verified, "agency_id": self.agency_id, "team_id": self.team_id,
            "role": primary.slug if primary else None,
            "role_name": primary.name if primary else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_superadmin": is_superadmin, "is_suspended": bool(self.is_suspended),
            "suspended_reason": self.suspended_reason,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "anonymized_at": self.anonymized_at.isoformat() if self.anonymized_at else None,
            "dashboard_config": self.dashboard_config,
        }


class AgencyRO(Base):
    """Projection minimale des agences — blocage login + features (claims JWT)."""
    __tablename__ = "agency_ro"

    id = Column(Integer, primary_key=True)
    is_suspended = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    suspended_reason = Column(Text)
    features = Column(JSON, default=list)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
