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
    # Sévrage de la frontière d'auth : si `jwt_secret_key` est fourni (env JWT_SECRET_KEY,
    # doit correspondre au monolithe), le BFF valide le JWT LOCALEMENT (signature + claims).
    # **Pas de défaut** : sans secret configuré, le BFF retombe sur le monolithe (/auth/me) —
    # on ne vérifie jamais une signature avec une clé codée en dur.
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"

    # Multi-tenant (M3a-L3achrane) : "host=tenant,host2=tenant2". En dev, l'en-tête
    # x-tenant (posé par le proxy Vite du front) est honoré ; en prod seul Host compte.
    tenant_hosts: str = ""
    # Opt-in DEV uniquement : honorer l'en-tête x-tenant entrant (posé par le proxy Vite).
    # Défaut False = fail-safe : en prod, seul Host compte même si ENVIRONMENT est mal posé.
    tenant_dev_header: bool = False

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
    crm_url: str | None = None
    transactions_url: str | None = None
    rental_url: str | None = None
    buyer_url: str | None = None
    programs_url: str | None = None
    staymanager_url: str | None = None
    geo_url: str | None = None
    messaging_url: str | None = None
    trust_safety_url: str | None = None
    agency_url: str | None = None
    audit_url: str | None = None
    commission_url: str | None = None
    selling_url: str | None = None
    coloc_listing_url: str | None = None
    coloc_profile_url: str | None = None
    matching_url: str | None = None
    # Jeton interne partagé (appels BFF → APIs internes des services, ex. matching).
    internal_token: str = ""

    otlp_endpoint: str = "http://localhost:4318"


@lru_cache
def get_settings() -> GatewaySettings:
    return GatewaySettings()
