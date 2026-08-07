import json

import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app

_ROWS = [
    {"id": "c1", "candidate_user_id": 51, "listing_id": "l1", "status": "received"},
    {"id": "c2", "candidate_user_id": 58, "listing_id": "l2", "status": "accepted"},
]


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def env(monkeypatch):
    def coloc_handler(request):
        assert request.url.path == "/candidatures/received"
        assert request.headers.get("x-semsar-user-id") == "7"  # identité ré-injectée par le BFF
        return httpx.Response(200, json=_ROWS)

    def identity_handler(request):
        assert request.headers.get("x-internal-token") == "tok"
        uid = int(request.url.path.rsplit("/", 1)[1])
        names = {51: "Salma Bennani", 58: "Youssef El Amrani"}
        return httpx.Response(200, json={"user": {"full_name": names[uid]}})

    def matching_handler(request):
        assert request.headers.get("x-internal-token") == "tok"
        body = json.loads(request.content)
        return httpx.Response(200, json={"scores": {lid: 90 for lid in body["listing_ids"]}})

    async def fake_ident(app_, auth, cookie=None):
        return {"user_id": 7, "tenant": "m3a-l3achrane"}

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    monkeypatch.setattr(m, "_resolve_identity", fake_ident)
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    with TestClient(app) as client:
        app.state.coloc_listing = _mock_client(coloc_handler)
        app.state.identity = _mock_client(identity_handler)
        app.state.matching = _mock_client(matching_handler)
        yield client


def test_received_enriches_name_and_score(env):
    resp = env.get("/api/v1/candidatures/received", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    rows = resp.json()
    assert rows[0]["candidate_name"] == "Salma Bennani"
    assert rows[0]["match_pct"] == 90
    assert rows[1]["candidate_name"] == "Youssef El Amrani"


def test_degrades_when_identity_and_matching_absent(env, monkeypatch):
    env.app.state.identity = None
    env.app.state.matching = None
    resp = env.get("/api/v1/candidatures/received", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    rows = resp.json()
    assert "candidate_name" not in rows[0]  # front retombe sur « Candidat #id »
    assert "match_pct" not in rows[0]


def test_degrades_when_matching_down(env):
    def broken(request):
        raise httpx.ConnectError("down")

    env.app.state.matching = _mock_client(broken)
    resp = env.get("/api/v1/candidatures/received", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200
    rows = resp.json()
    assert rows[0]["candidate_name"] == "Salma Bennani"  # le nom survit
    assert "match_pct" not in rows[0]  # le score dégrade proprement
