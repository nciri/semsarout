"""Dépendance d'auth `partner_ctx` : résout le partenaire courant du contexte
soit par clé API (`X-Api-Key`), soit par membership (identité de session)."""
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from .db import get_db
from .models import ApiKey, PartnerMember


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


@dataclass
class PartnerCtx:
    partner_id: str
    mode: str  # "api_key" | "session"


class PartnerForbidden(Exception):
    pass


def partner_ctx(request: Request, db: Session = Depends(get_db)) -> PartnerCtx:
    raw = request.headers.get("x-api-key")
    if raw:
        key = db.query(ApiKey).filter(
            ApiKey.key_hash == hash_key(raw), ApiKey.revoked_at.is_(None)
        ).first()
        if key is None:
            raise PartnerForbidden()
        key.last_used_at = _now()
        db.commit()
        return PartnerCtx(partner_id=key.partner_id, mode="api_key")

    principal = get_principal(request)
    uid = _uid(principal)
    if uid is None:
        raise PartnerForbidden()
    member = db.query(PartnerMember).filter(PartnerMember.user_id == uid).first()
    if member is None:
        raise PartnerForbidden()
    return PartnerCtx(partner_id=member.partner_id, mode="session")
