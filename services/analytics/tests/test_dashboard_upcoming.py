"""`visits.upcoming` : le total qui alimente le badge « visites à venir » du back-office.

Ni `pending` (qui garde les visites passées restées au statut planifié) ni la liste
`upcoming_visits` (tronquée à 5) ne donnent ce total.
"""
from datetime import datetime, timedelta

from app.dashboard import main


def _visit(delta_days: float, status: str = "scheduled") -> dict:
    return {"scheduled_at": (datetime.utcnow() + timedelta(days=delta_days)).isoformat(),
            "status": status}


def test_upcoming_counts_only_future_active_visits_without_cap():
    visits = [_visit(d) for d in range(1, 8)]          # 7 futures, au-delà du plafond de 5
    visits += [_visit(-2), _visit(-1, "confirmed")]    # passées mais encore « planifiées »
    visits += [_visit(3, "cancelled"), _visit(4, "done")]

    out = main([], [], [], visits, [])

    assert out["visits"]["upcoming"] == 7
    assert len(out["upcoming_visits"]) == 5
    assert out["visits"]["pending"] == 9


def _lead(days_ago: float, status: str = "new", source: str = "website") -> dict:
    return {"id": int(days_ago * 10), "name": f"L{days_ago}", "source": source, "status": status,
            "created_at": (datetime.utcnow() - timedelta(days=days_ago)).isoformat(),
            "property_id": 1, "property_title": "T", "converted_at": None}


def test_new_leads_listed_oldest_first_and_only_new():
    out = main([], [_lead(3), _lead(40), _lead(10, status="contacted")], [], [], [])
    names = [l["name"] for l in out["widgets"]["new_leads"]]
    assert names == ["L40", "L3"]


def test_leads_weekly_covers_13_weeks_by_source_and_status():
    out = main([], [_lead(1, source="phone_reveal"), _lead(1, status="lost")], [], [], [])
    weekly = out["widgets"]["leads_weekly"]
    assert len(weekly) == 13
    assert sum(w["by_source"]["phone_reveal"] for w in weekly) == 1
    assert sum(w["by_status"]["lost"] for w in weekly) == 1


def _txn(ttype, stage, status="active", asking=1000, offer=None, prob=50, closed_days=None):
    closed = (datetime.utcnow() - timedelta(days=closed_days)).isoformat() if closed_days is not None else None
    return {"transaction_type": ttype, "stage": stage, "status": status, "asking_price": asking,
            "offer_price": offer, "final_price": None, "probability": prob, "closed_at": closed,
            "updated_at": closed, "commission_amount": 0, "commission_rate": None, "lost_reason": None}


def test_pipeline_keeps_sale_and_rent_apart_and_weights_by_probability():
    out = main([], [], [], [], [_txn("sale", "offer", offer=2000, prob=50), _txn("rent", "application", asking=700)])
    sale = {r["stage"]: r for r in out["widgets"]["pipeline"]["sale"]}
    rent = {r["stage"]: r for r in out["widgets"]["pipeline"]["rent"]}
    assert sale["offer"] == {"stage": "offer", "count": 1, "amount": 2000.0, "weighted": 1000.0}
    assert rent["application"]["amount"] == 700.0
    assert "application" not in sale


def test_closed_keeps_last_90_days_newest_first():
    out = main([], [], [], [], [_txn("sale", "final_act", status="won", closed_days=5),
                                _txn("sale", "offer", status="lost", closed_days=200)])
    closed = out["widgets"]["closed"]
    assert [c["status"] for c in closed] == ["won"]
