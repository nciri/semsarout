"""Dossier d'achat de l'acquéreur : hors back-office, mais servi par crm."""
from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app():
    return SimpleNamespace(state=SimpleNamespace(crm="CRM", listing="LISTING"))


def test_le_dossier_et_ses_pieces_vont_au_crm(monkeypatch):
    monkeypatch.setattr(m.settings, "crm_url", "http://crm")
    assert _resolve_upstream(_app(), "/api/v1/buyer-dossier", "GET") == ("CRM", "/buyer-dossier")
    assert _resolve_upstream(_app(), "/api/v1/buyer-dossier/42/documents", "POST") == (
        "CRM", "/buyer-dossier/42/documents")
    assert _resolve_upstream(_app(), "/api/v1/buyer-dossier/42/documents/7", "GET") == (
        "CRM", "/buyer-dossier/42/documents/7")
