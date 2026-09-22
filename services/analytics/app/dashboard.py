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
    # Badge « visites à venir » du back-office : ni `pending` (qui compte aussi les visites
    # passées restées au statut planifié) ni `upcoming_visits` (tronqué à 5) ne donnent ce total.
    upcoming_visits = sum(1 for v in visits if v["scheduled_at"] and _pd(v["scheduled_at"]) >= now
                          and v["status"] in ("scheduled", "confirmed"))

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
        "visits": {"today": visits_today, "this_week": visits_this_week, "pending": pending_visits,
                   "upcoming": upcoming_visits},
        "transactions": {"active": active_transactions, "won_this_month": won_this_month,
                         "pipeline_value": float(pipeline_value)},
        "revenue": {"this_month": float(revenue_this_month)},
        "recent_leads": [_strip(l, _LEAD_EXTRA) for l in recent_leads],
        "upcoming_visits": [_strip(v, _VISIT_EXTRA) for v in upcoming],
        # Blocs du tableau de bord « à traiter » : chaque widget a une version compacte et une
        # vue détaillée, toutes deux servies par ce seul appel.
        "widgets": {
            "new_leads": _new_leads(leads),
            "leads_weekly": _leads_weekly(leads, sow),
            "upcoming_visits": _upcoming_visits(visits, now),
            "recent_visit_outcomes": _recent_visit_outcomes(visits, now),
            "pipeline": _pipeline(txns),
            "closed": _closed(txns, now),
            "listings": _listings(props),
        },
    }


# Ordre des étapes de chaque pipeline. Vente et location ne partagent ni leurs étapes ni leur
# unité (prix de vente contre loyer mensuel) : elles ne sont jamais agrégées ensemble.
_STAGES = {
    "sale": ("contact", "visit", "offer", "negotiation", "compromise", "final_act"),
    "rent": ("contact", "visit", "application", "verification", "move_in"),
}
_SOURCES = ("phone_reveal", "callback_request", "contact_form", "website")
_LEAD_STATUSES = ("new", "contacted", "qualified", "converted", "lost")


def _amount(t: dict) -> float:
    for k in ("final_price", "offer_price", "asking_price"):
        if t.get(k) is not None:
            return float(t[k])
    return 0.0


def _new_leads(leads) -> list[dict]:
    """Leads jamais traités, du plus ancien au plus récent : l'ancienneté est l'urgence."""
    rows = [l for l in leads if l["status"] == "new" and l["created_at"]]
    rows.sort(key=lambda l: l["created_at"])
    return [{"id": l.get("id"), "name": l.get("name"), "source": l.get("source"),
             "created_at": l["created_at"], "property_id": l.get("property_id"),
             "property_title": l.get("property_title")} for l in rows]


def _leads_weekly(leads, sow: datetime, weeks: int = 13) -> list[dict]:
    """Leads reçus par semaine (lundi), par source et par statut actuel, semaine en cours incluse."""
    starts = [sow - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]
    out = [{"week": w.date().isoformat(), "by_source": dict.fromkeys(_SOURCES, 0),
            "by_status": dict.fromkeys(_LEAD_STATUSES, 0)} for w in starts]
    for l in leads:
        if not l["created_at"]:
            continue
        d = _pd(l["created_at"])
        i = (d - starts[0]).days // 7
        if 0 <= i < weeks:
            if l.get("source") in out[i]["by_source"]:
                out[i]["by_source"][l["source"]] += 1
            if l.get("status") in out[i]["by_status"]:
                out[i]["by_status"][l["status"]] += 1
    return out


def _upcoming_visits(visits, now: datetime, limit: int = 60) -> list[dict]:
    rows = [v for v in visits if v["scheduled_at"] and _pd(v["scheduled_at"]) >= now
            and v["status"] in ("scheduled", "confirmed")]
    rows.sort(key=lambda v: v["scheduled_at"])
    return [{"id": v.get("id"), "scheduled_at": v["scheduled_at"], "status": v["status"],
             "contact_name": v.get("contact_name"), "property_id": v.get("property_id"),
             "property_title": v.get("property_title")} for v in rows[:limit]]


def _recent_visit_outcomes(visits, now: datetime, days: int = 15) -> dict:
    """Issue des visites des `days` derniers jours : le taux de présence se lit là."""
    start = now - timedelta(days=days)
    out = {"days": days, "completed": 0, "cancelled": 0, "no_show": 0, "total": 0}
    for v in visits:
        if v["scheduled_at"] and start <= _pd(v["scheduled_at"]) < now:
            out["total"] += 1
            if v["status"] in out:
                out[v["status"]] += 1
    return out


def _pipeline(txns) -> dict:
    """Dossiers en cours par étape : nombre, montant et montant pondéré par la probabilité."""
    out = {}
    for ttype, stages in _STAGES.items():
        rows = {s: {"stage": s, "count": 0, "amount": 0.0, "weighted": 0.0} for s in stages}
        for t in txns:
            if t["status"] == "active" and t.get("transaction_type") == ttype and t.get("stage") in rows:
                r, a = rows[t["stage"]], _amount(t)
                r["count"] += 1
                r["amount"] += a
                r["weighted"] += a * float(t.get("probability") or 0) / 100
        out[ttype] = list(rows.values())
    return out


def _closed(txns, now: datetime, days: int = 90) -> list[dict]:
    start = now - timedelta(days=days)
    rows = []
    for t in txns:
        if t["status"] not in ("won", "lost"):
            continue
        when = t.get("closed_at") or t.get("updated_at")
        if when and _pd(when) >= start:
            rows.append({"date": when, "type": t.get("transaction_type"), "status": t["status"],
                         "stage": t.get("stage"), "amount": _amount(t),
                         "lost_reason": t.get("lost_reason")})
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows


def _listings(props) -> dict:
    by_status: dict = {}
    for p in props:
        by_status[p["status"]] = by_status.get(p["status"], 0) + 1
    active = [{"id": p["id"], "title": p.get("title"), "city": p.get("city"),
               "transaction_type": p.get("transaction_type"),
               "price": float(p["price"]) if p.get("price") is not None else None,
               "views": p.get("views_count") or 0, "contacts": p.get("contacts_count") or 0}
              for p in props if p["status"] == "active"]
    return {"by_status": by_status, "active": active}


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
