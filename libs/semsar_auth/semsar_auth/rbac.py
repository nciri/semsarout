"""RBAC : extraction du principal depuis le JWT + dépendances FastAPI."""
from dataclasses import dataclass, field
from typing import Any

from fastapi import Depends, Request

from semsar_common.config import get_settings
from semsar_common.errors import forbidden, unauthorized

from .jwt import decode_token


@dataclass
class Principal:
    sub: str
    roles: list[str] = field(default_factory=list)
    agency_id: int | None = None
    is_superadmin: bool = False
    claims: dict[str, Any] = field(default_factory=dict)


def principal_from_claims(claims: dict[str, Any]) -> Principal:
    return Principal(
        sub=str(claims.get("sub", "")),
        roles=list(claims.get("roles", []) or []),
        agency_id=claims.get("agency_id"),
        is_superadmin=bool(claims.get("is_superadmin", False)),
        claims=claims,
    )


def get_principal(request: Request) -> Principal:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise unauthorized("Jeton Bearer requis.")
    settings = get_settings()
    if not settings.jwt_public_key:
        raise unauthorized("Clé de vérification JWT non configurée.")
    claims = decode_token(
        auth[7:],
        public_key=settings.jwt_public_key,
        algorithm=settings.jwt_algorithm,
        issuer=settings.jwt_issuer,
    )
    return principal_from_claims(claims)


def require_roles(*roles: str):
    """Dépendance FastAPI : exige au moins un des rôles (le super-admin passe toujours)."""

    def _dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.is_superadmin:
            return principal
        if roles and not (set(roles) & set(principal.roles)):
            raise forbidden("Rôle insuffisant.")
        return principal

    return _dependency
