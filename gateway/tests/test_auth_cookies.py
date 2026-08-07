"""Durcissement JWT (m3a-l3achrane) : cookies httpOnly posés par le BFF au login/refresh,
identité résolue depuis le cookie à défaut d'en-tête Authorization, CSRF double-submit sur
les mutations authentifiées par cookie, logout qui efface tout. Rétro-compat Bearer vérifiée
par les tests existants (test_composite_listings.py, test_tenant.py) : non touchée ici."""
import time

import httpx
import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import app


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


def _access_jwt(secret: str, **claims) -> str:
    payload = {"sub": "7", "account_role": "buyer", "is_superadmin": False,
               "exp": int(time.time()) + 3600}
    payload.update(claims)
    return pyjwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def identity_env(monkeypatch):
    """Route /api/v1/auth/* vers un identity mocké."""
    monkeypatch.setattr(m.settings, "identity_url", "http://identity")
    with TestClient(app) as client:
        yield client


def _set_identity_handler(handler):
    app.state.identity = _mock_client(handler)


def test_login_sets_httponly_cookies_and_keeps_body(identity_env):
    def handler(request):
        assert request.url.path == "/auth/login"
        return httpx.Response(200, json={
            "user": {"id": 7}, "access_token": "acc-tok", "refresh_token": "ref-tok",
        })

    _set_identity_handler(handler)
    resp = identity_env.post("/api/v1/auth/login", json={"email": "a@a.com", "password": "x"})
    assert resp.status_code == 200
    # Corps inchangé (rétro-compat clients existants).
    assert resp.json()["access_token"] == "acc-tok"
    assert resp.json()["user"] == {"id": 7}

    cookies = resp.cookies
    assert cookies[m.settings.cookie_access_name] == "acc-tok"
    assert cookies[m.settings.cookie_refresh_name] == "ref-tok"
    assert cookies[m.settings.cookie_authed_name] == "1"
    assert m.settings.cookie_csrf_name in cookies

    raw = "\n".join(resp.headers.get_list("set-cookie"))
    access_line = next(l for l in raw.splitlines() if l.startswith(m.settings.cookie_access_name))
    assert "HttpOnly" in access_line
    assert "SameSite=lax" in access_line
    assert "Secure" not in access_line  # http en test → pas de Secure
    assert "Path=/api" in access_line

    refresh_line = next(l for l in raw.splitlines() if l.startswith(m.settings.cookie_refresh_name))
    assert "HttpOnly" in refresh_line
    assert "Path=/api/v1/auth/refresh" in refresh_line

    csrf_line = next(l for l in raw.splitlines() if l.startswith(m.settings.cookie_csrf_name))
    assert "HttpOnly" not in csrf_line  # lisible en JS (double-submit)

    authed_line = next(l for l in raw.splitlines() if l.startswith(m.settings.cookie_authed_name))
    assert "HttpOnly" not in authed_line  # simple drapeau, jamais un jeton


def test_login_secure_cookie_when_https(identity_env):
    def handler(request):
        return httpx.Response(200, json={"access_token": "acc-tok", "refresh_token": "ref-tok"})

    _set_identity_handler(handler)
    resp = identity_env.post(
        "/api/v1/auth/login", json={"email": "a@a.com", "password": "x"},
        headers={"x-forwarded-proto": "https"},
    )
    raw = "\n".join(resp.headers.get_list("set-cookie"))
    access_line = next(l for l in raw.splitlines() if l.startswith(m.settings.cookie_access_name))
    assert "Secure" in access_line


def test_login_secure_cookie_forced_outside_dev_without_forwarded_proto(identity_env, monkeypatch):
    """Hors dev, Secure est forcé même si le reverse-proxy n'envoie pas X-Forwarded-Proto
    (défense en profondeur : jamais de cookie de session sans Secure en prod/staging)."""
    monkeypatch.setattr(m.settings, "environment", "production")

    def handler(request):
        return httpx.Response(200, json={"access_token": "acc-tok", "refresh_token": "ref-tok"})

    _set_identity_handler(handler)
    resp = identity_env.post("/api/v1/auth/login", json={"email": "a@a.com", "password": "x"})
    raw = "\n".join(resp.headers.get_list("set-cookie"))
    access_line = next(l for l in raw.splitlines() if l.startswith(m.settings.cookie_access_name))
    assert "Secure" in access_line


def test_csrf_constant_time_rejects_mismatch(identity_env, monkeypatch):
    """Un jeton CSRF de longueur/valeur différente est rejeté (comparaison temps constant,
    pas de court-circuit sur mismatch)."""
    def handler(request):
        return httpx.Response(200, json={"user": {"id": 7}})

    _set_identity_handler(handler)
    resp = identity_env.put(
        "/api/v1/auth/me", json={"first_name": "x"},
        cookies={
            m.settings.cookie_access_name: "whatever",
            m.settings.cookie_csrf_name: "csrf-abc",
        },
        headers={"X-CSRF-Token": "csrf-xyz-different-length"},
    )
    assert resp.status_code == 403


def test_identity_resolved_from_access_cookie(identity_env, monkeypatch):
    secret = "test-secret"
    monkeypatch.setattr(m.settings, "jwt_secret_key", secret)
    monkeypatch.setattr(m.settings, "identity_url", "http://identity")
    monkeypatch.setattr(m, "_TENANT_HOSTS", {})
    monkeypatch.setattr(m.settings, "tenant_dev_header", False)

    received = {}

    def handler(request):
        received["headers"] = dict(request.headers)
        return httpx.Response(200, json={"user": {"id": 7}})

    _set_identity_handler(handler)
    token = _access_jwt(secret)
    resp = identity_env.get("/api/v1/auth/me", cookies={m.settings.cookie_access_name: token})
    assert resp.status_code == 200
    assert received["headers"].get("x-semsar-user-id") == "7"


def test_refresh_uses_cookie_when_no_authorization_header(identity_env):
    received = {}

    def handler(request):
        received["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"access_token": "new-acc", "refresh_token": "new-ref"})

    _set_identity_handler(handler)
    resp = identity_env.post(
        "/api/v1/auth/refresh", cookies={m.settings.cookie_refresh_name: "ref-tok-abc"},
    )
    assert resp.status_code == 200
    assert received["auth"] == "Bearer ref-tok-abc"
    assert resp.cookies[m.settings.cookie_access_name] == "new-acc"


def test_csrf_rejected_without_token_on_cookie_mutation(identity_env):
    resp = identity_env.put(
        "/api/v1/auth/me",
        json={"first_name": "x"},
        cookies={
            m.settings.cookie_access_name: "whatever",
            m.settings.cookie_csrf_name: "csrf-abc",
        },
    )
    assert resp.status_code == 403


def test_csrf_accepted_with_matching_token(identity_env, monkeypatch):
    secret = "test-secret"
    monkeypatch.setattr(m.settings, "jwt_secret_key", secret)
    monkeypatch.setattr(m, "_TENANT_HOSTS", {})
    monkeypatch.setattr(m.settings, "tenant_dev_header", False)

    def handler(request):
        return httpx.Response(200, json={"user": {"id": 7}})

    _set_identity_handler(handler)
    token = _access_jwt(secret)
    resp = identity_env.put(
        "/api/v1/auth/me",
        json={"first_name": "x"},
        cookies={
            m.settings.cookie_access_name: token,
            m.settings.cookie_csrf_name: "csrf-abc",
        },
        headers={"X-CSRF-Token": "csrf-abc"},
    )
    assert resp.status_code == 200


def test_csrf_exempt_for_bearer_clients(identity_env):
    """Rétro-compat : un client Bearer (pas de cookie de session) n'est jamais bloqué par CSRF."""
    def handler(request):
        return httpx.Response(200, json={"user": {"id": 7}})

    _set_identity_handler(handler)
    resp = identity_env.put(
        "/api/v1/auth/me", json={"first_name": "x"},
        headers={"Authorization": "Bearer some-token"},
    )
    assert resp.status_code == 200


def test_logout_clears_all_cookies():
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/auth/logout",
            cookies={
                m.settings.cookie_access_name: "a",
                m.settings.cookie_refresh_name: "r",
                m.settings.cookie_csrf_name: "c",
                m.settings.cookie_authed_name: "1",
            },
        )
    assert resp.status_code == 204
    raw = "\n".join(resp.headers.get_list("set-cookie"))
    for name in (m.settings.cookie_access_name, m.settings.cookie_refresh_name,
                 m.settings.cookie_csrf_name, m.settings.cookie_authed_name):
        line = next(l for l in raw.splitlines() if l.startswith(name))
        assert "Max-Age=0" in line or "expires=" in line.lower()
