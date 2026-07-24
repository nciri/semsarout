"""Configuration commune à tous les services (12-factor, via variables d'env)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Identité du service
    service_name: str = "semsar-service"
    environment: str = "dev"
    log_level: str = "INFO"

    # Données (PostgreSQL natif — cf. ADR-0002 ; 1 rôle/schéma par service)
    database_url: str | None = None
    redis_url: str = "redis://localhost:6379/0"

    # Bus d'événements
    rabbitmq_url: str = "amqp://semsar:semsar@localhost:5672/"
    events_exchange: str = "semsar.events"

    # Projections
    opensearch_url: str = "http://localhost:9200"

    # Stockage objet (MinIO/S3) + archivage WORM
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "semsar"
    s3_secret_key: str = "semsar-secret"
    worm_bucket: str = "semsar-worm"

    # Observabilité
    otlp_endpoint: str = "http://localhost:4318"

    # Auth — JWT RS256 (clé publique pour vérification)
    jwt_public_key: str | None = None
    jwt_algorithm: str = "RS256"
    jwt_issuer: str = "semsar-identity"

    # Transition strangler : faire confiance aux en-têtes d'identité X-Semsar-*
    # injectés par le BFF (au lieu de vérifier le JWT). Le réseau interne DOIT
    # empêcher tout accès direct aux services quand ce flag est actif.
    trust_gateway_headers: bool = False

    # Jeton partagé pour les appels internes service→service (ex. marketplace→catalog).
    internal_token: str = "change-me-internal"


@lru_cache
def get_settings() -> Settings:
    return Settings()
