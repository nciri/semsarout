from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app():
    return SimpleNamespace(state=SimpleNamespace(listing="LISTING", geo="GEO", search="SEARCH"))


def test_backoffice_properties_insights_routes_to_listing(monkeypatch):
    monkeypatch.setattr(m.settings, "listing_url", "http://listing")
    assert _resolve_upstream(_app(), "/api/v1/backoffice/properties/insights", "GET") == (
        "LISTING", "/backoffice/properties/insights")


def test_backoffice_properties_insights_is_read_only(monkeypatch):
    monkeypatch.setattr(m.settings, "listing_url", "http://listing")
    upstream, _ = _resolve_upstream(_app(), "/api/v1/backoffice/properties/insights", "DELETE")
    assert upstream != "LISTING"
