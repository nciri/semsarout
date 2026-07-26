"""Service analytics — agrégats cross-domaine (query-time).

Reproduit `/analytics/ping`, `/analytics/financial`, `/analytics/pipeline` — cf.
`backend/app/api/v1/backoffice/analytics.py`. Ne duplique PAS les données : lit les lignes brutes
via les endpoints internes des services propriétaires (transactions, crm, identity) et agrège en
mémoire. Portée (agence entière vs agent) résolue par identity. Autres agrégats (market/team/
overview, stats/*, dashboard, charts) à venir.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from . import compute, sources
from .util import err

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def _scope(principal: Principal) -> dict | None:
    """(scope) pour l'agence de l'utilisateur, ou None si aucune agence — parité current_scope."""
    if principal.agency_id is None:
        return None
    return sources.scope(principal.agency_id, _uid(principal))


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/analytics/ping")
def analytics_ping(principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    # Parité : le scope du monolithe n'expose que {all, agent_id} (dashboard_config = interne overview).
    if scope is not None:
        scope = {"all": scope["all"], "agent_id": scope["agent_id"]}
    return {"ok": True, "scope": scope}


@app.get("/analytics/financial")
def analytics_financial(request: Request, principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    if scope is None:
        return err("Aucune agence", 400)
    rng = request.query_params.get("range", "12m")
    txns = sources.transactions(principal.agency_id)
    names = sources.agent_names(principal.agency_id)
    return compute.financial(txns, scope, rng, names)


@app.get("/analytics/pipeline")
def analytics_pipeline(request: Request, principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    if scope is None:
        return err("Aucune agence", 400)
    rng = request.query_params.get("range", "12m")
    txns = sources.transactions(principal.agency_id)
    leads = sources.leads(principal.agency_id)
    return compute.pipeline(txns, leads, scope, rng)


@app.get("/analytics/market")
def analytics_market(request: Request, principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    if scope is None:
        return err("Aucune agence", 400)
    props = sources.properties(principal.agency_id)
    refs = sources.neighborhood_refs()
    return compute.market(props, refs, scope)


@app.get("/analytics/team")
def analytics_team(request: Request, principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    if scope is None:
        return err("Aucune agence", 400)
    rng = request.query_params.get("range", "12m")
    aid = principal.agency_id
    return compute.team(sources.transactions(aid), sources.leads(aid), scope, rng, sources.agent_names(aid))


@app.get("/analytics/overview")
def analytics_overview(principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    if scope is None:
        return err("Aucune agence", 400)
    aid = principal.agency_id
    return compute.overview(sources.transactions(aid), sources.properties(aid), sources.leads(aid),
                            scope, sources.seats(aid), sources.subscription(aid),
                            scope.get("dashboard_config"))
