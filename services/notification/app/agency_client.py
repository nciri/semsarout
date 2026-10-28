"""Réglages SMTP d'une agence — lus chez **agency** (jeton interne, cache court).

Une agence qui a configuré son serveur d'envoi doit voir ses e-mails partir de chez elle,
pas de l'adresse de la plateforme : c'est tout l'objet du réglage. Sans configuration
complète, on retombe sur le SMTP d'environnement.
"""
import os
import time

import httpx

_TTL = 300.0
_CACHE: dict[int, tuple[float, dict | None]] = {}

REQUIRED = ("smtp_host", "smtp_user", "smtp_password")


def _agency() -> str:
    return os.environ.get("AGENCY_URL", "http://localhost:8512")


def smtp_of(agency_id: int | None) -> dict | None:
    """Config SMTP de l'agence, ou None : l'appelant utilise alors celle de la plateforme."""
    if agency_id is None:
        return None
    cached = _CACHE.get(agency_id)
    if cached and time.monotonic() - cached[0] < _TTL:
        return cached[1]
    try:
        resp = httpx.get(f"{_agency()}/internal/agency/{agency_id}/settings",
                         headers={"x-internal-token": os.environ.get("INTERNAL_TOKEN", "")},
                         timeout=5.0)
        data = (resp.json() or {}).get("settings") if resp.status_code == 200 else None
    except httpx.HTTPError:
        return cached[1] if cached else None
    config = None
    if data and all(data.get(k) for k in REQUIRED):
        config = {"host": data["smtp_host"], "port": data.get("smtp_port") or 587,
                  "user": data["smtp_user"], "password": data["smtp_password"],
                  "from_email": data.get("agency_email") or data["smtp_user"],
                  "from_name": data.get("agency_name") or None}
    _CACHE[agency_id] = (time.monotonic(), config)
    return config


def reset_cache() -> None:
    _CACHE.clear()
