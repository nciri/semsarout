"""Port de paiement agnostique (couture PSP).

Aucun PSP réel n'est intégré : `SimulatedProvider` est l'implémentation par défaut et
UNIQUE actuellement câblée, sélectionnée via `PAYMENT_PROVIDER` (config.py). Elle ne
fait AUCUN appel réseau externe et ne mobilise aucune clé/credential réel — elle modélise
juste le cycle create_intent → (webhook) confirm/refund d'un vrai prestataire.

Pour brancher un vrai prestataire plus tard (ex. CMI, Stripe) :
  1. Créer un compte marchand chez le prestataire + obtenir les clés API (jamais en dur :
     variables d'env dédiées, ex. `CMI_API_KEY`, `STRIPE_SECRET_KEY`).
  2. Implémenter une classe `PaymentProvider` qui appelle réellement l'API du prestataire
     dans `create_intent`/`confirm`/`refund` (au lieu de générer un id local).
  3. Mapper les webhooks du prestataire (leur format de payload + leur schéma de
     signature, ex. HMAC-SHA256 sur le corps brut) vers le contrat interne utilisé par
     `POST /internal/payments/webhook` : `{"intent_id": ..., "event": "succeeded"|"failed"}`.
     Le endpoint webhook de ce service reste le même ; seule la vérification de signature
     et le mapping payload→event changent.
  4. Ajouter la nouvelle valeur au `PAYMENT_PROVIDER` (config.py) et au factory
     `get_payment_provider()` ci-dessous.
"""
from __future__ import annotations

import hashlib
import hmac
import uuid
from abc import ABC, abstractmethod

from .config import get_coloc_settings


class PaymentProvider(ABC):
    """Interface du port de paiement. `payment_id`/`amount` sont les seules données
    métier nécessaires pour créer un intent — aucune donnée de carte/compte n'y transite
    (cadre simulé : jamais de PCI-DSS à gérer ici)."""

    name: str

    @abstractmethod
    def create_intent(self, *, payment_id: str, amount: float) -> dict:
        """Retourne {'intent_id': str, 'status': 'processing'}."""

    @abstractmethod
    def confirm(self, intent_id: str) -> dict:
        """Retourne {'intent_id': str, 'status': 'succeeded'|'failed'}."""

    @abstractmethod
    def refund(self, intent_id: str) -> dict:
        """Retourne {'intent_id': str, 'status': 'succeeded'|'failed'}."""


class SimulatedProvider(PaymentProvider):
    """Provider par défaut — aucun appel réseau, aucune clé réelle. `confirm`/`refund`
    réussissent toujours de manière déterministe (démo) : c'est le webhook simulé qui
    matérialise l'issue de `create_intent`, comme un vrai flux asynchrone PSP."""

    name = "simulated"

    def create_intent(self, *, payment_id: str, amount: float) -> dict:
        return {"intent_id": f"sim_{uuid.uuid4().hex}", "status": "processing"}

    def confirm(self, intent_id: str) -> dict:
        return {"intent_id": intent_id, "status": "succeeded"}

    def refund(self, intent_id: str) -> dict:
        return {"intent_id": intent_id, "status": "succeeded"}


_PROVIDERS: dict[str, type[PaymentProvider]] = {
    "simulated": SimulatedProvider,
}


def get_payment_provider() -> PaymentProvider:
    settings = get_coloc_settings()
    provider_cls = _PROVIDERS.get(settings.payment_provider, SimulatedProvider)
    return provider_cls()


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """HMAC-SHA256(secret, raw_body) en hex, comparaison à temps constant. Schéma générique
    (comparable à celui de la plupart des PSP réels) — à remplacer par le schéma propre au
    prestataire choisi le jour où l'un d'eux est réellement branché (cf. docstring module)."""
    settings = get_coloc_settings()
    expected = hmac.new(settings.payment_webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")
