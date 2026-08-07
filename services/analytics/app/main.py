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


# --- Filtres d'analyse (agent / type de transaction / ville), appliqués aux lignes
# sources avant compute pour recalculer KPIs ET graphiques. Chaque filtre ne s'applique
# qu'aux entités qui le portent (ville → biens uniquement).
def _filters(request: Request) -> tuple[int | None, str | None, str | None]:
    agent = request.query_params.get("agent")
    aid = int(agent) if agent and agent.isdigit() else None
    ttype = request.query_params.get("type")
    ttype = ttype if ttype in ("sale", "rent") else None
    city = request.query_params.get("city") or None
    return aid, ttype, city


def _filter_txns(txns: list[dict], aid: int | None, ttype: str | None) -> list[dict]:
    if aid is not None:
        txns = [t for t in txns if t.get("agent_id") == aid]
    if ttype:
        txns = [t for t in txns if t.get("transaction_type") == ttype]
    return txns


def _filter_leads(leads: list[dict], aid: int | None) -> list[dict]:
    if aid is not None:
        leads = [x for x in leads if x.get("assigned_to_id") == aid]
    return leads


def _filter_props(props: list[dict], aid: int | None, ttype: str | None, city: str | None) -> list[dict]:
    if aid is not None:
        props = [p for p in props if p.get("owner_id") == aid]
    if ttype:
        props = [p for p in props if p.get("transaction_type") == ttype]
    if city:
        props = [p for p in props if p.get("city") == city]
    return props


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


@app.get("/admin/accounts")
def admin_accounts(request: Request, principal: Principal = Depends(get_principal)):
    """Liste unifiée users+agences (super-admin, parité `admin/accounts.py:list_accounts`).
    Agrège identity (users) + agency (agences) + billing (plan) + listing (nb biens).

    `tenant` optionnel (ex. `m3a-l3achrane`) : filtre les users côté identity — utilisé par le
    back-office m3a (vue Utilisateurs, cloisonnée tenant). Absent → comportement historique
    (tous tenants), pour ne pas casser la console super-admin semsarout existante."""
    if not principal.is_superadmin:
        return err("Super-admin access required", 403)
    qp = request.query_params
    kind = qp.get("type"); status = qp.get("status"); q = (qp.get("q") or "").strip().lower()
    tenant = qp.get("tenant")
    page = int(qp.get("page") or 1); per_page = int(qp.get("per_page") or 20)
    counts = sources.property_counts()
    by_owner = counts.get("by_owner", {}); by_agency = counts.get("by_agency", {})
    rows = []
    if kind in (None, "user"):
        for u in sources.users_list(tenant):
            if q and q not in (u["name"] or "").lower() and q not in (u["email"] or "").lower():
                continue
            rows.append({"kind": "user", "id": u["id"], "name": u["name"], "email": u["email"],
                         "status": u["status"], "plan": None, "last_login": u["last_login"],
                         "tenant": u.get("tenant"), "account_role": u.get("account_role"),
                         "user_type": u.get("user_type"), "is_verified": u.get("is_verified"),
                         "created_at": u.get("created_at"),
                         "listings_count": by_owner.get(str(u["id"]), 0)})
    if kind in (None, "agency"):
        subs = sources.subscriptions_map()
        for a in sources.agencies_list():
            if q and q not in (a["name"] or "").lower():
                continue
            sub = subs.get(str(a["id"]))
            plan = (sub or {}).get("plan")
            rows.append({"kind": "agency", "id": a["id"], "name": a["name"], "email": a["email"],
                         "status": a["status"], "plan": plan.get("slug") if plan else None,
                         "last_login": None, "listings_count": by_agency.get(str(a["id"]), 0)})
    if status:
        rows = [r for r in rows if r["status"] == status]
    if qp.get("plan"):
        rows = [r for r in rows if r["plan"] == qp.get("plan")]
    rows.sort(key=lambda r: (r["name"] or "").lower())
    total = len(rows)
    items = rows[(page - 1) * per_page:(page - 1) * per_page + per_page]
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"items": items, "total": total, "page": page, "pages": pages}


@app.get("/admin/accounts/users/{user_id}")
def admin_account_user(user_id: int, principal: Principal = Depends(get_principal)):
    if not principal.is_superadmin:
        return err("Super-admin access required", 403)
    ud = sources.user_detail(user_id)
    if ud.get("user") is None:
        return err("User not found", 404)
    agency_id = ud.get("agency_id")
    agency = sources.agency_detail(agency_id).get("agency") if agency_id else None
    return {
        "user": ud["user"], "agency": agency,
        "listings_count": sources.property_counts().get("by_owner", {}).get(str(user_id), 0),
        "activity": sources.entity_activity("user", user_id),
    }


@app.get("/admin/accounts/agencies/{agency_id}")
def admin_account_agency(agency_id: int, principal: Principal = Depends(get_principal)):
    if not principal.is_superadmin:
        return err("Super-admin access required", 403)
    ad = sources.agency_detail(agency_id)
    if ad.get("agency") is None:
        return err("Agency not found", 404)
    return {
        "agency": ad["agency"], "members": sources.members(agency_id),
        "subscription": sources.subscriptions_map().get(str(agency_id)),
        "listings_count": sources.property_counts().get("by_agency", {}).get(str(agency_id), 0),
        "activity": sources.entity_activity("agency", agency_id),
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
    aid, ttype, _ = _filters(request)
    txns = _filter_txns(sources.transactions(principal.agency_id), aid, ttype)
    names = sources.agent_names(principal.agency_id)
    return compute.financial(txns, scope, rng, names)


@app.get("/analytics/pipeline")
def analytics_pipeline(request: Request, principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    if scope is None:
        return err("Aucune agence", 400)
    rng = request.query_params.get("range", "12m")
    aid, ttype, _ = _filters(request)
    txns = _filter_txns(sources.transactions(principal.agency_id), aid, ttype)
    leads = _filter_leads(sources.leads(principal.agency_id), aid)
    return compute.pipeline(txns, leads, scope, rng)


@app.get("/analytics/market")
def analytics_market(request: Request, principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    if scope is None:
        return err("Aucune agence", 400)
    aid, ttype, city = _filters(request)
    props = _filter_props(sources.properties(principal.agency_id), aid, ttype, city)
    refs = sources.neighborhood_refs()
    return compute.market(props, refs, scope)


@app.get("/analytics/team")
def analytics_team(request: Request, principal: Principal = Depends(get_principal)):
    scope = _scope(principal)
    if scope is None:
        return err("Aucune agence", 400)
    rng = request.query_params.get("range", "12m")
    agency_id = principal.agency_id
    aid, ttype, _ = _filters(request)
    txns = _filter_txns(sources.transactions(agency_id), aid, ttype)
    leads = _filter_leads(sources.leads(agency_id), aid)
    return compute.team(txns, leads, scope, rng, sources.agent_names(agency_id))


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
