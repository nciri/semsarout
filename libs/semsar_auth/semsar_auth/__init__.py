"""Auth partagée : JWT RS256 + RBAC."""
from .jwt import decode_token
from .rbac import Principal, get_principal, principal_from_claims, require_roles

__all__ = [
    "decode_token",
    "Principal",
    "get_principal",
    "principal_from_claims",
    "require_roles",
]
