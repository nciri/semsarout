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
