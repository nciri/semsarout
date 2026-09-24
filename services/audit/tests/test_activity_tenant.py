"""Cloisonnement du journal d'activité : chaque produit ne voit que le sien."""
from datetime import datetime

from app.models import ActivityLog
from tests.conftest import make_client


def _ligne(db, tenant, action):
    db.add(ActivityLog(tenant=tenant, user_id=10, action=action, entity_type="listing",
                       entity_id=1, created_at=datetime(2026, 9, 24, 10, 0)))
    db.commit()


def test_le_backoffice_m3a_ne_voit_pas_lactivite_semsarout(db_session):
    _ligne(db_session, "semsar", "property_published")
    _ligne(db_session, "m3a-l3achrane", "listing_approved")

    client = make_client(db_session, tenant="m3a-l3achrane")
    actions = [a["action"] for a in client.get("/admin/activity").json()["items"]]
    assert actions == ["listing_approved"]


def test_un_appelant_sans_en_tete_voit_le_journal_semsarout(db_session):
    """Le BFF semsarout ne pose pas l'en-tête : son journal ne doit pas changer."""
    _ligne(db_session, "semsar", "property_published")
    _ligne(db_session, "m3a-l3achrane", "listing_approved")

    client = make_client(db_session)
    actions = [a["action"] for a in client.get("/admin/activity").json()["items"]]
    assert actions == ["property_published"]


def test_journal_reserve_au_super_admin(db_session):
    client = make_client(db_session, is_superadmin=False)
    assert client.get("/admin/activity").status_code == 403


def test_une_ligne_projetee_sans_tenant_reste_semsarout(db_session, monkeypatch):
    """Événements émis avant l'ajout du tenant : ils appartiennent tous à semsarout."""
    import app.worker as worker

    monkeypatch.setattr(worker, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)
    worker._handle("audit.logged", {"id": 1, "action": "role_updated", "entity_type": "role",
                                    "created_at": "2026-09-24T10:00:00"}, "msg-1")
    assert db_session.get(ActivityLog, 1).tenant == "semsar"
