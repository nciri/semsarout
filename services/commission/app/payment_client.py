"""Appel interne vers le service payment pour créer un intent de commission (lien CMI)."""
import os

import httpx

_PAYMENT_URL = os.environ.get("PAYMENT_URL", "http://localhost:8507")


def create_commission_intent(account_id: int, amount: float, deal_type: str, source_ref: int) -> tuple[str, str]:
    resp = httpx.post(
        f"{_PAYMENT_URL}/payments/create-intent",
        json={"purpose": "commission", "amount": amount, "payment_method": "card",
              "commission_ref": f"{deal_type}:{source_ref}", "account_id": account_id},
        headers={"x-semsar-user-id": str(account_id)}, timeout=8.0,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"payment create-intent {resp.status_code}")
    body = resp.json()
    return body["reference"], body["payment_url"]
