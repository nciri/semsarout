"""Prise de rendez-vous depuis une annonce : sous /properties/{id}, mais servie par crm."""
from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app():
    return SimpleNamespace(state=SimpleNamespace(crm="CRM", listing="LISTING"))


def test_creneaux_et_reservation_vont_au_crm(monkeypatch):
    monkeypatch.setattr(m.settings, "crm_url", "http://crm")
    monkeypatch.setattr(m.settings, "listing_url", "http://listing")
    assert _resolve_upstream(_app(), "/api/v1/properties/12/available-slots", "GET") == (
        "CRM", "/properties/12/available-slots")
    assert _resolve_upstream(_app(), "/api/v1/properties/12/book-visit", "POST") == (
        "CRM", "/properties/12/book-visit")


def test_le_detail_dune_annonce_reste_chez_listing(monkeypatch):
    """La règle de l'agenda ne doit pas capter /properties/{id}."""
    monkeypatch.setattr(m.settings, "crm_url", "http://crm")
    monkeypatch.setattr(m.settings, "listing_url", "http://listing")
    assert _resolve_upstream(_app(), "/api/v1/properties/12", "GET") == ("LISTING", "/properties/12")
