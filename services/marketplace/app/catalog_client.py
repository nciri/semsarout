"""Appel interne marketplace → catalog : réservation atomique de stock au paiement."""
import os

import httpx

from semsar_common import get_settings

CATALOG_INTERNAL_URL = os.environ.get("CATALOG_INTERNAL_URL", "http://localhost:8009")


def reserve(items: list[dict]) -> httpx.Response:
    """items = [{'product_id', 'quantity'}]. 200 {ok:true} | 409 {error:'Stock…'}."""
    return httpx.post(
        f"{CATALOG_INTERNAL_URL}/internal/products/reserve",
        json={"items": items},
        headers={"x-internal-token": get_settings().internal_token},
        timeout=10.0,
    )
