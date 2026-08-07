"""Configuration locale au service coloc-listing (couture PSP — cf. payment_provider.py).

Distincte des settings partagés `semsar_common.get_settings()` : ce qui suit n'a de sens
que pour ce service (choix du provider de paiement simulé, secret webhook).
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class ColocListingSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "simulated" (défaut, aucun réseau externe) — brancher un vrai prestataire (CMI,
    # Stripe...) revient à ajouter une valeur ici + une classe PaymentProvider dédiée
    # dans payment_provider.py (voir la couture documentée dans ce module).
    payment_provider: str = "simulated"
    # Secret partagé HMAC pour valider `x-webhook-signature` sur
    # POST /internal/payments/webhook. À écraser via env en prod (jamais de défaut réel).
    payment_webhook_secret: str = "dev-webhook-secret-change-me"


@lru_cache
def get_coloc_settings() -> ColocListingSettings:
    return ColocListingSettings()
