import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def webhook_env(monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        yield client


def test_webhook_relays_body_and_signature(webhook_env, monkeypatch):
    seen = {}

    def coloc_listing_handler(request):
        seen["path"] = request.url.path
        seen["signature"] = request.headers.get("x-webhook-signature")
        seen["internal_token"] = request.headers.get("x-internal-token")
        seen["body"] = request.content
        return httpx.Response(200, json={"status": "escrowed"})

    webhook_env.app.state.coloc_listing = _mock_client(coloc_listing_handler)
    resp = webhook_env.post(
        "/api/v1/payments/webhook",
        content=b'{"intent_id": "sim_x", "event": "succeeded"}',
        headers={"x-webhook-signature": "abc123", "content-type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "escrowed"}
    assert seen["path"] == "/internal/payments/webhook"
    assert seen["signature"] == "abc123"
    assert seen["internal_token"] == "tok"
    assert seen["body"] == b'{"intent_id": "sim_x", "event": "succeeded"}'


def test_webhook_relay_no_user_auth_required(webhook_env, monkeypatch):
    """Un vrai PSP n'a pas de JWT applicatif : cette route ne doit PAS exiger d'auth
    utilisateur (seule la signature webhook, vérifiée côté coloc-listing, fait foi)."""
    def coloc_listing_handler(request):
        return httpx.Response(403, json={"error": "Signature invalide"})

    webhook_env.app.state.coloc_listing = _mock_client(coloc_listing_handler)
    resp = webhook_env.post(
        "/api/v1/payments/webhook",
        content=b'{"intent_id": "sim_x", "event": "succeeded"}',
        headers={"x-webhook-signature": "bad"},
    )
    # No 401 for missing Authorization header — passthrough of downstream's own verdict.
    assert resp.status_code == 403


def test_webhook_relay_degrades_when_service_down(webhook_env):
    def broken(request):
        raise httpx.ConnectError("down")

    webhook_env.app.state.coloc_listing = _mock_client(broken)
    resp = webhook_env.post(
        "/api/v1/payments/webhook",
        content=b'{"intent_id": "sim_x", "event": "succeeded"}',
        headers={"x-webhook-signature": "abc123"},
    )
    assert resp.status_code == 502
