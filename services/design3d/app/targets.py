"""Résolution du propriétaire de la cible d'un projet de conception.

Chaque type de cible appartient à un autre service, qui en est seul autorité :
un bien à `listing`, un lot de programme à `programs`. Le patron d'appel est
celui de `services/selling/app/listing_client.py` — GET interne, jeton partagé,
délai court.

L'indisponibilité n'est jamais silencieusement assimilée à une autorisation :
elle remonte en `TargetUnavailable`, que l'appelant tranche en refusant.
"""
import os

import httpx

from semsar_common import get_settings

_LISTING_URL = os.environ.get("LISTING_URL", "http://localhost:8012")
_PROGRAMS_URL = os.environ.get("PROGRAMS_URL", "http://localhost:8516")

_ROUTES = {
    "property": (_LISTING_URL, "/internal/properties/{id}/owner"),
    "program_lot": (_PROGRAMS_URL, "/internal/program-lots/{id}/owner"),
}


class TargetUnavailable(Exception):
    """Le service propriétaire de la cible n'a pas répondu de façon exploitable."""


def fetch_owner(target_type: str, target_id: int) -> dict:
    """`{"owner_id": …, "agency_id": …}` — les deux à `None` si la cible n'existe pas."""
    route = _ROUTES.get(target_type)
    if route is None:
        raise TargetUnavailable(f"type de cible sans autorité connue: {target_type}")
    base, path = route
    try:
        r = httpx.get(f"{base}{path.format(id=target_id)}",
                      headers={"x-internal-token": get_settings().internal_token},
                      timeout=6.0)
    except httpx.HTTPError as e:
        raise TargetUnavailable(str(e)) from e
    if r.status_code != 200:
        raise TargetUnavailable(f"HTTP {r.status_code}")
    body = r.json()
    if not isinstance(body, dict):
        raise TargetUnavailable("réponse inattendue")
    return body
