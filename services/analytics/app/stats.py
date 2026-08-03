"""Stats backoffice — port fidèle de `backend/app/api/v1/backoffice/stats.py`.

Cloisonné par **agence** uniquement (pas de scope agent). Opère sur les lignes brutes des dumps.
"""
import csv
from datetime import datetime, timedelta
from io import StringIO

from .compute import _pd


def _since(days: int, rows: list[dict], field: str = "created_at") -> int:
    start = datetime.utcnow() - timedelta(days=days)
    return sum(1 for r in rows if r[field] and _pd(r[field]) >= start)


def _between(days: int, rows: list[dict], lo: datetime, hi: datetime, field: str = "created_at") -> int:
    return sum(1 for r in rows if r[field] and lo <= _pd(r[field]) < hi)


def _change(cur: int, prev: int):
    if prev == 0:
        return 100 if cur > 0 else 0
    return round((cur - prev) / prev * 100, 1)


def overview(props, leads, clients, visits, days: int) -> dict:
    now = datetime.utcnow()
    start = now - timedelta(days=days)
    prev = start - timedelta(days=days)

    def block(rows):
        cur = sum(1 for r in rows if r["created_at"] and _pd(r["created_at"]) >= start)
        pre = sum(1 for r in rows if r["created_at"] and prev <= _pd(r["created_at"]) < start)
        return {"count": cur, "change": _change(cur, pre)}

    return {"period_days": days, "properties": block(props), "leads": block(leads),
            "clients": block(clients), "visits": block(visits)}


def agent_performance(members, props, visits, txns, clients, days: int) -> dict:
    start = datetime.utcnow() - timedelta(days=days)
    agents = [m for m in members if m.get("user_type") == "professional"]
    perf = []
    for a in agents:
        aid = a["id"]
        properties_created = sum(1 for p in props if p["owner_id"] == aid
                                 and p["created_at"] and _pd(p["created_at"]) >= start)
        visits_completed = sum(1 for v in visits if v["agent_id"] == aid and v["status"] == "completed"
                               and v["completed_at"] and _pd(v["completed_at"]) >= start)
        won = [t for t in txns if t["agent_id"] == aid and t["status"] == "won"
               and t["closed_at"] and _pd(t["closed_at"]) >= start]
        commission = sum(float(t["commission_amount"] or 0) for t in won)
        active_clients = sum(1 for c in clients if c["assigned_to_id"] == aid and c["status"] == "active")
        perf.append({
            "agent_id": aid, "agent_name": a.get("full_name"), "avatar_url": a.get("avatar_url"),
            "properties_created": properties_created, "visits_completed": visits_completed,
            "transactions_won": len(won), "commission_earned": float(commission),
            "active_clients": active_clients,
        })
    perf.sort(key=lambda x: x["transactions_won"], reverse=True)
    return {"agents": perf}


def conversion_funnel(leads, visits, txns, days: int) -> dict:
    start = datetime.utcnow() - timedelta(days=days)
    ls = [l for l in leads if l["created_at"] and _pd(l["created_at"]) >= start]
    total_leads = len(ls)
    contacted = sum(1 for l in ls if l["status"] in ("contacted", "qualified", "converted"))
    qualified = sum(1 for l in ls if l["status"] in ("qualified", "converted"))
    converted = sum(1 for l in ls if l["status"] == "converted")

    vs = [v for v in visits if v["created_at"] and _pd(v["created_at"]) >= start]
    total_visits = len(vs)
    completed_visits = sum(1 for v in vs if v["status"] == "completed")

    ts = [t for t in txns if t["created_at"] and _pd(t["created_at"]) >= start]
    total_tx = len(ts)
    won_tx = sum(1 for t in ts if t["status"] == "won")

    return {
        "funnel": [{"stage": "Leads", "count": total_leads},
                   {"stage": "Contactés", "count": contacted},
                   {"stage": "Qualifiés", "count": qualified},
                   {"stage": "Convertis", "count": converted}],
        "visits": {"total": total_visits, "completed": completed_visits,
                   "rate": round(completed_visits / total_visits * 100, 1) if total_visits > 0 else 0},
        "transactions": {"total": total_tx, "won": won_tx,
                         "rate": round(won_tx / total_tx * 100, 1) if total_tx > 0 else 0},
    }


def properties_by_city(props) -> dict:
    active = [p for p in props if p["status"] == "active"]
    by_city: dict = {}
    for p in active:
        c = by_city.setdefault(p["city"], {"count": 0, "prices": []})
        c["count"] += 1
        if p["price"] is not None:
            c["prices"].append(float(p["price"]))
    rows = [(city, v["count"], (sum(v["prices"]) / len(v["prices"])) if v["prices"] else None)
            for city, v in by_city.items()]
    rows.sort(key=lambda r: r[1], reverse=True)
    return {"cities": [{"city": r[0], "count": r[1], "avg_price": float(r[2]) if r[2] else 0}
                       for r in rows[:10]]}


def price_distribution(props, transaction_type: str) -> dict:
    active = [p for p in props if p["status"] == "active" and p["transaction_type"] == transaction_type]
    if transaction_type == "sale":
        ranges = [(0, 500000, "< 500K"), (500000, 1000000, "500K - 1M"), (1000000, 2000000, "1M - 2M"),
                  (2000000, 5000000, "2M - 5M"), (5000000, float("inf"), "> 5M")]
    else:
        ranges = [(0, 3000, "< 3K"), (3000, 5000, "3K - 5K"), (5000, 10000, "5K - 10K"),
                  (10000, 20000, "10K - 20K"), (20000, float("inf"), "> 20K")]
    distribution = []
    for lo, hi, label in ranges:
        count = sum(1 for p in active if p["price"] is not None and lo <= float(p["price"]) < hi)
        distribution.append({"range": label, "count": count})
    return {"distribution": distribution}


def export_csv(export_type: str, props, clients, txns, names) -> str:
    out = StringIO()
    w = csv.writer(out)
    if export_type == "clients":
        w.writerow(["Name", "Email", "Phone", "Type", "Status", "Source", "City", "Created At"])
        for c in clients:
            w.writerow([c["full_name"], c["email"], c["phone"], c["client_type"], c["status"],
                        c["source"], c["city"], (_pd(c["created_at"]).strftime("%Y-%m-%d") if c["created_at"] else "")])
    elif export_type == "transactions":
        w.writerow(["Reference", "Type", "Stage", "Status", "Asking Price", "Final Price",
                    "Commission", "Agent", "Created At"])
        for t in txns:
            w.writerow([t["reference"], t["transaction_type"], t["stage"], t["status"],
                        t["asking_price"] if t["asking_price"] is not None else "",
                        t["final_price"] if t["final_price"] is not None else "",
                        t["commission_amount"] if t["commission_amount"] is not None else "",
                        names.get(t["agent_id"]) or "",
                        (_pd(t["created_at"]).strftime("%Y-%m-%d") if t["created_at"] else "")])
    else:  # properties
        w.writerow(["Reference", "Title", "Type", "Transaction", "Price", "City", "Surface",
                    "Rooms", "Status", "Views", "Created At"])
        for p in props:
            w.writerow([p["reference"], p["title"], p["property_type"], p["transaction_type"],
                        float(p["price"]) if p["price"] is not None else "", p["city"], p["surface"],
                        p["rooms"], p["status"], p["views_count"],
                        (_pd(p["created_at"]).strftime("%Y-%m-%d") if p["created_at"] else "")])
    return out.getvalue()
