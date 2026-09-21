"""Retrait de la présélection d'une candidature (clic par erreur, candidat qui ne l'est plus)."""
import pytest
from fastapi.testclient import TestClient

from semsar_auth import Principal, get_principal

from app.db import get_db
from app.main import app
from app.models import TenantApplication

AGENCY = 5


@pytest.fixture
def agency_client(db_session):
    agent = Principal(sub="3", roles=["agent"], agency_id=AGENCY, is_superadmin=False,
                      features=["rental"], claims={})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: agent
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _application(db_session, status, agency_id=AGENCY):
    a = TenantApplication(property_id=1, agency_id=agency_id, applicant_name="Salma", status=status)
    db_session.add(a)
    db_session.commit()
    return a.id


def _url(app_id, action):
    return f"/backoffice/gestion-locative/applications/{app_id}/{action}"


def test_shortlist_then_unshortlist_returns_to_reviewing(agency_client, db_session):
    app_id = _application(db_session, "received")
    assert agency_client.post(_url(app_id, "shortlist")).json()["status"] == "shortlist"

    resp = agency_client.post(_url(app_id, "unshortlist"))

    assert resp.status_code == 200
    # `reviewing`, pas `received` : la candidature a été lue, et le locataire voit son statut.
    assert resp.json()["status"] == "reviewing"
    # Elle reste présélectionnable ensuite.
    assert agency_client.post(_url(app_id, "shortlist")).json()["status"] == "shortlist"


@pytest.mark.parametrize("status", ["received", "reviewing", "accepted", "rejected", "withdrawn"])
def test_unshortlist_refused_when_not_shortlisted(agency_client, db_session, status):
    app_id = _application(db_session, status)
    resp = agency_client.post(_url(app_id, "unshortlist"))
    assert resp.status_code == 400
    assert db_session.get(TenantApplication, app_id).status == status


def test_unshortlist_scoped_to_agency(agency_client, db_session):
    app_id = _application(db_session, "shortlist", agency_id=AGENCY + 1)
    assert agency_client.post(_url(app_id, "unshortlist")).status_code == 404
    assert db_session.get(TenantApplication, app_id).status == "shortlist"
