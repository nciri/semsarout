"""Comptes masqués (spec §6) pour exclure leurs annonces des résultats — cache court."""
import os
import time

import httpx

from semsar_common import get_settings

MONOLITH_URL = os.environ.get("MONOLITH_URL", "http://localhost:7000")
# Source du masquage : monolithe par défaut, repointable vers trust-safety
# (`MODERATION_HIDDEN_URL=http://localhost:8511/internal/moderation/hidden`).
HIDDEN_URL = os.environ.get(
    "MODERATION_HIDDEN_URL", f"{MONOLITH_URL}/api/v1/internal/moderation/hidden")
_TTL = 60.0
_CACHE = {"at": 0.0, "users": [], "agencies": []}


def hidden() -> tuple[list[int], list[int]]:
    if time.monotonic() - _CACHE["at"] >= _TTL:
        try:
            resp = httpx.get(
                HIDDEN_URL,
                headers={"x-internal-token": get_settings().internal_token},
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json() or {}
                _CACHE["users"] = list(data.get("user_ids", []))
                _CACHE["agencies"] = list(data.get("agency_ids", []))
                _CACHE["at"] = time.monotonic()
        except httpx.HTTPError:
            pass
    return _CACHE["users"], _CACHE["agencies"]
