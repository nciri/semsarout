"""Service search — API de lecture (requêtes sur la projection OpenSearch).

Recherche publique (annonces publiques), sans auth — comme la recherche du site.
Le BFF route `/api/v1/search/*` ici ; l'indexation est faite par le worker.
"""
from fastapi import FastAPI, Query
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_common import get_settings, install_error_handlers, setup_logging, setup_tracing
from semsar_search import ensure_index, os_client, search_properties

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

app = FastAPI(title=f"SemsarOut — {settings.service_name}")
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

_client = os_client(settings.opensearch_url)


@app.on_event("startup")
def _startup() -> None:
    try:
        ensure_index(_client)
    except Exception:  # noqa: BLE001 — OpenSearch peut ne pas être prêt au boot
        pass


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/search/properties")
def search(
    q: str | None = None,
    city: str | None = None,
    transaction_type: str | None = None,
    property_type: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> dict:
    filters = {
        "city": city,
        "transaction_type": transaction_type,
        "property_type": property_type,
    }
    return search_properties(_client, q=q, filters=filters, page=page, per_page=per_page)
