"""Résout le propriétaire (seller) d'un bien via listing."""
import os

import httpx

from semsar_common import get_settings

_LISTING_URL = os.environ.get("LISTING_URL", "http://localhost:8012")


def owner_of(property_id: int) -> int | None:
    try:
        r = httpx.get(
            f"{_LISTING_URL}/internal/properties/{property_id}/owner",
            headers={"x-internal-token": get_settings().internal_token},
            timeout=6.0
        )
        if r.status_code == 200:
            return (r.json() or {}).get("owner_id")
    except httpx.HTTPError:
        return None
    return None
