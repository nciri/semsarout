from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import _can_delete_wo, app
from semsar_auth import Principal


def _principal(*roles: str, superadmin: bool = False) -> Principal:
    return Principal(sub="10", roles=list(roles), agency_id=1, is_superadmin=superadmin)


def test_qui_peut_retirer_un_bon_de_travaux():
    """Le rôle ne décide qu'une fois l'artisan mobilisé ; un bon terminé n'est jamais retiré."""
    agent = _principal("agency_agent")
    patron = _principal("agency_admin")
    for status in ("requested", "cancelled"):
        assert _can_delete_wo(agent, SimpleNamespace(status=status))
    for status in ("scheduled", "in_progress"):
        assert not _can_delete_wo(agent, SimpleNamespace(status=status))
        assert _can_delete_wo(patron, SimpleNamespace(status=status))
    # Le coût final est une trace comptable : même le super-admin ne l'efface pas d'ici.
    assert not _can_delete_wo(_principal(superadmin=True), SimpleNamespace(status="done"))


def test_health_ok():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
