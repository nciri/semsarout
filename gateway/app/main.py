"""BFF / gateway SemsarOut.

Phase 0 : proxy transparent de `/api/*` vers le monolithe Flask, en préservant
**exactement** le contrat consommé par le frontend (cf. ADR-0003). Au fil du
strangler, `proxy()` sera remplacé route par route par des appels aux nouveaux
services et par de l'agrégation (BFF).
"""
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_common import install_error_handlers, setup_logging, setup_tracing

from .config import get_settings

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

# En-têtes hop-by-hop à ne pas relayer.
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}


# Table de routage strangler : (préfixe /api → (client, réécriture de préfixe)).
# Un préfixe absent => le monolithe. Étendue à chaque nouveau service extrait.
def _resolve_upstream(app: FastAPI, path: str):
    if settings.identity_url and path.startswith("/api/v1/identity"):
        return app.state.identity, path.replace("/api/v1/identity", "/identity", 1)
    if settings.search_url and path.startswith("/api/v1/search"):
        return app.state.search, path.replace("/api/v1/search", "/search", 1)
    if settings.analytics_url and path.startswith("/api/v1/analytics"):
        return app.state.analytics, path.replace("/api/v1/analytics", "/analytics", 1)
    return app.state.monolith, path


def _client_or_none(url: str | None) -> httpx.AsyncClient | None:
    return httpx.AsyncClient(base_url=url, timeout=settings.request_timeout) if url else None


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.monolith = httpx.AsyncClient(
        base_url=settings.upstream_url, timeout=settings.request_timeout
    )
    app.state.identity = _client_or_none(settings.identity_url)
    app.state.search = _client_or_none(settings.search_url)
    app.state.analytics = _client_or_none(settings.analytics_url)
    yield
    for client in (app.state.monolith, app.state.identity, app.state.search, app.state.analytics):
        if client is not None:
            await client.aclose()


app = FastAPI(title="SemsarOut — BFF/gateway", lifespan=lifespan)
install_error_handlers(app)

# Tracing best-effort : ne bloque pas le démarrage si le collector est absent.
try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def proxy(path: str, request: Request) -> Response:
    client, upstream_path = _resolve_upstream(request.app, request.url.path)
    url = upstream_path
    if request.url.query:
        url = f"{url}?{request.url.query}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    upstream = await client.request(
        request.method, url, headers=headers, content=await request.body()
    )
    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )
