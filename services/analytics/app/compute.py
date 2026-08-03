"""Agrégats analytics — port fidèle de `backend/app/api/v1/backoffice/analytics.py`,
opérant sur les lignes brutes (dicts) récupérées des services propriétaires.
"""
from datetime import datetime, timedelta

STAGE_PROBABILITY = {
    "contact": 0.10, "visit": 0.40, "offer": 0.60, "negotiation": 0.70,
    "application": 0.40, "verification": 0.55, "compromise": 0.85,
    "lease": 0.85, "final_act": 0.95, "move_in": 0.95,
}


def range_start(range_str: str) -> datetime:
    now = datetime.utcnow()
    if range_str == "30d":
        return now - timedelta(days=30)
    if range_str == "90d":
        return now - timedelta(days=90)
    if range_str == "ytd":
        return datetime(now.year, 1, 1)
    return now - timedelta(days=365)  # 12m défaut


def _pd(s):
    return datetime.fromisoformat(s) if s else None


def _stage_probability(t: dict) -> float:
    if t["status"] == "won":
        return 1.0
    if t["status"] == "lost":
        return 0.0
    return STAGE_PROBABILITY.get(t["stage"], 0.2)


def _commission_estimate(t: dict) -> float:
    if t["commission_amount"]:
        return float(t["commission_amount"])
    if t["asking_price"] and t["commission_rate"]:
        return float(t["asking_price"]) * float(t["commission_rate"]) / 100.0
    return 0.0


def _scoped(txns: list[dict], scope: dict) -> list[dict]:
    if scope["all"]:
        return txns
    return [t for t in txns if t["agent_id"] == scope["agent_id"]]


def _mk(dt) -> str:
    return dt.strftime("%Y-%m")


def financial(txns: list[dict], scope: dict, rng: str, names: dict) -> dict:
    start = range_start(rng)
    base = _scoped(txns, scope)
    won = [t for t in base if t["status"] == "won" and t["closing_date"] and _pd(t["closing_date"]) >= start]
    lost = [t for t in base if t["status"] == "lost"
            and (t["closed_at"] or t["updated_at"]) and _pd(t["closed_at"] or t["updated_at"]) >= start]
    open_deals = [t for t in base if t["status"] == "active"]

    revenue_realized = sum(float(t["commission_amount"] or 0) for t in won)
    revenue_weighted = sum(_commission_estimate(t) * _stage_probability(t) for t in open_deals)
    final_prices = [float(t["final_price"]) for t in won if t["final_price"]]
    avg_deal = round(sum(final_prices) / len(final_prices), 2) if final_prices else 0
    cycles = [(_pd(t["closing_date"]) - _pd(t["contact_date"])).days
              for t in won if t["closing_date"] and t["contact_date"]]
    avg_cycle = round(sum(cycles) / len(cycles), 1) if cycles else 0

    months: dict = {}
    for t in won:
        if t["closing_date"]:
            k = _mk(_pd(t["closing_date"]))
            months[k] = months.get(k, 0.0) + float(t["commission_amount"] or 0)
    revenue_trend = [{"month": k, "realized": round(v, 2)} for k, v in sorted(months.items())]

    comm_by_agent: dict = {}
    for t in won:
        comm_by_agent[t["agent_id"]] = comm_by_agent.get(t["agent_id"], 0.0) + float(t["commission_amount"] or 0)
    agent_rows = [{"agent_id": aid, "agent": names.get(aid) or "—", "commission": round(amount, 2)}
                  for aid, amount in comm_by_agent.items()]
    agent_rows.sort(key=lambda r: r["commission"], reverse=True)

    win_loss: dict = {}
    for t in won:
        if t["closing_date"]:
            k = _mk(_pd(t["closing_date"]))
            win_loss.setdefault(k, {"won": 0, "lost": 0})["won"] += 1
    for t in lost:
        d = t["closed_at"] or t["updated_at"]
        if d:
            k = _mk(_pd(d))
            win_loss.setdefault(k, {"won": 0, "lost": 0})["lost"] += 1
    win_loss_by_month = [{"month": k, **v} for k, v in sorted(win_loss.items())]

    by_type: dict = {}
    for t in won:
        k = t["transaction_type"] or "autre"
        by_type[k] = by_type.get(k, 0.0) + float(t["commission_amount"] or 0)
    deals_by_type = [{"type": k, "commission": round(v, 2)} for k, v in by_type.items()]

    return {
        "summary": {
            "revenue_realized": round(revenue_realized, 2),
            "revenue_pipeline_weighted": round(revenue_weighted, 2),
            "deals_won": len(won), "deals_lost": len(lost),
            "avg_deal_size": avg_deal, "avg_sales_cycle_days": avg_cycle,
        },
        "detail": {
            "revenue_trend": revenue_trend, "commission_by_agent": agent_rows,
            "commission_by_month": revenue_trend, "win_loss_by_month": win_loss_by_month,
            "deals_by_type": deals_by_type,
        },
    }


def pipeline(txns: list[dict], leads: list[dict], scope: dict, rng: str) -> dict:
    start = range_start(rng)
    base = _scoped(txns, scope)

    lscoped = [l for l in leads if l["created_at"] and _pd(l["created_at"]) >= start
               and (scope["all"] or l["assigned_to_id"] == scope["agent_id"])]
    n_leads = len(lscoped)
    n_qualified = sum(1 for l in lscoped if l["qualified_at"])

    open_txn = [t for t in base if t["status"] == "active"]
    won_txn = [t for t in base if t["status"] == "won" and t["closing_date"] and _pd(t["closing_date"]) >= start]
    txn_pool = open_txn + won_txn
    reached_visit = sum(1 for t in txn_pool
                        if t["visit_date"] or t["offer_date"] or t["closing_date"] or t["status"] == "won")
    reached_offer = sum(1 for t in txn_pool if t["offer_date"] or t["closing_date"] or t["status"] == "won")
    closed = len(won_txn)

    n_qualified = min(n_qualified, n_leads)
    n_visits = min(reached_visit, n_qualified)
    n_offers = min(reached_offer, n_visits)
    n_closed = min(closed, n_offers)

    conversion = min(100.0, round(n_closed / n_leads * 100, 1)) if n_leads else 0
    pipeline_value_open = round(sum(_commission_estimate(t) for t in open_txn), 2)

    now = datetime.utcnow()
    soon = now + timedelta(days=30)
    exp = [t for t in open_txn if t["expected_closing_date"] and now <= _pd(t["expected_closing_date"]) <= soon]
    expected_30d = {"count": len(exp), "value": round(sum(_commission_estimate(t) for t in exp), 2)}

    funnel = {"leads": n_leads, "qualified": n_qualified, "visits": n_visits,
              "offers": n_offers, "closed": n_closed}
    funnel_stages = [{"stage": k, "count": v} for k, v in
                     [("Leads", n_leads), ("Qualifiés", n_qualified), ("Visites", n_visits),
                      ("Offres", n_offers), ("Clôturés", n_closed)]]

    def conv(a, b):
        return min(100.0, round(b / a * 100, 1)) if a else 0
    conversion_by_stage = [
        {"from": "Leads→Qualifiés", "pct": conv(n_leads, n_qualified)},
        {"from": "Qualifiés→Visites", "pct": conv(n_qualified, n_visits)},
        {"from": "Visites→Offres", "pct": conv(n_visits, n_offers)},
        {"from": "Offres→Clôturés", "pct": conv(n_offers, n_closed)},
    ]

    def avg_days(pairs):
        vals = [(b - a).days for a, b in pairs if a and b and (b - a).days >= 0]
        return round(sum(vals) / len(vals), 1) if vals else 0
    stage_velocity_days = [
        {"stage": "Contact→Visite", "days": avg_days([(_pd(t["contact_date"]), _pd(t["visit_date"])) for t in won_txn])},
        {"stage": "Visite→Offre", "days": avg_days([(_pd(t["visit_date"]), _pd(t["offer_date"])) for t in won_txn])},
        {"stage": "Offre→Clôture", "days": avg_days([(_pd(t["offer_date"]), _pd(t["closing_date"])) for t in won_txn])},
    ]

    tl: dict = {}
    for t in exp:
        k = _pd(t["expected_closing_date"]).strftime("%Y-%m-%d")
        tl[k] = tl.get(k, 0.0) + _commission_estimate(t)
    expected_closings_timeline = [{"date": k, "value": round(v, 2)} for k, v in sorted(tl.items())]

    return {
        "summary": {"funnel": funnel, "conversion_overall_pct": conversion,
                    "expected_closings_30d": expected_30d, "pipeline_value_open": pipeline_value_open},
        "detail": {"funnel_stages": funnel_stages, "conversion_by_stage": conversion_by_stage,
                   "stage_velocity_days": stage_velocity_days,
                   "expected_closings_timeline": expected_closings_timeline},
    }


WIDGET_IDS = ["financial", "pipeline", "hot_leads", "listings", "market", "team_seats",
              "subscription", "alerts"]
DEFAULT_WIDGETS = [{"id": wid, "order": i, "hidden": False} for i, wid in enumerate(WIDGET_IDS)]
LEAD_OVERDUE_DAYS = 3


def _prop_scoped(props: list[dict], scope: dict) -> list[dict]:
    if scope["all"]:
        return props
    return [p for p in props if p["owner_id"] == scope["agent_id"]]


def market(props: list[dict], refs: list[dict], scope: dict) -> dict:
    scoped = _prop_scoped(props, scope)
    ref_map = {(r["city"], r["neighborhood"]): r["avg_price_sqm"] for r in refs}
    active = [p for p in scoped if p["status"] == "active"]
    sold = [p for p in scoped if p["status"] in ("sold", "rented")]

    ppsqm = [float(p["price_per_sqm"]) for p in active if p["price_per_sqm"]]
    portfolio_avg = round(sum(ppsqm) / len(ppsqm), 2) if ppsqm else 0

    market_vals = []
    for p in active:
        av = ref_map.get((p["city"], p["neighborhood"]))
        if av:
            market_vals.append(float(av))
    market_avg = round(sum(market_vals) / len(market_vals), 2) if market_vals else 0
    price_gap = round((portfolio_avg - market_avg) / market_avg * 100, 1) if market_avg else 0

    now = datetime.utcnow()
    doms = [(now - _pd(p["published_at"] or p["created_at"])).days
            for p in active if (p["published_at"] or p["created_at"])]
    avg_dom = round(sum(doms) / len(doms), 1) if doms else 0
    absorption = round(len(sold) / (len(sold) + len(active)), 3) if (len(sold) + len(active)) else 0

    by_nb: dict = {}
    for p in active:
        key = f"{p['city']} · {p['neighborhood'] or '—'}"
        by_nb.setdefault(key, {"portfolio": [], "market": None})
        if p["price_per_sqm"]:
            by_nb[key]["portfolio"].append(float(p["price_per_sqm"]))
        av = ref_map.get((p["city"], p["neighborhood"]))
        if (p["city"], p["neighborhood"]) in ref_map:
            by_nb[key]["market"] = float(av) if av is not None else None
    price_sqm_by_neighborhood = [
        {"area": k, "portfolio": round(sum(v["portfolio"]) / len(v["portfolio"]), 2) if v["portfolio"] else 0,
         "market": v["market"] or 0}
        for k, v in by_nb.items()
    ]

    buckets = {"0-30j": 0, "31-60j": 0, "61-90j": 0, "90j+": 0}
    for d in doms:
        if d <= 30:
            buckets["0-30j"] += 1
        elif d <= 60:
            buckets["31-60j"] += 1
        elif d <= 90:
            buckets["61-90j"] += 1
        else:
            buckets["90j+"] += 1
    days_on_market_distribution = [{"bucket": k, "count": v} for k, v in buckets.items()]

    val_by_city: dict = {}
    for p in active:
        val_by_city[p["city"]] = val_by_city.get(p["city"], 0.0) + float(p["price"] or 0)
    portfolio_valuation_by_city = [{"city": k, "value": round(v, 2)} for k, v in val_by_city.items()]

    status_counts: dict = {}
    for p in scoped:
        status_counts[p["status"]] = status_counts.get(p["status"], 0) + 1
    inventory_by_status = [{"status": k, "count": v} for k, v in status_counts.items()]

    return {
        "summary": {"portfolio_avg_price_sqm": portfolio_avg, "market_avg_price_sqm": market_avg,
                    "price_gap_pct": price_gap, "avg_days_on_market": avg_dom, "absorption_rate": absorption},
        "detail": {"price_sqm_by_neighborhood": price_sqm_by_neighborhood,
                   "days_on_market_distribution": days_on_market_distribution,
                   "portfolio_valuation_by_city": portfolio_valuation_by_city,
                   "inventory_by_status": inventory_by_status},
    }


def _leads_scoped(leads: list[dict], scope: dict, since: datetime | None) -> list[dict]:
    out = []
    for l in leads:
        if not scope["all"] and l["assigned_to_id"] != scope["agent_id"]:
            continue
        if since is not None and not (l["created_at"] and _pd(l["created_at"]) >= since):
            continue
        out.append(l)
    return out


def team(txns: list[dict], leads: list[dict], scope: dict, rng: str, names: dict) -> dict:
    start = range_start(rng)
    txs = [t for t in _scoped(txns, scope) if t["created_at"] and _pd(t["created_at"]) >= start]
    lscoped = _leads_scoped(leads, scope, start)

    agents: dict = {}
    for t in txs:
        a = agents.setdefault(t["agent_id"], {"deals": 0, "won": 0, "commission": 0.0})
        a["deals"] += 1
        if t["status"] == "won":
            a["won"] += 1
            a["commission"] += float(t["commission_amount"] or 0)
    agent_performance = []
    for aid, d in agents.items():
        agent_performance.append({
            "agent_id": aid, "agent": names.get(aid) or "—", "deals": d["deals"], "won": d["won"],
            "commission": round(d["commission"], 2),
            "conversion_pct": round(d["won"] / d["deals"] * 100, 1) if d["deals"] else 0,
        })
    agent_performance.sort(key=lambda r: r["commission"], reverse=True)
    top_agents = agent_performance[:5]

    sources_map: dict = {}
    for l in lscoped:
        s = sources_map.setdefault(l["source"] or "inconnu", {"leads": 0, "converted": 0, "cost": 0.0})
        s["leads"] += 1
        if l["converted_at"]:
            s["converted"] += 1
        if l["is_charged"] and l["charge_amount"]:
            s["cost"] += float(l["charge_amount"])
    lead_roi_by_source = [
        {"source": k, "leads": v["leads"], "converted": v["converted"], "cost": round(v["cost"], 2),
         "conversion_pct": round(v["converted"] / v["leads"] * 100, 1) if v["leads"] else 0}
        for k, v in sources_map.items()
    ]
    total_leads = len(lscoped)
    total_cost = sum(v["cost"] for v in sources_map.values())
    cost_per_lead = round(total_cost / total_leads, 2) if total_leads else 0
    best_source = max(lead_roi_by_source, key=lambda r: r["conversion_pct"], default={}).get("source")

    conversion_by_source = [{"source": r["source"], "pct": r["conversion_pct"]} for r in lead_roi_by_source]
    svc: dict = {}
    for l in lscoped:
        s = svc.setdefault(l["service"] or "autre", {"leads": 0, "converted": 0})
        s["leads"] += 1
        if l["converted_at"]:
            s["converted"] += 1
    conversion_by_service = [
        {"service": k, "pct": round(v["converted"] / v["leads"] * 100, 1) if v["leads"] else 0}
        for k, v in svc.items()
    ]

    return {
        "summary": {"top_agents": top_agents,
                    "lead_sources": [{"source": r["source"], "leads": r["leads"]} for r in lead_roi_by_source],
                    "cost_per_lead": cost_per_lead, "best_source": best_source},
        "detail": {"agent_performance": agent_performance, "lead_roi_by_source": lead_roi_by_source,
                   "conversion_by_source": conversion_by_source, "conversion_by_service": conversion_by_service},
    }


def _financial_summary(txns: list[dict], scope: dict) -> dict:
    start = range_start("12m")
    base = _scoped(txns, scope)
    won = [t for t in base if t["status"] == "won" and t["closing_date"] and _pd(t["closing_date"]) >= start]
    open_deals = [t for t in base if t["status"] == "active"]
    return {
        "revenue_realized": round(sum(float(t["commission_amount"] or 0) for t in won), 2),
        "revenue_pipeline_weighted": round(sum(_commission_estimate(t) * _stage_probability(t) for t in open_deals), 2),
        "deals_won": len(won),
    }


def overview(txns, props, leads, scope, seats, sub, config) -> dict:
    fin = _financial_summary(txns, scope)
    base = _scoped(txns, scope)
    open_txn = [t for t in base if t["status"] == "active"]
    pipeline = {"open_deals": len(open_txn),
                "pipeline_value_open": round(sum(_commission_estimate(t) for t in open_txn), 2)}

    scoped_props = _prop_scoped(props, scope)
    active_props = [p for p in scoped_props if p["status"] == "active"]
    listings = {"active": len(active_props), "views": sum(int(p["views_count"] or 0) for p in active_props)}

    lscoped = _leads_scoped(leads, scope, None)
    now = datetime.utcnow()
    overdue_cutoff = now - timedelta(days=LEAD_OVERDUE_DAYS)
    unread = sum(1 for l in lscoped if not l["is_read"])
    overdue = sum(1 for l in lscoped if not l["is_read"] and l["created_at"] and _pd(l["created_at"]) < overdue_cutoff)
    hot_leads = {"unread": unread, "overdue": overdue}

    ppsqm = [float(p["price_per_sqm"]) for p in active_props if p["price_per_sqm"]]
    doms = [(now - _pd(p["published_at"] or p["created_at"])).days
            for p in active_props if (p["published_at"] or p["created_at"])]
    market_c = {"portfolio_avg_price_sqm": round(sum(ppsqm) / len(ppsqm), 2) if ppsqm else 0,
                "avg_days_on_market": round(sum(doms) / len(doms), 1) if doms else 0}

    team_c = {"members": seats.get("member_count", 0)}
    seats_c = {"used": seats.get("seats_used", 0), "limit": seats.get("seats_limit", 0)}
    subscription = {"plan": sub["plan"], "status": sub["status"]} if sub else None

    alerts = []
    if overdue:
        alerts.append({"level": "warning", "text": f"{overdue} lead(s) en retard"})
    soon = now + timedelta(days=7)
    closing_soon = [t for t in open_txn if t["expected_closing_date"] and now <= _pd(t["expected_closing_date"]) <= soon]
    if closing_soon:
        alerts.append({"level": "info", "text": f"{len(closing_soon)} deal(s) à clôturer cette semaine"})
    if seats_c["limit"] not in (-1, 0) and seats_c["used"] >= seats_c["limit"]:
        alerts.append({"level": "warning", "text": "Sièges épuisés — pensez à upgrader"})

    return {
        "financial": fin, "market": market_c, "pipeline": pipeline, "team": team_c,
        "listings": listings, "hot_leads": hot_leads, "seats": seats_c,
        "subscription": subscription, "alerts": alerts,
        "config": config or {"widgets": DEFAULT_WIDGETS},
    }
