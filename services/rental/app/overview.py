"""Vue d'ensemble de la gestion locative d'une agence (back-office).

Synthèse du mois, impayés par ancienneté, occupation, honoraires, fins de bail et de mandat,
candidatures sans réponse, états des lieux manquants — et l'enrichissement des listes (bien,
personnes, échéances, états des lieux). Les montants sont exclusivement des loyers et charges :
aucun prix de vente ne transite ici.
"""
from datetime import datetime, timedelta

from .models import (ApplicationDocument, ClientRO, Inventory, Lease, Mandate, PropertyRO,
                     RentPeriod, TenantApplication)
from .util import iso, num

PENDING_APPLICATIONS = ("received", "reviewing", "shortlist")
LATE_PAYMENT_DAYS = 5          # au-delà, un loyer payé l'est « en retard »
HISTORY_MONTHS = 6


def _f(v) -> float:
    return float(v or 0)


def _day(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, dt.day)


def _days(a: datetime, b: datetime) -> int:
    return (_day(b) - _day(a)).days


def period_state(rp: RentPeriod, now: datetime) -> str:
    """État lisible d'une échéance : paid | paid_late | partial | late | upcoming."""
    if rp.status == "paid":
        if rp.paid_at and rp.due_date and _days(rp.due_date, rp.paid_at) > LATE_PAYMENT_DAYS:
            return "paid_late"
        return "paid"
    overdue = rp.due_date is not None and _day(rp.due_date) < _day(now)
    if rp.status == "partial":
        return "partial" if overdue else "upcoming"
    return "late" if overdue else "upcoming"


def period_rest(rp: RentPeriod) -> float:
    return max(_f(rp.total_amount) - _f(rp.paid_amount), 0.0) if rp.status != "paid" else 0.0


def period_collected(rp: RentPeriod) -> float:
    if rp.status not in ("paid", "partial"):
        return 0.0
    return min(_f(rp.paid_amount or (rp.total_amount if rp.status == "paid" else 0)), _f(rp.total_amount))


def age_bucket(days: int) -> str:
    return "lt15" if days < 15 else ("d15_45" if days <= 45 else "gt45")


def _month_key(y: int, m: int) -> str:
    return f"{y:04d}-{m:02d}"


def _last_months(now: datetime, n: int) -> list[tuple[int, int]]:
    y, m, out = now.year, now.month, []
    for _ in range(n):
        out.append((y, m))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return out[::-1]


def people(db, client_ids, lookup) -> dict:
    """Nom et coordonnées des clients : projection locale, sinon le CRM (lookup)."""
    ids = {int(i) for i in client_ids if i}
    out = {}
    if ids:
        for c in db.query(ClientRO).filter(ClientRO.id.in_(ids)).all():
            name = f"{c.first_name or ''} {c.last_name or ''}".strip() or None
            out[c.id] = {"name": name, "email": c.email, "phone": None}
    # ponytail: un appel CRM par client absent de la projection ; un lookup groupé si le volume grossit.
    for i in ids - out.keys():
        c = lookup(i) or {}
        if c:
            out[i] = {"name": c.get("name"), "email": c.get("email"), "phone": c.get("phone")}
    return out


def properties(db, property_ids) -> dict:
    ids = {int(i) for i in property_ids if i}
    if not ids:
        return {}
    return {p.id: {"title": p.title, "city": p.city}
            for p in db.query(PropertyRO).filter(PropertyRO.id.in_(ids)).all()}


class _Ctx:
    """Données d'une agence chargées une fois, partagées par la synthèse et les listes."""

    def __init__(self, db, agency_id: int, lookup):
        self.mandates = db.query(Mandate).filter(Mandate.agency_id == agency_id).all()
        self.leases = db.query(Lease).filter(Lease.agency_id == agency_id).all()
        self.periods = db.query(RentPeriod).filter(RentPeriod.agency_id == agency_id).all()
        self.inventories = db.query(Inventory).filter(Inventory.agency_id == agency_id).all()
        self.mandate_by_id = {m.id: m for m in self.mandates}
        self.periods_by_lease = {}
        for rp in self.periods:
            self.periods_by_lease.setdefault(rp.lease_id, []).append(rp)
        for ps in self.periods_by_lease.values():
            ps.sort(key=lambda rp: (rp.year, rp.month))
        self.inv_by_lease = {}
        for inv in self.inventories:
            self.inv_by_lease.setdefault(inv.lease_id, {})[inv.type] = inv
        self.props = properties(db, [m.property_id for m in self.mandates] + [l.property_id for l in self.leases])
        self.persons = people(db, [m.landlord_client_id for m in self.mandates]
                              + [l.tenant_client_id for l in self.leases], lookup)

    def prop(self, pid) -> dict:
        return self.props.get(pid) or {}

    def person(self, cid) -> dict:
        return self.persons.get(cid) or {}


def _lease_extra(ctx: _Ctx, l: Lease, now: datetime) -> dict:
    ps = ctx.periods_by_lease.get(l.id, [])
    mandate = ctx.mandate_by_id.get(l.mandate_id)
    tenant = ctx.person(l.tenant_client_id)
    open_ps = [rp for rp in ps if period_state(rp, now) in ("late", "partial")]
    invs = ctx.inv_by_lease.get(l.id, {})
    return {
        "property_title": ctx.prop(l.property_id).get("title"),
        "property_city": ctx.prop(l.property_id).get("city"),
        "tenant_name": tenant.get("name"), "tenant_email": tenant.get("email"),
        "tenant_phone": tenant.get("phone"),
        "mandate_reference": mandate.reference if mandate else None,
        "landlord_name": ctx.person(mandate.landlord_client_id).get("name") if mandate else None,
        "fee_percent": num(mandate.fee_percent) if mandate else None,
        "periods": [{"id": rp.id, "year": rp.year, "month": rp.month, "state": period_state(rp, now),
                     "total_amount": num(rp.total_amount), "paid_amount": num(rp.paid_amount),
                     "due_date": iso(rp.due_date), "paid_at": iso(rp.paid_at)}
                    for rp in ps[-HISTORY_MONTHS:]],
        "owed": round(sum(period_rest(rp) for rp in open_ps), 2),
        "open_periods": len(open_ps),
        "oldest_overdue_days": max((_days(rp.due_date, now) for rp in open_ps), default=0),
        "inventories": {t: ({"id": inv.id, "status": inv.status} if (inv := invs.get(t)) else None)
                        for t in ("entree", "sortie")},
        "days_to_end": _days(now, l.end_date) if l.end_date else None,
    }


def enrich_leases(db, agency_id: int, lease_dicts: list[dict], now: datetime, lookup) -> list[dict]:
    ctx = _Ctx(db, agency_id, lookup)
    by_id = {l.id: l for l in ctx.leases}
    return [{**d, **_lease_extra(ctx, by_id[d["id"]], now)} if d["id"] in by_id else d for d in lease_dicts]


def enrich_mandates(db, agency_id: int, mandate_dicts: list[dict], now: datetime, lookup) -> list[dict]:
    ctx = _Ctx(db, agency_id, lookup)
    active_lease = {l.mandate_id: l for l in ctx.leases if l.status == "active" and l.mandate_id}
    out = []
    for d in mandate_dicts:
        lease = active_lease.get(d["id"])
        end = datetime.fromisoformat(d["end_date"]) if d.get("end_date") else None
        out.append({**d,
                    "property_title": ctx.prop(d["property_id"]).get("title"),
                    "property_city": ctx.prop(d["property_id"]).get("city"),
                    "landlord_name": ctx.person(d["landlord_client_id"]).get("name"),
                    "active_lease_id": lease.id if lease else None,
                    "days_to_end": _days(now, end) if end else None})
    return out


def _doc_counts(db, ids) -> dict:
    counts = {}
    if ids:
        for doc in db.query(ApplicationDocument).filter(ApplicationDocument.application_id.in_(ids)).all():
            counts[doc.application_id] = counts.get(doc.application_id, 0) + 1
    return counts


def enrich_applications(db, app_dicts: list[dict]) -> list[dict]:
    counts = _doc_counts(db, [d["id"] for d in app_dicts])
    props = properties(db, [d["property_id"] for d in app_dicts])
    return [{**d, "documents_count": counts.get(d["id"], 0),
             "property_city": (props.get(d["property_id"]) or {}).get("city")} for d in app_dicts]


def _expiring(ctx: _Ctx, now: datetime, days: int) -> dict:
    horizon = _day(now) + timedelta(days=days)
    items = []
    for l in ctx.leases:
        if l.status == "active" and l.end_date and _day(now) <= _day(l.end_date) <= horizon:
            items.append({"kind": "lease", "id": l.id, "reference": l.reference, "end_date": iso(l.end_date),
                          "days_left": _days(now, l.end_date),
                          "property_title": ctx.prop(l.property_id).get("title"),
                          "property_city": ctx.prop(l.property_id).get("city"),
                          "party_name": ctx.person(l.tenant_client_id).get("name"),
                          "exit_inventory": bool(ctx.inv_by_lease.get(l.id, {}).get("sortie"))})
    for m in ctx.mandates:
        if m.status == "active" and m.end_date and _day(now) <= _day(m.end_date) <= horizon:
            items.append({"kind": "mandate", "id": m.id, "reference": m.reference, "end_date": iso(m.end_date),
                          "days_left": _days(now, m.end_date),
                          "property_title": ctx.prop(m.property_id).get("title"),
                          "property_city": ctx.prop(m.property_id).get("city"),
                          "party_name": ctx.person(m.landlord_client_id).get("name"),
                          "notice_sent": m.expiry_notice_sent_at is not None})
    items.sort(key=lambda x: x["days_left"])
    return {"days": days, "items": items,
            "undated": {"leases": sum(1 for l in ctx.leases if l.status == "active" and not l.end_date),
                        "mandates": sum(1 for m in ctx.mandates if m.status == "active" and not m.end_date)}}


def expiring(db, agency_id: int, now: datetime, days: int, lookup) -> dict:
    return _expiring(_Ctx(db, agency_id, lookup), now, days)


def _arrears(ctx: _Ctx, now: datetime) -> dict:
    items = []
    lease_by_id = {l.id: l for l in ctx.leases}
    for rp in ctx.periods:
        if period_state(rp, now) not in ("late", "partial"):
            continue
        l = lease_by_id.get(rp.lease_id)
        age = _days(rp.due_date, now)
        items.append({"period_id": rp.id, "lease_id": rp.lease_id,
                      "lease_reference": l.reference if l else None,
                      "tenant_name": ctx.person(l.tenant_client_id).get("name") if l else None,
                      "property_title": ctx.prop(l.property_id).get("title") if l else None,
                      "property_city": ctx.prop(l.property_id).get("city") if l else None,
                      "year": rp.year, "month": rp.month, "period_label": rp.period_label,
                      "due_date": iso(rp.due_date), "total_amount": num(rp.total_amount),
                      "paid_amount": num(rp.paid_amount), "paid_at": iso(rp.paid_at),
                      "rest": round(period_rest(rp), 2), "age_days": age, "bucket": age_bucket(age),
                      "reminder_count": rp.reminder_count or 0})
    items.sort(key=lambda x: -x["age_days"])
    buckets = {k: round(sum(i["rest"] for i in items if i["bucket"] == k), 2) for k in ("lt15", "d15_45", "gt45")}
    return {"total": round(sum(i["rest"] for i in items), 2), "periods": len(items),
            "leases": len({i["lease_id"] for i in items}), "buckets": buckets, "items": items}


def _collections(ctx: _Ctx, now: datetime) -> dict:
    months = _last_months(now, HISTORY_MONTHS)
    keys = {(y, m) for y, m in months}
    per_month = {k: {"expected": 0.0, "collected": 0.0, "count": 0} for k in keys}
    by_lease = {}
    for rp in ctx.periods:
        k = (rp.year, rp.month)
        if k not in keys:
            continue
        agg = per_month[k]
        agg["expected"] += _f(rp.total_amount)
        agg["collected"] += period_collected(rp)
        agg["count"] += 1
        by_lease.setdefault(rp.lease_id, {})[_month_key(*k)] = {
            "total": num(rp.total_amount), "paid": round(period_collected(rp), 2), "state": period_state(rp, now)}
    lease_by_id = {l.id: l for l in ctx.leases}
    rows = []
    for lid, cells in by_lease.items():
        l = lease_by_id.get(lid)
        rows.append({"lease_id": lid, "reference": l.reference if l else None,
                     "tenant_name": ctx.person(l.tenant_client_id).get("name") if l else None,
                     "property_title": ctx.prop(l.property_id).get("title") if l else None,
                     "months": cells})
    return {"months": [{"year": y, "month": m, "key": _month_key(y, m),
                        "expected": round(per_month[(y, m)]["expected"], 2),
                        "collected": round(per_month[(y, m)]["collected"], 2),
                        "count": per_month[(y, m)]["count"]} for y, m in months],
            "by_lease": rows}


def _applications(db, agency_id: int, now: datetime) -> dict:
    apps = db.query(TenantApplication).filter(TenantApplication.agency_id == agency_id).all()
    counts = _doc_counts(db, [a.id for a in apps])
    props = properties(db, [a.property_id for a in apps])

    def row(a):
        return {"id": a.id, "applicant_name": a.applicant_name, "applicant_email": a.applicant_email,
                "status": a.status, "property_id": a.property_id,
                "property_title": (props.get(a.property_id) or {}).get("title"),
                "submitted_at": iso(a.submitted_at), "decided_at": iso(a.decided_at),
                "age_days": _days(a.submitted_at, now) if a.submitted_at else None,
                "monthly_income": num(a.monthly_income), "guarantor_income": num(a.guarantor_income),
                "submitted_by_agency": a.submitted_by_agent_id is not None,
                "documents_count": counts.get(a.id, 0)}

    pending = sorted((row(a) for a in apps if a.status in PENDING_APPLICATIONS),
                     key=lambda r: -(r["age_days"] or 0))
    decided = sorted((row(a) for a in apps if a.decided_at and a.status in ("accepted", "rejected")),
                     key=lambda r: r["decided_at"], reverse=True)[:5]
    return {"pending": pending, "recent_decisions": decided, "total": len(apps)}


def _inventories(ctx: _Ctx, now: datetime) -> dict:
    items = []
    active = [l for l in ctx.leases if l.status == "active"]
    for l in active:
        invs = ctx.inv_by_lease.get(l.id, {})
        base = {"lease_id": l.id, "reference": l.reference,
                "property_title": ctx.prop(l.property_id).get("title"),
                "property_city": ctx.prop(l.property_id).get("city"),
                "tenant_name": ctx.person(l.tenant_client_id).get("name"),
                "deposit_amount": num(l.deposit_amount), "start_date": iso(l.start_date)}
        entree = invs.get("entree")
        if entree is None or entree.status != "signed":
            items.append({**base, "type": "entree", "inventory_id": entree.id if entree else None,
                          "status": entree.status if entree else "missing",
                          "since": iso(entree.created_at) if entree else None})
        if l.end_date and _days(now, l.end_date) <= 14 and "sortie" not in invs:
            items.append({**base, "type": "sortie", "inventory_id": None, "status": "to_plan",
                          "since": iso(l.end_date)})
    unsigned_entry = [i for i in items if i["type"] == "entree"]
    return {"items": items, "active_leases": len(active),
            "entry_signed": len(active) - len(unsigned_entry),
            "deposits_exposed": round(sum(_f(i["deposit_amount"]) for i in unsigned_entry), 2)}


def _vacant(ctx: _Ctx, pending_apps: list[dict], now: datetime) -> list[dict]:
    leased = {l.mandate_id for l in ctx.leases if l.status == "active"}
    out = []
    for m in ctx.mandates:
        if m.status != "active" or m.id in leased:
            continue
        ended = [l.end_date for l in ctx.leases if l.mandate_id == m.id and l.end_date and l.end_date <= now]
        since = max(ended) if ended else m.signed_at
        out.append({"mandate_id": m.id, "reference": m.reference, "property_id": m.property_id,
                    "property_title": ctx.prop(m.property_id).get("title"),
                    "since": iso(since), "days": _days(since, now) if since else None,
                    "candidates": sum(1 for a in pending_apps if a["property_id"] == m.property_id)})
    return out


def summary(db, agency_id: int, now: datetime, days: int, lookup) -> dict:
    ctx = _Ctx(db, agency_id, lookup)
    month_ps = [rp for rp in ctx.periods if (rp.year, rp.month) == (now.year, now.month)]
    lease_by_id = {l.id: l for l in ctx.leases}
    fees = 0.0
    for rp in month_ps:
        l = lease_by_id.get(rp.lease_id)
        m = ctx.mandate_by_id.get(l.mandate_id) if l else None
        if m is not None:
            fees += period_collected(rp) * _f(m.fee_percent) / 100.0
    active_mandates = [m for m in ctx.mandates if m.status == "active"]
    leased = {l.mandate_id for l in ctx.leases if l.status == "active"}
    apps = _applications(db, agency_id, now)
    return {
        "as_of": iso(now), "year": now.year, "month_number": now.month,
        "month": {"expected": round(sum(_f(rp.total_amount) for rp in month_ps), 2),
                  "collected": round(sum(period_collected(rp) for rp in month_ps), 2),
                  "count": len(month_ps)},
        "arrears": _arrears(ctx, now),
        "occupancy": {"managed": len(active_mandates),
                      "leased": sum(1 for m in active_mandates if m.id in leased)},
        "fees": {"month": round(fees, 2)},
        "collections": _collections(ctx, now),
        "expiring": _expiring(ctx, now, days),
        "applications": apps,
        "inventories": _inventories(ctx, now),
        "vacant": _vacant(ctx, apps["pending"], now),
        "counts": {"mandates": len(ctx.mandates), "leases": len(ctx.leases),
                   "active_leases": sum(1 for l in ctx.leases if l.status == "active")},
    }
