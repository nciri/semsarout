"""Séjours courte durée : back-office de l'agence et enregistrement du voyageur par lien."""
from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app():
    return SimpleNamespace(state=SimpleNamespace(staymanager="STAY", listing="LISTING"))


def test_le_backoffice_des_sejours_va_au_staymanager(monkeypatch):
    monkeypatch.setattr(m.settings, "staymanager_url", "http://staymanager")
    for path in ("/api/v1/backoffice/sejours", "/api/v1/backoffice/sejours/apercu",
                 "/api/v1/backoffice/sejours/calendriers", "/api/v1/backoffice/sejours/menage",
                 "/api/v1/backoffice/sejours/messages/modeles"):
        assert _resolve_upstream(_app(), path, "GET") == ("STAY", path.replace("/api/v1", "", 1))


def test_le_lien_d_enregistrement_est_public_et_va_au_staymanager(monkeypatch):
    monkeypatch.setattr(m.settings, "staymanager_url", "http://staymanager")
    assert _resolve_upstream(_app(), "/api/v1/sejours/enregistrement/jeton", "GET") == (
        "STAY", "/sejours/enregistrement/jeton")
    assert _resolve_upstream(_app(), "/api/v1/sejours/enregistrement/jeton/voyageurs", "POST") == (
        "STAY", "/sejours/enregistrement/jeton/voyageurs")
