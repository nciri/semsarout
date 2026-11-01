"""Équipes de l'agence, lues chez identity (`/internal/teams`).

Les équipes appartiennent à `identity` : les redéclarer ici donnerait deux annuaires à tenir
à jour, et l'exploitation finirait par confier une tâche à quelqu'un qui a quitté l'agence.
Le cache court évite d'interroger identity à chaque ligne de planning ; en cas de panne on
rend la dernière réponse connue plutôt qu'une liste vide, qui ferait disparaître les noms.
"""
import os
import time

import httpx

from semsar_common import get_settings

IDENTITY_URL = os.environ.get("IDENTITY_URL", "http://localhost:8501")
_TTL = 60.0
_CACHE: dict[int, tuple[float, list[dict]]] = {}


def teams(agency_id: int) -> list[dict]:
    cached = _CACHE.get(agency_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    rows: list[dict] = cached[1] if cached else []
    try:
        resp = httpx.get(f"{IDENTITY_URL}/internal/teams", params={"agency_id": agency_id},
                         headers={"x-internal-token": get_settings().internal_token}, timeout=5.0)
        if resp.status_code == 200:
            rows = (resp.json() or {}).get("teams") or []
    except httpx.HTTPError:
        pass
    _CACHE[agency_id] = (time.monotonic(), rows)
    return rows


def team_ids(agency_id: int) -> set[int]:
    return {t["id"] for t in teams(agency_id) if t.get("id")}
