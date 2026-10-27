"""Noms des agents d'agence — via l'endpoint interne d'**identity** (propriétaire des comptes).

v2-native : ne dépend plus du monolithe (prérequis au décommissionnement). `active_only=1`
reproduit le filtre `is_active` du `/internal/agency/users` du monolithe. Cache court.
"""
import os
import time

import httpx

from semsar_common import get_settings

IDENTITY_URL = os.environ.get("IDENTITY_URL", "http://localhost:8501")
_TTL = 60.0
_CACHE: dict[int, tuple[float, list[dict]]] = {}


def agents(agency_id: int | None) -> list[dict]:
    if agency_id is None:
        return []
    cached = _CACHE.get(agency_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    try:
        resp = httpx.get(
            f"{IDENTITY_URL}/internal/agency/{agency_id}/members",
            params={"active_only": 1},
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
        members = (resp.json() or {}).get("members", []) if resp.status_code == 200 else []
    except httpx.HTTPError:
        members = cached[1] if cached else []
        _CACHE[agency_id] = (time.monotonic(), members)
        return members
    users = [{"id": m["id"], "name": m.get("full_name"), "email": m.get("email")} for m in members]
    _CACHE[agency_id] = (time.monotonic(), users)
    return users


def name_of(agency_id: int | None, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    for u in agents(agency_id):
        if u.get("id") == user_id:
            return u.get("name")
    return None


_EMAIL_CACHE: dict[int, tuple[float, str | None]] = {}


def email_of(user_id: int | None) -> str | None:
    """Adresse du compte connecté — identity possède les comptes, crm n'en garde pas de copie.

    C'est elle qui relie un acquéreur à sa fiche client : l'agence saisit la fiche avec son
    e-mail, le compte porte le même, le dossier est le sien.
    """
    if user_id is None:
        return None
    cached = _EMAIL_CACHE.get(user_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    try:
        resp = httpx.get(f"{IDENTITY_URL}/internal/user/{user_id}",
                         headers={"x-internal-token": get_settings().internal_token}, timeout=5.0)
        user = (resp.json() or {}).get("user") if resp.status_code == 200 else None
    except httpx.HTTPError:
        return cached[1] if cached else None
    email = (user or {}).get("email")
    _EMAIL_CACHE[user_id] = (time.monotonic(), email)
    return email
