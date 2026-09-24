from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app(**states):
    return SimpleNamespace(state=SimpleNamespace(**states))


def test_create_report_routes_to_trust_safety(monkeypatch):
    monkeypatch.setattr(m.settings, "trust_safety_url", "http://t")
    fake = _app(trust_safety="TRUST_SAFETY")
    assert _resolve_upstream(fake, "/api/v1/reports", "POST") == ("TRUST_SAFETY", "/reports")


def test_create_report_get_not_routed(monkeypatch):
    """GET /reports n'existe pas côté service — seule la création (POST) est exposée ainsi."""
    monkeypatch.setattr(m.settings, "trust_safety_url", "http://t")
    fake = _app(trust_safety="TRUST_SAFETY")
    client, _ = _resolve_upstream(fake, "/api/v1/reports", "GET")
    assert client is None


def test_report_resolve_action_routes_to_trust_safety(monkeypatch):
    monkeypatch.setattr(m.settings, "trust_safety_url", "http://t")
    fake = _app(trust_safety="TRUST_SAFETY")
    assert _resolve_upstream(fake, "/api/v1/admin/reports/42/resolve", "POST") == (
        "TRUST_SAFETY", "/admin/reports/42/resolve")


def test_report_dismiss_action_routes_to_trust_safety(monkeypatch):
    monkeypatch.setattr(m.settings, "trust_safety_url", "http://t")
    fake = _app(trust_safety="TRUST_SAFETY")
    assert _resolve_upstream(fake, "/api/v1/admin/reports/42/dismiss", "POST") == (
        "TRUST_SAFETY", "/admin/reports/42/dismiss")


def test_trust_read_routes_to_trust_safety(monkeypatch):
    monkeypatch.setattr(m.settings, "trust_safety_url", "http://t")
    fake = _app(trust_safety="TRUST_SAFETY")
    assert _resolve_upstream(fake, "/api/v1/trust/agency/7", "GET") == ("TRUST_SAFETY", "/trust/agency/7")


def test_trust_read_unmapped_when_disabled(monkeypatch):
    monkeypatch.setattr(m.settings, "trust_safety_url", None)
    fake = _app(trust_safety=None)
    client, _ = _resolve_upstream(fake, "/api/v1/trust/agency/7", "GET")
    assert client is None


def test_reports_unmapped_when_disabled(monkeypatch):
    monkeypatch.setattr(m.settings, "trust_safety_url", None)
    fake = _app(trust_safety=None)
    client, _ = _resolve_upstream(fake, "/api/v1/reports", "POST")
    assert client is None
    client, _ = _resolve_upstream(fake, "/api/v1/admin/reports/1/resolve", "POST")
    assert client is None


def test_blocages_vont_a_trust_safety(monkeypatch):
    """Sans routage, « bloquer » n'atteindrait jamais le service qui porte la donnée."""
    import app.main as m
    from types import SimpleNamespace
    monkeypatch.setattr(m.settings, "trust_safety_url", "http://ts")
    app = SimpleNamespace(state=SimpleNamespace(trust_safety="TS"))
    assert m._resolve_upstream(app, "/api/v1/blocks", "GET") == ("TS", "/blocks")
    assert m._resolve_upstream(app, "/api/v1/blocks", "POST") == ("TS", "/blocks")
    assert m._resolve_upstream(app, "/api/v1/blocks/42", "DELETE") == ("TS", "/blocks/42")


def test_avis_vont_a_trust_safety(monkeypatch):
    import app.main as m
    from types import SimpleNamespace
    monkeypatch.setattr(m.settings, "trust_safety_url", "http://ts")
    app = SimpleNamespace(state=SimpleNamespace(trust_safety="TS"))
    assert m._resolve_upstream(app, "/api/v1/reviews", "POST") == ("TS", "/reviews")
    assert m._resolve_upstream(app, "/api/v1/reviews/received", "GET") == ("TS", "/reviews/received")
