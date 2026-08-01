from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


def test_overview_requires_auth():
    with TestClient(app) as client:
        resp = client.get("/analytics/overview")
        assert resp.status_code == 401  # sans jeton -> refusé (RFC 9457)
