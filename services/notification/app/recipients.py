"""Résolution des destinataires (email agence / propriétaire) via les endpoints internes des
services propriétaires. Config lue à l'appel (le worker charge d'abord son `.env`).
"""
import os

import httpx


def _get(url: str) -> dict:
    try:
        r = httpx.get(url, headers={"x-internal-token": os.environ.get("INTERNAL_TOKEN", "")}, timeout=5.0)
        return r.json() if r.status_code == 200 and isinstance(r.json(), dict) else {}
    except (httpx.HTTPError, ValueError):
        return {}


def agency_email(agency_id: int) -> str | None:
    base = os.environ.get("AGENCY_URL", "http://localhost:8512")
    return (_get(f"{base}/internal/agency/{agency_id}").get("agency") or {}).get("email")


def user_email(user_id: int) -> str | None:
    base = os.environ.get("IDENTITY_URL", "http://localhost:8501")
    return (_get(f"{base}/internal/user/{user_id}").get("user") or {}).get("email")
