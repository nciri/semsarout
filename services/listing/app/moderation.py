"""Masquage des annonces des comptes modérés (spec §6) — SANS OUBLIER cette logique.

Le listing ne possède pas le statut de modération (domaine identity/trust-safety). En
transition, il récupère la liste des comptes masqués (suspendus/supprimés) via l'endpoint
interne du monolithe, avec un cache court. Remplacé plus tard par des événements
trust-safety (`account.suspended`…) alimentant une projection locale.
"""
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
_CACHE = {"at": 0.0, "users": set(), "agencies": set()}


def _refresh() -> None:
    try:
        resp = httpx.get(
            HIDDEN_URL,
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
    except httpx.HTTPError:
        return
    if resp.status_code != 200:
        return
    data = resp.json() or {}
    _CACHE["users"] = set(data.get("user_ids", []))
    _CACHE["agencies"] = set(data.get("agency_ids", []))
    _CACHE["at"] = time.monotonic()


def is_hidden(owner_id: int | None, agency_id: int | None) -> bool:
    if time.monotonic() - _CACHE["at"] >= _TTL:
        _refresh()
    return (owner_id in _CACHE["users"]) or (agency_id is not None and agency_id in _CACHE["agencies"])
