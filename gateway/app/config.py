"""Configuration du BFF/gateway."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class GatewaySettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "gateway"
    environment: str = "dev"
    log_level: str = "INFO"

    # Monolithe Flask cible (Phase 0). Au fil du strangler, des routes seront
    # redirigées vers les nouveaux services (identity, listing, …).
    upstream_url: str = "http://localhost:7000"
    request_timeout: float = 30.0

    # Frontière d'auth (transition) : le BFF résout l'identité via cet endpoint du
    # monolithe puis injecte X-Semsar-* vers les services internes. Cache court.
    auth_resolve_path: str = "/api/v1/auth/me"
    auth_features_path: str = "/api/v1/my-subscription"  # entitlements du plan
    identity_ttl_seconds: int = 30

    # Services extraits (routage strangler). Vide = tout part au monolithe.
    identity_url: str | None = None
    search_url: str | None = None
    analytics_url: str | None = None
    contract_url: str | None = None
    legal_url: str | None = None
    payment_url: str | None = None
    billing_url: str | None = None
    catalog_url: str | None = None
    marketplace_url: str | None = None
    directory_url: str | None = None
    listing_url: str | None = None

    otlp_endpoint: str = "http://localhost:4318"


@lru_cache
def get_settings() -> GatewaySettings:
    return GatewaySettings()
