"""Repli auto-réparateur des entitlements — interroge l'abonnement d'une agence via l'endpoint
interne de **billing** quand `AgencyRO.features` est vide (ex. abonnement déjà actif avant que
l'événement `billing.subscription.activated` n'existe, ou événement perdu). Best-effort : timeout
court, toute erreur retombe sur une liste vide (ne doit jamais casser le login)."""
import os

import httpx

from semsar_common import get_settings

BILLING_URL = os.environ.get("BILLING_URL", "http://localhost:8508")


def features_of(agency_id: int) -> list[str]:
    try:
        resp = httpx.get(
            f"{BILLING_URL}/internal/subscription",
            params={"agency_id": agency_id},
            headers={"x-internal-token": get_settings().internal_token},
            timeout=3.0,
        )
        if resp.status_code != 200:
            return []
        data = resp.json() or {}
        sub = data.get("subscription") or {}
        return list(sub.get("features") or [])
    except Exception:  # noqa: BLE001 — jamais d'exception qui casserait le login
        return []
