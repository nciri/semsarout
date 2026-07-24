"""BFF / gateway SemsarOut.

Phase 0 : proxy transparent de `/api/*` vers le monolithe Flask, en préservant
**exactement** le contrat consommé par le frontend (cf. ADR-0003). Au fil du
strangler, `proxy()` sera remplacé route par route par des appels aux nouveaux
services et par de l'agrégation (BFF).
"""
import time
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

# Cache court d'identités résolues (clé = jeton Bearer).
_IDENTITY_CACHE: dict[str, tuple[float, dict]] = {}


async def _resolve_identity(app: FastAPI, authorization: str | None) -> dict | None:
    """Valide le jeton en interrogeant le monolithe (/auth/me) et renvoie le contexte
    d'auth (user_id, agency_id, is_superadmin, role). Résultat mis en cache brièvement."""
    if not authorization:
        return None
    now = time.monotonic()
    cached = _IDENTITY_CACHE.get(authorization)
    if cached and cached[0] > now:
        return cached[1]
    try:
        resp = await app.state.monolith.get(
            settings.auth_resolve_path, headers={"authorization": authorization}
        )
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    user = (resp.json() or {}).get("user", {})
    ident = {
        "user_id": user.get("id"),
        "agency_id": user.get("agency_id"),
        "is_superadmin": bool(user.get("is_superadmin")),
        "role": user.get("account_role") or user.get("role"),
        "features": await _resolve_features(app, authorization),
    }
    _IDENTITY_CACHE[authorization] = (now + settings.identity_ttl_seconds, ident)
    return ident


async def _resolve_features(app: FastAPI, authorization: str) -> list[str]:
    """Entitlements du plan de l'agence (artisans, contracts, legal), via le monolithe."""
    try:
        resp = await app.state.monolith.get(
            settings.auth_features_path, headers={"authorization": authorization}
        )
    except httpx.HTTPError:
        return []
    if resp.status_code != 200:
        return []
    plan = ((resp.json() or {}).get("subscription") or {}).get("plan") or {}
    return [name for name, flag in (
        ("artisans", plan.get("has_artisans")),
        ("contracts", plan.get("has_contracts")),
        ("legal", plan.get("has_legal")),
    ) if flag]


def _inject_identity(headers: dict, ident: dict) -> None:
    if ident.get("user_id") is not None:
        headers["x-semsar-user-id"] = str(ident["user_id"])
    if ident.get("agency_id") is not None:
        headers["x-semsar-agency-id"] = str(ident["agency_id"])
    headers["x-semsar-superadmin"] = "1" if ident.get("is_superadmin") else "0"
    if ident.get("role"):
        headers["x-semsar-roles"] = str(ident["role"])
    if ident.get("features"):
        headers["x-semsar-features"] = ",".join(ident["features"])


# Table de routage strangler : (préfixe /api → (client, réécriture de préfixe)).
# Un préfixe absent => le monolithe. Étendue à chaque nouveau service extrait.
def _resolve_upstream(app: FastAPI, path: str):
    if settings.identity_url and path.startswith("/api/v1/identity"):
        return app.state.identity, path.replace("/api/v1/identity", "/identity", 1)
    if settings.search_url and path.startswith("/api/v1/search"):
        return app.state.search, path.replace("/api/v1/search", "/search", 1)
    if settings.analytics_url and path.startswith("/api/v1/analytics"):
        return app.state.analytics, path.replace("/api/v1/analytics", "/analytics", 1)
    if settings.contract_url and path.startswith("/api/v1/contract"):
        return app.state.contract, path.replace("/api/v1/contract", "/contract", 1)
    if settings.legal_url and path.startswith("/api/v1/legal"):
        return app.state.legal, path.replace("/api/v1/legal", "/legal", 1)
    if settings.payment_url and path.startswith("/api/v1/payment"):
        return app.state.payment, path.replace("/api/v1/payment", "/payment", 1)
    if settings.billing_url and path.startswith("/api/v1/billing"):
        return app.state.billing, path.replace("/api/v1/billing", "/billing", 1)
    # Extraction du domaine boutique : routes EXISTANTES reroutées (préfixe /api/v1 retiré).
    if settings.catalog_url and (
        path.startswith("/api/v1/backoffice/shop/products")
        or path.startswith("/api/v1/backoffice/shop/categories")
        or path.startswith("/api/v1/admin/products")
    ):
        return app.state.catalog, path.replace("/api/v1", "", 1)
    if settings.marketplace_url and (
        path.startswith("/api/v1/backoffice/shop/cart")
        or path.startswith("/api/v1/backoffice/shop/orders")
        or path.startswith("/api/v1/admin/orders")
    ):
        return app.state.marketplace, path.replace("/api/v1", "", 1)
    if settings.directory_url and (
        path.startswith("/api/v1/backoffice/artisans")
        or path.startswith("/api/v1/backoffice/artisan-trades")
        or path.startswith("/api/v1/backoffice/work-orders")
        or path.startswith("/api/v1/admin/shared-artisans")
    ):
        return app.state.directory, path.replace("/api/v1", "", 1)
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
    app.state.contract = _client_or_none(settings.contract_url)
    app.state.legal = _client_or_none(settings.legal_url)
    app.state.payment = _client_or_none(settings.payment_url)
    app.state.billing = _client_or_none(settings.billing_url)
    app.state.catalog = _client_or_none(settings.catalog_url)
    app.state.marketplace = _client_or_none(settings.marketplace_url)
    app.state.directory = _client_or_none(settings.directory_url)
    yield
    for client in (
        app.state.monolith, app.state.identity, app.state.search,
        app.state.analytics, app.state.contract, app.state.legal,
        app.state.payment, app.state.billing, app.state.catalog, app.state.marketplace,
        app.state.directory,
    ):
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
    app = request.app
    client, upstream_path = _resolve_upstream(app, request.url.path)
    url = upstream_path
    if request.url.query:
        url = f"{url}?{request.url.query}"
    # Filtrer : hop-by-hop + tout X-Semsar-* ENTRANT (anti-usurpation : seul le BFF les pose).
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP and not k.lower().startswith("x-semsar-")
    }
    # Frontière d'auth : pour un service interne, résoudre l'identité et l'injecter.
    if client is not app.state.monolith:
        ident = await _resolve_identity(app, request.headers.get("authorization"))
        if ident:
            _inject_identity(headers, ident)
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
