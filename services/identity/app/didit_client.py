"""Client Didit (KYC réel) — session hébergée + décision (pull), voir
docs.didit.me/getting-started/quick-start. Jamais de valeurs par défaut sur les secrets :
si non configurés, les appels échouent explicitement (fail-closed)."""
import hashlib
import hmac
import os

import httpx

_API_URL = os.environ.get("DIDIT_API_URL", "https://verification.didit.me")
_API_KEY = os.environ.get("DIDIT_API_KEY", "")
_WORKFLOW_ID = os.environ.get("DIDIT_WORKFLOW_ID", "")


class DiditUnavailable(Exception):
    pass


def create_session(vendor_data: str, callback: str | None = None) -> dict:
    body = {"workflow_id": _WORKFLOW_ID, "vendor_data": vendor_data}
    if callback:
        body["callback"] = callback
    try:
        r = httpx.post(f"{_API_URL}/v3/session/", json=body,
                       headers={"x-api-key": _API_KEY}, timeout=10.0)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        raise DiditUnavailable(str(e)) from e


def fetch_decision(session_id: str) -> dict:
    try:
        r = httpx.get(f"{_API_URL}/v3/session/{session_id}/decision/",
                      headers={"x-api-key": _API_KEY}, timeout=10.0)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        raise DiditUnavailable(str(e)) from e


def verify_signature(raw_body: bytes, signature: str, secret: str | None = None) -> bool:
    secret = os.environ.get("DIDIT_WEBHOOK_SECRET", "") if secret is None else secret
    if not secret:
        return True  # pas de secret configuré : no-op (parité payment webhook)
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
