"""Statut KYC d'un utilisateur (patron commission_client.py) — fail-closed :
toute erreur réseau est traitée comme 'none' (non vérifié) par l'appelant."""
import os

import httpx

from semsar_common import get_settings

_IDENTITY_URL = os.environ.get("IDENTITY_URL", "http://localhost:8501")


def status(user_id: int) -> str:
    try:
        r = httpx.get(f"{_IDENTITY_URL}/internal/kyc/status/{user_id}",
                      headers={"x-internal-token": get_settings().internal_token},
                      timeout=6.0)
        r.raise_for_status()
        return r.json().get("status", "none")
    except httpx.HTTPError:
        return "none"
