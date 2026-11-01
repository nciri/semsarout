from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import _can_delete_wo, _status_change_refusal, _wo_is_sealed, app
from semsar_auth import Principal


def _principal(*roles: str, superadmin: bool = False) -> Principal:
    return Principal(sub="10", roles=list(roles), agency_id=1, is_superadmin=superadmin)


def _wo(status: str, *, completed_at=None, cost_final=None):
    return SimpleNamespace(status=status, completed_at=completed_at, cost_final=cost_final)


def test_qui_peut_retirer_un_bon_de_travaux():
    """Le rôle ne décide qu'une fois l'artisan mobilisé ; un bon terminé n'est jamais retiré."""
    agent = _principal("agency_agent")
    patron = _principal("agency_admin")
    for status in ("requested", "cancelled"):
        assert _can_delete_wo(agent, _wo(status))
    for status in ("scheduled", "in_progress"):
        assert not _can_delete_wo(agent, _wo(status))
        assert _can_delete_wo(patron, _wo(status))
    # Le coût final est une trace comptable : même le super-admin ne l'efface pas d'ici.
    assert not _can_delete_wo(_principal(superadmin=True), _wo("done"))
    # Et le statut courant ne suffit pas : un travail déjà clos ou chiffré reste protégé.
    assert not _can_delete_wo(patron, _wo("requested", completed_at=datetime(2026, 10, 1)))
    assert not _can_delete_wo(patron, _wo("requested", cost_final=Decimal("450")))


def test_les_traces_du_travail_acheve_sont_scellees():
    """Sans cela, effacer le coût final rendrait la protection du retrait décorative."""
    assert not _wo_is_sealed(_wo("requested"))
    assert _wo_is_sealed(_wo("requested", cost_final=Decimal("450")))
    assert _wo_is_sealed(_wo("cancelled", completed_at=datetime(2026, 10, 1)))


def test_le_changement_de_statut_ne_contourne_pas_le_retrait():
    agent = _principal("agency_agent")
    patron = _principal("agency_admin")
    assert _status_change_refusal(agent, _wo("requested"), "parti_en_vacances") is not None
    # Rouvrir un bon terminé rendrait n'importe quel rôle maître de sa suppression.
    assert _status_change_refusal(patron, _wo("done"), "requested") is not None
    # Reculer ou annuler un bon engagé relève de l'administration, comme son retrait.
    assert _status_change_refusal(agent, _wo("scheduled"), "cancelled") is not None
    assert _status_change_refusal(patron, _wo("scheduled"), "cancelled") is None
    # Avancer reste le cours normal du travail.
    assert _status_change_refusal(agent, _wo("scheduled"), "in_progress") is None
    assert _status_change_refusal(agent, _wo("in_progress"), "done") is None


def test_health_ok():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
