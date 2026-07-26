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
