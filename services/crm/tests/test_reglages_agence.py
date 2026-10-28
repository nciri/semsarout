"""Réglages d'exploitation de l'agence, appliqués pour de bon : affectation automatique
des leads et délai de rappel avant visite.
"""
from datetime import datetime, timedelta

import pytest
from semsar_common import get_settings

from app import agency_client, users_client
from app.leads_assign import auto_assign
from app.models import Lead, Visit

AGENCY = 1
TOKEN = {"x-internal-token": get_settings().internal_token}


@pytest.fixture(autouse=True)
def _no_cache():
    agency_client.reset_cache()
    yield
    agency_client.reset_cache()


def _reglages(monkeypatch, **values):
    base = {"lead_auto_assign": False, "visit_reminder_hours": 24}
    monkeypatch.setattr(agency_client, "settings_of", lambda agency_id: {**base, **values})


def _agents(monkeypatch, *ids):
    monkeypatch.setattr(users_client, "agents", lambda agency_id: [{"id": i} for i in ids])


def _lead(db, agency_id=AGENCY, assigned=None, status="new"):
    lead = Lead(name="Contact", agency_id=agency_id, status=status, assigned_to_id=assigned)
    db.add(lead)
    db.commit()
    return lead


def test_sans_le_reglage_le_lead_reste_dans_le_pot_commun(db_session, monkeypatch):
    _reglages(monkeypatch, lead_auto_assign=False)
    _agents(monkeypatch, 7, 8)
    lead = Lead(name="Contact", agency_id=AGENCY, status="new")
    assert auto_assign(db_session, lead) is None
    assert lead.assigned_to_id is None


def test_le_lead_va_a_lagent_qui_en_suit_le_moins(db_session, monkeypatch):
    _reglages(monkeypatch, lead_auto_assign=True)
    _agents(monkeypatch, 7, 8)
    _lead(db_session, assigned=7)
    _lead(db_session, assigned=7)
    _lead(db_session, assigned=8)

    lead = Lead(name="Nouveau", agency_id=AGENCY, status="new")
    assert auto_assign(db_session, lead) == 8          # 8 en suit un, 7 en suit deux


def test_les_leads_clos_ne_chargent_plus_un_agent(db_session, monkeypatch):
    _reglages(monkeypatch, lead_auto_assign=True)
    _agents(monkeypatch, 7, 8)
    _lead(db_session, assigned=7, status="converted")
    _lead(db_session, assigned=8)

    lead = Lead(name="Nouveau", agency_id=AGENCY, status="new")
    assert auto_assign(db_session, lead) == 7


def test_un_lead_deja_affecte_ou_sans_agence_nest_pas_touche(db_session, monkeypatch):
    _reglages(monkeypatch, lead_auto_assign=True)
    _agents(monkeypatch, 7, 8)

    deja = Lead(name="Suivi", agency_id=AGENCY, status="new", assigned_to_id=9)
    assert auto_assign(db_session, deja) is None and deja.assigned_to_id == 9

    particulier = Lead(name="Hors agence", agency_id=None, status="new")
    assert auto_assign(db_session, particulier) is None


def test_le_rappel_suit_le_delai_regle_par_lagence(client, db_session, monkeypatch):
    """À 2 h de délai, une visite dans 12 h n'est pas encore à rappeler."""
    now = datetime.utcnow()
    db_session.add(Visit(id=1, agency_id=AGENCY, scheduled_at=now + timedelta(hours=12),
                         status="confirmed"))
    db_session.add(Visit(id=2, agency_id=AGENCY, scheduled_at=now + timedelta(minutes=90),
                         status="confirmed"))
    db_session.commit()

    _reglages(monkeypatch, visit_reminder_hours=2)
    due = client.get("/internal/visits/due-reminders", headers=TOKEN).json()["visits"]
    assert [v["id"] for v in due] == [2]

    _reglages(monkeypatch, visit_reminder_hours=24)
    due = client.get("/internal/visits/due-reminders", headers=TOKEN).json()["visits"]
    assert sorted(v["id"] for v in due) == [1, 2]
    assert due[0]["agency_id"] == AGENCY     # l'ordonnanceur choisit le SMTP de l'agence
