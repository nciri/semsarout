"""Nom de l'agence — lu chez **agency**, qui le possède.

Sert uniquement de variable de gabarit (`{{agency_name}}`) : si le service ne répond pas,
le message part sans le nom plutôt que de ne pas partir.
"""
import os
import time

import httpx

from semsar_common import get_settings

AGENCY_URL = os.environ.get("AGENCY_URL", "http://localhost:8512")
_TTL = 300.0
_CACHE: dict[int, tuple[float, str]] = {}


def name_of(agency_id: int | None) -> str:
    if agency_id is None:
        return ""
    cached = _CACHE.get(agency_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    try:
        resp = httpx.get(f"{AGENCY_URL}/internal/agency/{agency_id}",
                         headers={"x-internal-token": get_settings().internal_token}, timeout=5.0)
        name = ((resp.json() or {}).get("agency") or {}).get("name") or "" if resp.status_code == 200 else ""
    except httpx.HTTPError:
        return cached[1] if cached else ""
    _CACHE[agency_id] = (time.monotonic(), name)
    return name


def reset_cache() -> None:
    _CACHE.clear()
