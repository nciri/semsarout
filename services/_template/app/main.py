"""Gabarit de service FastAPI SemsarOut.

Cloner ce dossier vers `services/<nom>` puis :
  - définir SERVICE_NAME=<nom> (env) ;
  - brancher un schéma + un rôle PostgreSQL dédiés (cf. ADR-0002) ;
  - émettre les événements via l'outbox (`semsar_events`) ;
  - protéger les routes avec `semsar_auth.require_roles(...)`.
"""
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_common import get_settings, install_error_handlers, setup_logging, setup_tracing

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

app = FastAPI(title=f"SemsarOut — {settings.service_name}")
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# TODO : routes du domaine (le BFF les appellera / agrègera).
