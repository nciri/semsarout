"""Biens d'une agence (dicts complets) via l'endpoint interne de **listing** (propriétaire du
bien). Pour `/agencies/{slug}/properties`. v2-native (service listing, pas le monolithe)."""
import os

import httpx

from semsar_common import get_settings

LISTING_URL = os.environ.get("LISTING_URL", "http://localhost:8012")


def by_agency(agency_id: int, status: str, page: int, per_page: int) -> dict:
    """{properties, total, pages, current_page} — biens de l'agence (masquage modération inclus)."""
    empty = {"properties": [], "total": 0, "pages": 1, "current_page": page}
    try:
        resp = httpx.get(
            f"{LISTING_URL}/internal/properties",
            params={"agency_id": agency_id, "status": status, "page": page, "per_page": per_page},
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
        return resp.json() if resp.status_code == 200 else empty
    except httpx.HTTPError:
        return empty
