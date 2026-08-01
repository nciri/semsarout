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
    features: list[str] = field(default_factory=list)  # entitlements du plan (artisans, contracts…)
    claims: dict[str, Any] = field(default_factory=dict)


def principal_from_claims(claims: dict[str, Any]) -> Principal:
    return Principal(
        sub=str(claims.get("sub", "")),
        roles=list(claims.get("roles", []) or []),
        agency_id=claims.get("agency_id"),
        is_superadmin=bool(claims.get("is_superadmin", False)),
        features=list(claims.get("features", []) or []),
        claims=claims,
    )


def _principal_from_headers(request: Request) -> Principal | None:
    """Identité injectée par le BFF (frontière d'auth transitoire)."""
    uid = request.headers.get("x-semsar-user-id")
    if not uid:
        return None
    agency = request.headers.get("x-semsar-agency-id")
    return Principal(
        sub=uid,
        roles=[r for r in request.headers.get("x-semsar-roles", "").split(",") if r],
        agency_id=int(agency) if agency and agency.isdigit() else None,
        is_superadmin=request.headers.get("x-semsar-superadmin", "").lower() in ("1", "true"),
        features=[f for f in request.headers.get("x-semsar-features", "").split(",") if f],
        claims={},
    )


def get_principal(request: Request) -> Principal:
    settings = get_settings()

    # Transition : faire confiance aux en-têtes d'identité injectés par le BFF.
    if settings.trust_gateway_headers:
        principal = _principal_from_headers(request)
        if principal is None:
            raise unauthorized("Identité de passerelle absente.")
        return principal

    # Cible : vérification directe du JWT RS256 (émis par identity).
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise unauthorized("Jeton Bearer requis.")
    if not settings.jwt_public_key:
        raise unauthorized("Clé de vérification JWT non configurée.")
    claims = decode_token(
        auth[7:],
        public_key=settings.jwt_public_key,
        algorithm=settings.jwt_algorithm,
        issuer=settings.jwt_issuer,
    )
    return principal_from_claims(claims)


def require_superadmin(principal: Principal = Depends(get_principal)) -> Principal:
    """Dépendance FastAPI : réservé au super-admin plateforme."""
    if not principal.is_superadmin:
        raise forbidden("Super-admin access required")  # parité contrat monolithe
    return principal


def require_feature(feature: str):
    """Dépendance FastAPI : exige un entitlement de plan (ex. « artisans »). 403 sinon.
    Le super-admin passe toujours."""

    def _dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.is_superadmin or feature in principal.features:
            return principal
        raise forbidden("Fonction réservée aux plans Pro et Entreprise.")

    return _dependency


def require_roles(*roles: str):
    """Dépendance FastAPI : exige au moins un des rôles (le super-admin passe toujours)."""

    def _dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.is_superadmin:
            return principal
        if roles and not (set(roles) & set(principal.roles)):
            raise forbidden("Rôle insuffisant.")
        return principal

    return _dependency
