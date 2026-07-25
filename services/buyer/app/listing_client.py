"""Biens (dicts complets) via l'endpoint interne de **listing** (propriétaire du bien).
Pour l'embed complet des favoris + le contrôle d'existence. v2-native (service listing)."""
import os

import httpx

from semsar_common import get_settings

LISTING_URL = os.environ.get("LISTING_URL", "http://localhost:8012")


def by_ids(ids: list[int]) -> dict[int, dict]:
    """{id: property_dict} pour les biens existants parmi `ids`."""
    if not ids:
        return {}
    try:
        resp = httpx.get(
            f"{LISTING_URL}/internal/properties",
            params={"ids": ",".join(str(i) for i in ids)},
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
        props = (resp.json() or {}).get("properties", []) if resp.status_code == 200 else []
    except httpx.HTTPError:
        props = []
    return {p["id"]: p for p in props}


def exists(property_id: int) -> bool:
    return property_id in by_ids([property_id])
