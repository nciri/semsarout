"""Dashboard backoffice — port fidèle de `backend/app/api/v1/backoffice/dashboard.py`.

Cloisonné par agence. `recent_leads`/`upcoming_visits` = dicts complets (Lead/Visit.to_dict) : on
retire les champs analytics-only ajoutés aux dumps (charge_amount ; agency_id/completed_at).
"""
from datetime import datetime, time, timedelta

from .compute import _pd

_LEAD_EXTRA = {"charge_amount"}
_VISIT_EXTRA = {"agency_id", "completed_at"}


def _strip(d: dict, extra: set) -> dict:
    return {k: v for k, v in d.items() if k not in extra}


def main(props, leads, clients, visits, txns) -> dict:
    now = datetime.utcnow()
    today = now.date()
    som = datetime(today.year, today.month, 1)
    sow = datetime.combine(today - timedelta(days=today.weekday()), time.min)
    lms = (som - timedelta(days=1)).replace(day=1)

    total_properties = len(props)
    active_properties = sum(1 for p in props if p["status"] == "active")
    draft_properties = sum(1 for p in props if p["status"] == "draft")
    sold_this_month = sum(1 for p in props if p["status"] == "sold"
                          and p["updated_at"] and _pd(p["updated_at"]) >= som)

    total_leads = len(leads)
    new_leads = sum(1 for l in leads if l["status"] == "new")
    leads_this_month = sum(1 for l in leads if l["created_at"] and _pd(l["created_at"]) >= som)
    leads_this_week = sum(1 for l in leads if l["created_at"] and _pd(l["created_at"]) >= sow)

    total_clients = len(clients)
    active_clients = sum(1 for c in clients if c["status"] == "active")
    new_clients_this_month = sum(1 for c in clients if c["created_at"] and _pd(c["created_at"]) >= som)

    visits_today = sum(1 for v in visits if v["scheduled_at"] and _pd(v["scheduled_at"]).date() == today)
    week_end = sow + timedelta(days=7)
    visits_this_week = sum(1 for v in visits if v["scheduled_at"]
                           and sow <= _pd(v["scheduled_at"]) < week_end)
    pending_visits = sum(1 for v in visits if v["status"] in ("scheduled", "confirmed"))

    active_transactions = sum(1 for t in txns if t["status"] == "active")
    won_this_month = sum(1 for t in txns if t["status"] == "won"
                         and t["closed_at"] and _pd(t["closed_at"]) >= som)
    revenue_this_month = sum(float(t["commission_amount"] or 0) for t in txns
                             if t["status"] == "won" and t["closed_at"] and _pd(t["closed_at"]) >= som)
    pipeline_value = sum(float(t["asking_price"]) * float(t["commission_rate"]) / 100
                         for t in txns if t["status"] == "active"
                         and t["asking_price"] is not None and t["commission_rate"] is not None)

    total_last_month = sum(1 for l in leads if l["created_at"] and lms <= _pd(l["created_at"]) < som)
    converted_last_month = sum(1 for l in leads if l["status"] == "converted"
                               and l["converted_at"] and lms <= _pd(l["converted_at"]) < som)
    conversion_rate = (converted_last_month / total_last_month * 100) if total_last_month > 0 else 0

    recent_leads = sorted([l for l in leads if l["created_at"]],
                          key=lambda l: l["created_at"], reverse=True)[:5]
    upcoming = sorted([v for v in visits if v["scheduled_at"] and _pd(v["scheduled_at"]) >= now],
                      key=lambda v: v["scheduled_at"])[:5]

    return {
        "properties": {"total": total_properties, "active": active_properties,
                       "draft": draft_properties, "sold_this_month": sold_this_month},
        "leads": {"total": total_leads, "new": new_leads, "this_month": leads_this_month,
                  "this_week": leads_this_week, "conversion_rate": round(conversion_rate, 1)},
        "clients": {"total": total_clients, "active": active_clients,
                    "new_this_month": new_clients_this_month},
        "visits": {"today": visits_today, "this_week": visits_this_week, "pending": pending_visits},
        "transactions": {"active": active_transactions, "won_this_month": won_this_month,
                         "pipeline_value": float(pipeline_value)},
        "revenue": {"this_month": float(revenue_this_month)},
        "recent_leads": [_strip(l, _LEAD_EXTRA) for l in recent_leads],
        "upcoming_visits": [_strip(v, _VISIT_EXTRA) for v in upcoming],
    }


def leads_by_source(leads, days: int) -> dict:
    start = datetime.utcnow() - timedelta(days=days)
    by_src: dict = {}
    for l in leads:
        if l["created_at"] and _pd(l["created_at"]) >= start:
            by_src[l["source"]] = by_src.get(l["source"], 0) + 1
    return {"data": [{"source": k, "count": v} for k, v in by_src.items()]}


def properties_by_status(props) -> dict:
    by_st: dict = {}
    for p in props:
        by_st[p["status"]] = by_st.get(p["status"], 0) + 1
    return {"data": [{"status": k, "count": v} for k, v in by_st.items()]}


def revenue_trend(txns) -> dict:
    now = datetime.utcnow()
    results = []
    for i in range(11, -1, -1):
        d = now - timedelta(days=i * 30)
        month_start = d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if d.month == 12:
            month_end = month_start.replace(year=d.year + 1, month=1)
        else:
            month_end = month_start.replace(month=d.month + 1)
        revenue = sum(float(t["commission_amount"] or 0) for t in txns
                      if t["status"] == "won" and t["closed_at"]
                      and month_start <= _pd(t["closed_at"]) < month_end)
        results.append({"month": month_start.strftime("%Y-%m"), "revenue": float(revenue)})
    return {"data": results}
