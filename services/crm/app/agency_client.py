"""Réglages d'exploitation d'une agence — lus chez **agency**, qui les possède.

Deux d'entre eux changent le comportement de crm : l'affectation automatique des leads et
le délai de rappel avant visite. Cache court, comme `users_client` : ces réglages changent
rarement, et un appel par lead serait absurde.
"""
import os
import time

import httpx

from semsar_common import get_settings

AGENCY_URL = os.environ.get("AGENCY_URL", "http://localhost:8512")
_TTL = 60.0
_CACHE: dict[int, tuple[float, dict]] = {}

DEFAULTS = {"lead_auto_assign": False, "visit_reminder_hours": 24}


def settings_of(agency_id: int | None) -> dict:
    """Réglages de l'agence, défauts si elle est inconnue ou le service injoignable."""
    if agency_id is None:
        return dict(DEFAULTS)
    cached = _CACHE.get(agency_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    try:
        resp = httpx.get(f"{AGENCY_URL}/internal/agency/{agency_id}/settings",
                         headers={"x-internal-token": get_settings().internal_token}, timeout=5.0)
        data = (resp.json() or {}).get("settings") if resp.status_code == 200 else None
    except httpx.HTTPError:
        return cached[1] if cached else dict(DEFAULTS)
    view = {**DEFAULTS, **{k: v for k, v in (data or {}).items() if k in DEFAULTS}}
    _CACHE[agency_id] = (time.monotonic(), view)
    return view


def reset_cache() -> None:
    _CACHE.clear()
