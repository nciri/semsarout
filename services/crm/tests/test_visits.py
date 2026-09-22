"""Page « Visites & RDV » : synthèse de l'agenda et requalification des visites passées."""
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models import Visit
from app.visits import summarize

NOW = datetime(2026, 9, 22, 12, 0)


def _v(delta_days: float, status: str = "scheduled"):
    return SimpleNamespace(scheduled_at=NOW + timedelta(days=delta_days), status=status)


def test_summarize_splits_upcoming_overdue_and_recent_outcomes():
    visits = [_v(2), _v(1, "confirmed"), _v(5), _v(3, "cancelled"),       # futures
              _v(-1), _v(-4, "confirmed"),                                 # passées non requalifiées
              _v(-2, "completed"), _v(-3, "completed"), _v(-5, "no_show"), _v(-6, "cancelled"),
              _v(-200, "completed")]                                       # hors fenêtre

    out = summarize(visits, NOW, days=90)

    assert out["upcoming"] == 3
    assert out["to_confirm"] == 2
    assert out["next"].scheduled_at == NOW + timedelta(days=1)
    assert [v.scheduled_at for v in out["overdue"]] == [NOW - timedelta(days=4), NOW - timedelta(days=1)]
    assert out["recent"] == {"days": 90, "completed": 2, "cancelled": 1, "no_show": 1, "unresolved": 2, "total": 6}


def test_summarize_empty_agenda():
    out = summarize([], NOW)
    assert out["upcoming"] == 0 and out["next"] is None and out["overdue"] == []
    assert out["recent"]["total"] == 0


def _add(db, delta_days, status="scheduled", agency_id=1):
    v = Visit(visitor_name="Amine", visitor_phone="0600", scheduled_at=datetime.utcnow() + timedelta(days=delta_days),
              status=status, agency_id=agency_id)
    db.add(v)
    db.commit()
    return v


def test_summary_route_is_scoped_to_agency_and_not_taken_for_an_id(client, db_session):
    _add(db_session, 2)
    _add(db_session, -3, "confirmed")
    _add(db_session, -3, "confirmed", agency_id=2)

    resp = client.get("/backoffice/visits/summary")

    assert resp.status_code == 200
    body = resp.json()
    assert body["upcoming"] == 1 and body["to_confirm"] == 1
    assert body["overdue_total"] == 1
    assert body["overdue"][0]["visitor_name"] == "Amine"
    assert body["next"]["visitor_phone"] == "0600"
    assert body["recent"]["unresolved"] == 1


def test_requalifying_through_put_stamps_the_outcome(client, db_session):
    done = _add(db_session, -1)
    gone = _add(db_session, -1)

    r1 = client.put(f"/backoffice/visits/{done.id}", json={"status": "completed", "report": "RAS"})
    r2 = client.put(f"/backoffice/visits/{gone.id}", json={"status": "cancelled"})

    assert r1.json()["status"] == "completed" and r1.json()["completed_at"]
    assert r1.json()["report"] == "RAS"
    assert r2.json()["cancelled_at"] and not r2.json()["completed_at"]
