"""Décodage / vérification des jetons JWT RS256."""
from typing import Any

import jwt as pyjwt

from semsar_common.errors import unauthorized


def decode_token(
    token: str,
    public_key: str,
    algorithm: str = "RS256",
    issuer: str | None = None,
    audience: str | None = None,
) -> dict[str, Any]:
    """Vérifie la signature RS256 et retourne les claims, ou lève un Problem 401."""
    try:
        return pyjwt.decode(
            token,
            public_key,
            algorithms=[algorithm],
            issuer=issuer,
            audience=audience,
            options={"verify_aud": audience is not None},
        )
    except pyjwt.PyJWTError as exc:
        raise unauthorized("Jeton invalide ou expiré.") from exc
