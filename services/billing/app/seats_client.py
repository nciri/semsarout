"""Décompte sièges/équipes d'une agence — via l'endpoint interne d'**identity** (propriétaire
des membres/équipes). Utilisé par le garde-fou de rétrogradation de `change-plan`. v2-native
(service identity, pas le monolithe). Cache très court."""
import os
import time

import httpx

from semsar_common import get_settings

IDENTITY_URL = os.environ.get("IDENTITY_URL", "http://localhost:8501")
_TTL = 10.0
_CACHE: dict[int, tuple[float, dict]] = {}


def seats_of(agency_id: int) -> dict:
    cached = _CACHE.get(agency_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    data = {"active_member_seats": 0, "teams_used": 0}
    try:
        resp = httpx.get(
            f"{IDENTITY_URL}/internal/agency/{agency_id}/seats",
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
        if resp.status_code == 200:
            data = resp.json() or data
    except httpx.HTTPError:
        data = cached[1] if cached else data
    _CACHE[agency_id] = (time.monotonic(), data)
    return data
