"""Membres d'une agence — via l'endpoint interne d'**identity** (propriétaire des comptes).
Pour `/my-agency` (include_members). v2-native (service identity, pas le monolithe)."""
import os
import time

import httpx

from semsar_common import get_settings

IDENTITY_URL = os.environ.get("IDENTITY_URL", "http://localhost:8501")
_TTL = 10.0
_CACHE: dict[int, tuple[float, list]] = {}


def members_of(agency_id: int) -> list:
    cached = _CACHE.get(agency_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    data: list = []
    try:
        resp = httpx.get(
            f"{IDENTITY_URL}/internal/agency/{agency_id}/members",
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
        if resp.status_code == 200:
            data = (resp.json() or {}).get("members", [])
    except httpx.HTTPError:
        data = cached[1] if cached else []
    _CACHE[agency_id] = (time.monotonic(), data)
    return data
