from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app(**states):
    defaults = {name: None for name in ("search", "coloc_listing")}
    defaults.update(states)
    return SimpleNamespace(state=SimpleNamespace(**defaults))


def test_get_listings_routes_to_search(monkeypatch):
    monkeypatch.setattr(m.settings, "search_url", "http://s")
    monkeypatch.setattr(m.settings, "coloc_listing_url", "http://c")
    fake = _app(search="SEARCH", coloc_listing="COLOC")
    client, path = _resolve_upstream(fake, "/api/v1/listings", "GET")
    assert client == "SEARCH" and path == "/listings"


def test_listings_writes_and_detail_route_to_coloc_listing(monkeypatch):
    monkeypatch.setattr(m.settings, "search_url", "http://s")
    monkeypatch.setattr(m.settings, "coloc_listing_url", "http://c")
    fake = _app(search="SEARCH", coloc_listing="COLOC")
    assert _resolve_upstream(fake, "/api/v1/listings", "POST") == ("COLOC", "/listings")
    assert _resolve_upstream(fake, "/api/v1/listings/abc123", "GET") == ("COLOC", "/listings/abc123")
    assert _resolve_upstream(fake, "/api/v1/listings/abc123/approve", "POST") == (
        "COLOC", "/listings/abc123/approve")
    assert _resolve_upstream(fake, "/api/v1/me/listings", "GET") == ("COLOC", "/me/listings")


def test_unmapped_when_disabled(monkeypatch):
    monkeypatch.setattr(m.settings, "coloc_listing_url", None)
    monkeypatch.setattr(m.settings, "search_url", None)
    fake = _app()
    client, _ = _resolve_upstream(fake, "/api/v1/listings", "GET")
    assert client is None
