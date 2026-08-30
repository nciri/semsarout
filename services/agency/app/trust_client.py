"""Score de confiance des agences via l'endpoint interne batché de trust-safety."""
import os

import httpx

from semsar_common import get_settings

TRUST_SAFETY_URL = os.environ.get("TRUST_SAFETY_URL", "http://localhost:8511")
_DEFAULT = {"level": "none", "deal_count": 0}


def batch(agency_ids: list[int]) -> dict[int, dict]:
    """{agency_id: {level, deal_count}} — dégradation propre (tout à `none`) si le service
    trust-safety est indisponible."""
    if not agency_ids:
        return {}
    defaults = {i: dict(_DEFAULT) for i in agency_ids}
    try:
        resp = httpx.get(
            f"{TRUST_SAFETY_URL}/internal/trust/batch",
            params={"entity_type": "agency", "ids": ",".join(str(i) for i in agency_ids)},
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
        if resp.status_code != 200:
            return defaults
        items = resp.json().get("items", {})
        return {i: items.get(str(i), dict(_DEFAULT)) for i in agency_ids}
    except httpx.HTTPError:
        return defaults
