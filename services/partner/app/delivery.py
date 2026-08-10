"""Signature HMAC et livraison des webhooks partenaires — pur, testable sans réseau.

`post` (et `sleep` pour le backoff) sont injectables : en test on fournit un stub
synchrone qui renvoie un code HTTP et éventuellement un no-op de pause ; en prod
`app/worker.py`/`app/main.py` injectent un vrai POST HTTP et `time.sleep`.
"""
import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Callable, Mapping

Poster = Callable[[str, bytes, Mapping[str, str]], int]
Sleeper = Callable[[int], None]


def sign(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _no_sleep(attempt: int) -> None:
    return None


@dataclass
class DeliveryResult:
    status: str  # "DELIVERED" | "FAILED"
    attempts: int
    response_code: int | None


def deliver(webhook: Mapping[str, str], event_type: str, payload: dict, *,
            post: Poster, max_attempts: int = 3, sleep: Sleeper = _no_sleep) -> DeliveryResult:
    """POST signé (`X-Partner-Signature`, `X-Partner-Event`) avec retries. Le
    backoff (`sleep`) n'est jamais appelé après la dernière tentative — pas de
    pause inutile, et en test le défaut `_no_sleep` ne bloque jamais."""
    body = json.dumps({"event": event_type, "data": payload}, sort_keys=True).encode()
    headers = {
        "X-Partner-Signature": sign(webhook["secret"], body),
        "X-Partner-Event": event_type,
        "Content-Type": "application/json",
    }
    response_code: int | None = None
    for attempt in range(1, max_attempts + 1):
        response_code = post(webhook["url"], body, headers)
        if response_code is not None and 200 <= response_code < 300:
            return DeliveryResult(status="DELIVERED", attempts=attempt, response_code=response_code)
        if attempt < max_attempts:
            sleep(attempt)
    return DeliveryResult(status="FAILED", attempts=max_attempts, response_code=response_code)
