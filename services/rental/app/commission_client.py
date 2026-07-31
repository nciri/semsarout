"""Appel synchrone au gate commission — fail-closed (toute erreur = indisponible)."""
import os

import httpx

from semsar_common import get_settings

_COMMISSION_URL = os.environ.get("COMMISSION_URL", "http://localhost:8519")


class CommissionUnavailable(Exception):
    pass


def gate(account_id: int, deal_type: str, source_ref: int) -> dict:
    try:
        r = httpx.get(f"{_COMMISSION_URL}/internal/commission/gate",
                      params={"account_id": account_id, "deal_type": deal_type, "source_ref": source_ref},
                      headers={"x-internal-token": get_settings().internal_token},
                      timeout=6.0)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        raise CommissionUnavailable(str(e)) from e


def void(deal_type: str, source_ref: int) -> None:
    try:
        httpx.post(f"{_COMMISSION_URL}/internal/commission/void",
                   json={"deal_type": deal_type, "source_ref": source_ref},
                   headers={"x-internal-token": get_settings().internal_token},
                   timeout=6.0)
    except httpx.HTTPError:
        pass  # best-effort
