import app.main as m
from app.models import LifestyleAnswer, Profile


def test_stats_forbidden_without_token(client):
    assert client.get("/internal/stats").status_code == 403


def test_stats_counts(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p1 = Profile(user_id=1, is_verified=True)
    p2 = Profile(user_id=2, is_verified=False)
    db_session.add(p1)
    db_session.add(p2)
    db_session.flush()
    db_session.add(LifestyleAnswer(profile_id=p1.id, question_code="smoking", value="NON"))
    db_session.commit()
    resp = client.get("/internal/stats", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_profiles"] == 2
    assert body["verified_profiles"] == 1
    assert body["profiles_with_lifestyle"] == 1


def test_stats_wrong_tenant_returns_zeros(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db_session.add(Profile(user_id=1, is_verified=True))
    db_session.commit()
    resp = client.get("/internal/stats", params={"tenant": "semsar"},
                      headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    assert resp.json()["total_profiles"] == 0
