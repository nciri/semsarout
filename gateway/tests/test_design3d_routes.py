from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app(**states):
    return SimpleNamespace(state=SimpleNamespace(**states))


def test_design3d_projects_routes_to_design3d(monkeypatch):
    monkeypatch.setattr(m.settings, "design3d_url", "http://d3d")
    fake = _app(design3d="DESIGN3D")
    assert _resolve_upstream(fake, "/api/v1/design3d/projects", "GET") == (
        "DESIGN3D", "/design3d/projects")


def test_design3d_public_routes_to_design3d(monkeypatch):
    monkeypatch.setattr(m.settings, "design3d_url", "http://d3d")
    fake = _app(design3d="DESIGN3D")
    assert _resolve_upstream(fake, "/api/v1/public/design3d/projects/x", "GET") == (
        "DESIGN3D", "/public/design3d/projects/x")


def test_design3d_not_routed_when_unconfigured(monkeypatch):
    monkeypatch.setattr(m.settings, "design3d_url", None)
    fake = _app(design3d=None)
    assert _resolve_upstream(fake, "/api/v1/design3d/projects", "GET") == (None, "/api/v1/design3d/projects")
