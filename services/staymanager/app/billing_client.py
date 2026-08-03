"""Abonnement (has_staymanager_sync) via billing — gate feature sync StayManager."""
import os
import time

import httpx

from semsar_common import get_settings

BILLING_URL = os.environ.get("BILLING_URL", "http://localhost:8508")
_TTL = 10.0
_CACHE: dict[int, tuple[float, dict | None]] = {}


def subscription(agency_id: int) -> dict | None:
    cached = _CACHE.get(agency_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    sub = None
    try:
        resp = httpx.get(f"{BILLING_URL}/internal/subscription", params={"agency_id": agency_id},
                         headers={"x-internal-token": get_settings().internal_token}, timeout=5.0)
        if resp.status_code == 200:
            sub = (resp.json() or {}).get("subscription")
    except httpx.HTTPError:
        sub = cached[1] if cached else None
    _CACHE[agency_id] = (time.monotonic(), sub)
    return sub
