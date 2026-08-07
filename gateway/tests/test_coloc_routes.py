from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app(**states):
    defaults = {name: None for name in ("search", "coloc_listing", "coloc_profile")}
    defaults.update(states)
    return SimpleNamespace(state=SimpleNamespace(**defaults))


def test_profile_routes_to_coloc_profile(monkeypatch):
    monkeypatch.setattr(m.settings, "coloc_profile_url", "http://p")
    fake = SimpleNamespace(state=SimpleNamespace(coloc_profile="PROFILE"))
    assert _resolve_upstream(fake, "/api/v1/me/profile", "GET") == ("PROFILE", "/me/profile")
    assert _resolve_upstream(fake, "/api/v1/me/lifestyle", "PUT") == ("PROFILE", "/me/lifestyle")
    assert _resolve_upstream(fake, "/api/v1/me/favorites", "POST") == ("PROFILE", "/me/favorites")
    assert _resolve_upstream(fake, "/api/v1/me/favorites/abc", "DELETE") == (
        "PROFILE", "/me/favorites/abc")


def test_listings_writes_and_detail_route_to_coloc_listing(monkeypatch):
    monkeypatch.setattr(m.settings, "search_url", "http://s")
    monkeypatch.setattr(m.settings, "coloc_listing_url", "http://c")
    fake = _app(search="SEARCH", coloc_listing="COLOC")
    assert _resolve_upstream(fake, "/api/v1/listings", "POST") == ("COLOC", "/listings")
    assert _resolve_upstream(fake, "/api/v1/listings/abc123", "GET") == ("COLOC", "/listings/abc123")
    assert _resolve_upstream(fake, "/api/v1/listings/abc123/approve", "POST") == (
        "COLOC", "/listings/abc123/approve")
    assert _resolve_upstream(fake, "/api/v1/me/listings", "GET") == ("COLOC", "/me/listings")


def test_lease_routes_to_coloc_listing(monkeypatch):
    monkeypatch.setattr(m.settings, "coloc_listing_url", "http://c")
    fake = _app(coloc_listing="COLOC")
    assert _resolve_upstream(fake, "/api/v1/me/lease", "GET") == ("COLOC", "/me/lease")
    assert _resolve_upstream(fake, "/api/v1/me/leases", "GET") == ("COLOC", "/me/leases")
    assert _resolve_upstream(fake, "/api/v1/leases", "POST") == ("COLOC", "/leases")
    assert _resolve_upstream(fake, "/api/v1/leases/mine", "GET") == ("COLOC", "/leases/mine")
    assert _resolve_upstream(fake, "/api/v1/leases/abc123", "GET") == ("COLOC", "/leases/abc123")
    assert _resolve_upstream(
        fake, "/api/v1/leases/abc123/payments/p1/escrow", "POST"
    ) == ("COLOC", "/leases/abc123/payments/p1/escrow")
    assert _resolve_upstream(
        fake, "/api/v1/leases/abc123/payments/p1/intent", "POST"
    ) == ("COLOC", "/leases/abc123/payments/p1/intent")
    assert _resolve_upstream(
        fake, "/api/v1/leases/abc123/etat-des-lieux", "POST"
    ) == ("COLOC", "/leases/abc123/etat-des-lieux")
    assert _resolve_upstream(
        fake, "/api/v1/leases/abc123/etat-des-lieux/e1/sign", "POST"
    ) == ("COLOC", "/leases/abc123/etat-des-lieux/e1/sign")


def test_unmapped_when_disabled(monkeypatch):
    monkeypatch.setattr(m.settings, "coloc_listing_url", None)
    monkeypatch.setattr(m.settings, "search_url", None)
    fake = _app()
    client, _ = _resolve_upstream(fake, "/api/v1/listings", "GET")
    assert client is None
