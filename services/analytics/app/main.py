"""Service analytics — agrégats cross-domaine (query-time).

Reproduit `/analytics/ping`, `/analytics/financial`, `/analytics/pipeline` — cf.
`backend/app/api/v1/backoffice/analytics.py`. Ne duplique PAS les données : lit les lignes brutes
via les endpoints internes des services propriétaires (transactions, crm, identity) et agrège en
mémoire. Portée (agence entière vs agent) résolue par identity. Autres agrégats (market/team/
overview, stats/*, dashboard, charts) à venir.
"""
from contextlib import asynccontextmanager

from datetime import datetime

from fastapi import Depends, FastAPI, Request, Response
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from . import compute, dashboard, sources, stats
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


@app.get("/admin/overview")
def admin_overview(principal: Principal = Depends(get_principal)):
    """Overview plateforme super-admin (parité `admin/overview.py`) : agrège les compteurs des
    services propriétaires (identity=users, agency=agences, billing=abonnements). Query-time."""
    if not principal.is_superadmin:
        return err("Super-admin access required", 403)
    us = sources.users_stats()
    ag = sources.agencies_stats()
    sub = sources.subscriptions_stats()
    return {
        "total_users": us.get("total_users", 0),
        "total_agencies": ag.get("total_agencies", 0),
        "active_subscriptions": sub.get("active_subscriptions", {}),
        "mrr_estimate": sub.get("mrr_estimate", 0.0),
        "signups_last_30d": us.get("signups_last_30d", 0),
        "suspended_count": us.get("suspended_users", 0) + ag.get("suspended_agencies", 0),
        "deleted_pending_purge_count": (us.get("deleted_pending_users", 0)
                                        + ag.get("deleted_pending_agencies", 0)),
    }


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


# ---- Stats (cloisonné par agence, sans scope agent) ----
def _days(request: Request) -> int:
    try:
        return int(request.query_params.get("period", "30"))
    except ValueError:
        return 30


@app.get("/stats/overview")
def stats_overview(request: Request, principal: Principal = Depends(get_principal)):
    aid = principal.agency_id
    return stats.overview(sources.properties(aid), sources.leads(aid), sources.clients(aid),
                          sources.visits(aid), _days(request))


@app.get("/stats/agent-performance")
def stats_agent_performance(request: Request, principal: Principal = Depends(get_principal)):
    aid = principal.agency_id
    return stats.agent_performance(sources.members(aid), sources.properties(aid), sources.visits(aid),
                                   sources.transactions(aid), sources.clients(aid), _days(request))


@app.get("/stats/conversion-funnel")
def stats_conversion_funnel(request: Request, principal: Principal = Depends(get_principal)):
    aid = principal.agency_id
    return stats.conversion_funnel(sources.leads(aid), sources.visits(aid),
                                   sources.transactions(aid), _days(request))


@app.get("/stats/properties-by-city")
def stats_properties_by_city(principal: Principal = Depends(get_principal)):
    return stats.properties_by_city(sources.properties(principal.agency_id))


@app.get("/stats/price-distribution")
def stats_price_distribution(request: Request, principal: Principal = Depends(get_principal)):
    ttype = request.query_params.get("type", "sale")
    return stats.price_distribution(sources.properties(principal.agency_id), ttype)


@app.get("/stats/export")
def stats_export(request: Request, principal: Principal = Depends(get_principal)):
    aid = principal.agency_id
    etype = request.query_params.get("type", "properties")
    body = stats.export_csv(etype, sources.properties(aid), sources.clients(aid),
                            sources.transactions(aid), sources.agent_names(aid))
    fname = f"{etype}_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return Response(content=body, media_type="text/csv",
                    headers={"content-disposition": f"attachment; filename={fname}"})


# ---- Dashboard (KPIs + charts + activity), cloisonné par agence ----
@app.get("/dashboard")
def dashboard_summary(principal: Principal = Depends(get_principal)):
    aid = principal.agency_id
    return dashboard.main(sources.properties(aid), sources.leads(aid), sources.clients(aid),
                          sources.visits(aid), sources.transactions(aid))


@app.get("/dashboard/charts/leads-by-source")
def dashboard_leads_by_source(request: Request, principal: Principal = Depends(get_principal)):
    try:
        days = int(request.query_params.get("days", "30"))
    except ValueError:
        days = 30
    return dashboard.leads_by_source(sources.leads(principal.agency_id), days)


@app.get("/dashboard/charts/properties-by-status")
def dashboard_properties_by_status(principal: Principal = Depends(get_principal)):
    return dashboard.properties_by_status(sources.properties(principal.agency_id))


@app.get("/dashboard/charts/revenue-trend")
def dashboard_revenue_trend(principal: Principal = Depends(get_principal)):
    return dashboard.revenue_trend(sources.transactions(principal.agency_id))


@app.get("/dashboard/activity")
def dashboard_activity(request: Request, principal: Principal = Depends(get_principal)):
    qp = request.query_params
    return sources.activity(principal.agency_id, int(qp.get("page") or 1), int(qp.get("per_page") or 20))
