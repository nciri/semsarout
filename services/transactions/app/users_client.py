"""Noms des agents d'agence — projetés depuis l'endpoint interne du monolithe (cache court)."""
import os
import time

import httpx

from semsar_common import get_settings

MONOLITH_URL = os.environ.get("MONOLITH_URL", "http://localhost:7000")
_TTL = 60.0
_CACHE: dict[int, tuple[float, list[dict]]] = {}


def agents(agency_id: int | None) -> list[dict]:
    key = agency_id or 0
    cached = _CACHE.get(key)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    try:
        resp = httpx.get(
            f"{MONOLITH_URL}/api/v1/internal/agency/users",
            params={"agency_id": agency_id} if agency_id else {},
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
        users = (resp.json() or {}).get("users", []) if resp.status_code == 200 else []
    except httpx.HTTPError:
        users = cached[1] if cached else []
    _CACHE[key] = (time.monotonic(), users)
    return users


def name_of(agency_id: int | None, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    for u in agents(agency_id):
        if u.get("id") == user_id:
            return u.get("name")
    return None
