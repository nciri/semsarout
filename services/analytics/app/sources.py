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
AUDIT_URL = os.environ.get("AUDIT_URL", "http://localhost:8513")
AGENCY_URL = os.environ.get("AGENCY_URL", "http://localhost:8512")


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


def members(agency_id: int) -> list[dict]:
    return _get(f"{IDENTITY_URL}/internal/agency/{agency_id}/members", {}).get("members", [])


def agent_names(agency_id: int) -> dict[int, str]:
    return {m["id"]: m.get("full_name") for m in members(agency_id)}


def clients(agency_id: int) -> list[dict]:
    return _get(f"{CRM_URL}/internal/clients", {"agency_id": agency_id}).get("clients", [])


def visits(agency_id: int) -> list[dict]:
    return _get(f"{CRM_URL}/internal/visits", {"agency_id": agency_id}).get("visits", [])


def properties(agency_id: int) -> list[dict]:
    return _get(f"{LISTING_URL}/internal/properties", {"agency_id": agency_id, "all": 1}).get("properties", [])


# --- Overview plateforme (super-admin) : compteurs des services propriétaires ---
def users_stats() -> dict:
    return _get(f"{IDENTITY_URL}/internal/users/stats", {})


def agencies_stats() -> dict:
    return _get(f"{AGENCY_URL}/internal/agencies/stats", {})


def subscriptions_stats() -> dict:
    return _get(f"{BILLING_URL}/internal/subscriptions/stats", {})


# --- Comptes admin (super-admin) : `/admin/accounts` (liste + détail) ---
def users_list(tenant: str | None = None) -> list[dict]:
    params = {"tenant": tenant} if tenant else {}
    return _get(f"{IDENTITY_URL}/internal/users", params).get("users", [])


def user_detail(user_id: int) -> dict:
    return _get(f"{IDENTITY_URL}/internal/user/{user_id}", {})


def agencies_list() -> list[dict]:
    return _get(f"{AGENCY_URL}/internal/agencies", {}).get("agencies", [])


def agency_detail(agency_id: int) -> dict:
    return _get(f"{AGENCY_URL}/internal/agency/{agency_id}", {})


def subscriptions_map() -> dict:
    return _get(f"{BILLING_URL}/internal/subscriptions", {}).get("subscriptions", {})


def property_counts() -> dict:
    return _get(f"{LISTING_URL}/internal/property-counts", {})


def entity_activity(entity_type: str, entity_id: int, limit: int = 30) -> list[dict]:
    return _get(f"{AUDIT_URL}/internal/activity",
                {"entity_type": entity_type, "entity_id": entity_id, "limit": limit}).get("activities", [])


def neighborhood_refs() -> list[dict]:
    return _get(f"{GEO_URL}/internal/neighborhood-prices", {}).get("refs", [])


def seats(agency_id: int) -> dict:
    return _get(f"{IDENTITY_URL}/internal/agency/{agency_id}/seats", {})


def subscription(agency_id: int):
    return _get(f"{BILLING_URL}/internal/subscription", {"agency_id": agency_id}).get("subscription")


def activity(agency_id: int, page: int, per_page: int) -> dict:
    return _get(f"{AUDIT_URL}/internal/activity",
                {"agency_id": agency_id, "page": page, "per_page": per_page})
