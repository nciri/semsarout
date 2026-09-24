from datetime import datetime, timedelta, timezone

from app.models import MatchScore

from tests.conftest import INTERNAL


def _monday(d) -> str:
    return (d.date() - timedelta(days=d.weekday())).isoformat()


def _score(computed_at: datetime, listing_id: str = "l1") -> MatchScore:
    return MatchScore(seeker_id=7, listing_id=listing_id, score=80, hard_pass=False,
                      explanations={}, weights_version="v1", computed_at=computed_at)


def test_weekly_requires_internal_token(client):
    assert client.get("/internal/scores/weekly").status_code == 403


def test_weekly_returns_requested_window_including_empty_weeks(client):
    resp = client.get("/internal/scores/weekly", params={"weeks": 4}, headers=INTERNAL)
    assert resp.status_code == 200
    weeks = resp.json()["weeks"]
    assert len(weeks) == 4
    assert [w["count"] for w in weeks] == [0, 0, 0, 0]


def test_weekly_weeks_are_mondays_in_chronological_order(client):
    weeks = client.get("/internal/scores/weekly", params={"weeks": 3},
                       headers=INTERNAL).json()["weeks"]
    labels = [w["week"] for w in weeks]
    assert labels == sorted(labels)
    assert all(datetime.fromisoformat(w).weekday() == 0 for w in labels)


def test_weekly_counts_scores_of_their_week(client, db_session):
    now = datetime.now(timezone.utc)
    db_session.add(_score(now, "l1"))
    db_session.add(_score(now, "l2"))
    db_session.add(_score(now - timedelta(days=7), "l3"))
    db_session.commit()
    weeks = client.get("/internal/scores/weekly", params={"weeks": 4},
                       headers=INTERNAL).json()["weeks"]
    by_week = {w["week"]: w["count"] for w in weeks}
    assert by_week[_monday(now)] == 2
    assert by_week[_monday(now - timedelta(days=7))] == 1


def test_weekly_ignores_scores_older_than_window(client, db_session):
    db_session.add(_score(datetime.now(timezone.utc) - timedelta(days=90)))
    db_session.commit()
    weeks = client.get("/internal/scores/weekly", params={"weeks": 2},
                       headers=INTERNAL).json()["weeks"]
    assert [w["count"] for w in weeks] == [0, 0]


def test_weekly_rejects_out_of_range_window(client):
    assert client.get("/internal/scores/weekly", params={"weeks": 53},
                      headers=INTERNAL).status_code == 422
