"""Repli auto-réparateur des entitlements — interroge l'abonnement d'une agence via l'endpoint
interne de **billing** quand `AgencyRO.features` est vide (ex. abonnement déjà actif avant que
l'événement `billing.subscription.activated` n'existe, ou événement perdu). Best-effort : timeout
court, aucune erreur ne remonte (ne doit jamais casser le login) — mais l'échec est SIGNALÉ
(`None`) au lieu d'être déguisé en « aucune feature »."""
import os

import httpx

from semsar_common import get_settings

BILLING_URL = os.environ.get("BILLING_URL", "http://localhost:8508")


def features_of(agency_id: int) -> list[str] | None:
    """Features du plan de l'agence, ou `None` si l'appel n'a PAS abouti.

    La distinction est le tout de cette fonction : une liste vide est une réponse LÉGITIME
    (offre gratuite/starter, ou aucun abonnement), tandis qu'un délai dépassé, un billing
    injoignable ou une 5xx ne disent rien des droits de l'agence. Les confondre laissait
    `app.auth._features` persister « zéro feature » en estampillant `features_synced_at`, ce
    qui éteignait définitivement ce repli — durablement, et précisément pendant la fenêtre où
    billing est indisponible (deploy-remote.sh redémarre le mesh AVANT de jouer les migrations
    de facturation). Aucune erreur ne remonte pour autant : le login ne doit jamais échouer
    ici."""
    try:
        resp = httpx.get(
            f"{BILLING_URL}/internal/subscription",
            params={"agency_id": agency_id},
            headers={"x-internal-token": get_settings().internal_token},
            timeout=3.0,
        )
        if resp.status_code != 200:
            return None
        data = resp.json() or {}
    except Exception:  # noqa: BLE001 — jamais d'exception qui casserait le login
        return None
    sub = data.get("subscription") or {}
    return list(sub.get("features") or [])
