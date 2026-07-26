"""Sources de données cross-domaine pour les agrégats analytics (query-time).

analytics ne duplique pas les données : il lit les lignes brutes via les endpoints internes des
services propriétaires (transactions, crm, identity) et agrège en mémoire. v2-native.
"""
import os

import httpx

from semsar_common import get_settings

TRANSACTIONS_URL = os.environ.get("TRANSACTIONS_URL", "http://localhost:8514")
CRM_URL = os.environ.get("CRM_URL", "http://localhost:8013")
IDENTITY_URL = os.environ.get("IDENTITY_URL", "http://localhost:8501")
LISTING_URL = os.environ.get("LISTING_URL", "http://localhost:8012")
GEO_URL = os.environ.get("GEO_URL", "http://localhost:8509")
BILLING_URL = os.environ.get("BILLING_URL", "http://localhost:8508")


def _get(url: str, params: dict) -> dict:
    try:
        resp = httpx.get(url, params=params,
                         headers={"x-internal-token": get_settings().internal_token}, timeout=8.0)
        return resp.json() if resp.status_code == 200 else {}
    except httpx.HTTPError:
        return {}


def transactions(agency_id: int) -> list[dict]:
    return _get(f"{TRANSACTIONS_URL}/internal/transactions", {"agency_id": agency_id}).get("transactions", [])


def leads(agency_id: int) -> list[dict]:
    return _get(f"{CRM_URL}/internal/leads", {"agency_id": agency_id}).get("leads", [])


def scope(agency_id: int, user_id: int) -> dict:
    data = _get(f"{IDENTITY_URL}/internal/agency/{agency_id}/analytics-scope", {"user_id": user_id})
    return data or {"all": False, "agent_id": user_id}


def agent_names(agency_id: int) -> dict[int, str]:
    members = _get(f"{IDENTITY_URL}/internal/agency/{agency_id}/members", {}).get("members", [])
    return {m["id"]: m.get("full_name") for m in members}


def properties(agency_id: int) -> list[dict]:
    return _get(f"{LISTING_URL}/internal/properties", {"agency_id": agency_id, "all": 1}).get("properties", [])


def neighborhood_refs() -> list[dict]:
    return _get(f"{GEO_URL}/internal/neighborhood-prices", {}).get("refs", [])


def seats(agency_id: int) -> dict:
    return _get(f"{IDENTITY_URL}/internal/agency/{agency_id}/seats", {})


def subscription(agency_id: int):
    return _get(f"{BILLING_URL}/internal/subscription", {"agency_id": agency_id}).get("subscription")
