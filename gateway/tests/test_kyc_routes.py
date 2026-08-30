from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app(**states):
    return SimpleNamespace(state=SimpleNamespace(**states))


def test_kyc_webhook_reachable_without_auth(monkeypatch):
    """Le webhook Didit route bien vers identity via le proxy générique /api/v1/identity* —
    aucune garde BFF (JWT/CSRF) ne le bloque : la signature X-Signature-V2, vérifiée côté
    service identity, fait foi (patron payment webhook)."""
    monkeypatch.setattr(m.settings, "identity_url", "http://i")
    fake = _app(identity="IDENTITY")
    assert _resolve_upstream(fake, "/api/v1/identity/kyc/webhook", "POST") == (
        "IDENTITY", "/identity/kyc/webhook")


def test_kyc_session_routes_to_identity(monkeypatch):
    monkeypatch.setattr(m.settings, "identity_url", "http://i")
    fake = _app(identity="IDENTITY")
    assert _resolve_upstream(fake, "/api/v1/identity/kyc/session", "POST") == (
        "IDENTITY", "/identity/kyc/session")


def test_kyc_refresh_routes_to_identity(monkeypatch):
    monkeypatch.setattr(m.settings, "identity_url", "http://i")
    fake = _app(identity="IDENTITY")
    assert _resolve_upstream(fake, "/api/v1/identity/kyc/42/refresh", "POST") == (
        "IDENTITY", "/identity/kyc/42/refresh")


def test_kyc_webhook_not_csrf_gated():
    """Un appel sans cookie de session (cas Didit) ne déclenche jamais l'exigence CSRF."""
    from starlette.requests import Request

    scope = {
        "type": "http", "method": "POST", "path": "/api/v1/identity/kyc/webhook",
        "headers": [], "query_string": b"", "server": ("test", 80), "scheme": "http",
    }
    request = Request(scope)
    assert m._csrf_required(request) is False
