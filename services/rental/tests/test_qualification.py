"""Qualification d'une candidature : taux d'effort, garant, pièces obligatoires."""
import pytest
from fastapi.testclient import TestClient

from semsar_auth import Principal, get_principal

from app.db import get_db
from app.main import app
from app.models import ApplicationDocument, PropertyRO, TenantApplication
from app.qualification import assess, monthly_rent

AGENCY = 1


@pytest.fixture
def agency_client(db_session):
    agent = Principal(sub="3", roles=["agent"], agency_id=AGENCY, is_superadmin=False,
                      features=["rental"], claims={})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: agent
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


BASE = dict(rent=5000.0, monthly_income=15000, guarantor_income=None, guarantor_name=None,
            documents=[])


def test_taux_deffort_et_verdict():
    assert assess(**{**BASE, "monthly_income": 15000})["effort_rate"] == 33.3
    assert assess(**{**BASE, "monthly_income": 20000})["verdict"] == "solid"       # 25 %
    assert assess(**{**BASE, "monthly_income": 13000})["verdict"] == "acceptable"  # 38,5 %
    assert assess(**{**BASE, "monthly_income": 9000})["verdict"] == "weak"         # 55,6 %


def test_sans_revenu_aucun_verdict_nest_invente():
    out = assess(**{**BASE, "monthly_income": None})
    assert out["effort_rate"] is None and out["verdict"] == "unknown"


def test_un_garant_solide_rattrape_un_taux_deffort_trop_haut():
    """Trois loyers de revenu côté garant : la caution tient, sans rendre le dossier bon."""
    out = assess(**{**BASE, "monthly_income": 9000, "guarantor_income": 15000,
                    "guarantor_name": "Hassan Alaoui"})
    assert out["guarantor_covers_rent"] is True
    assert out["verdict"] == "acceptable"

    faible = assess(**{**BASE, "monthly_income": 9000, "guarantor_income": 8000,
                       "guarantor_name": "Hassan Alaoui"})
    assert faible["guarantor_covers_rent"] is False and faible["verdict"] == "weak"


def test_pieces_obligatoires_manquantes():
    out = assess(**{**BASE, "documents": [("cin", "validated"), ("avis_impot", "received")]})
    assert out["missing_documents"] == ["bulletin_salaire", "contrat_travail"]
    assert out["documents_complete"] is False

    complet = assess(**{**BASE, "documents": [("cin", "received"), ("bulletin_salaire", "received"),
                                              ("contrat_travail", "validated")]})
    assert complet["missing_documents"] == [] and complet["documents_complete"] is True


def test_une_piece_rejetee_ne_compte_pas_et_le_garant_ajoute_la_sienne():
    out = assess(**{**BASE, "guarantor_name": "Hassan Alaoui",
                    "documents": [("cin", "rejected"), ("bulletin_salaire", "received"),
                                  ("contrat_travail", "received")]})
    assert out["required_documents"][-1] == "garant"
    assert out["missing_documents"] == ["cin", "garant"]


def test_loyer_ramene_au_mois():
    assert monthly_rent(5000, "month") == 5000
    assert monthly_rent(500, "day") == 15000
    assert monthly_rent(None, "month") is None
    assert monthly_rent(0, "month") is None


def test_la_candidature_expose_sa_qualification(agency_client, db_session):
    db_session.add(PropertyRO(id=7, title="Appartement Anfa", city="Casablanca",
                              price=6000, price_period="month"))
    a = TenantApplication(id=1, property_id=7, agency_id=AGENCY, applicant_name="Salma Bennani",
                          monthly_income=24000, status="received")
    db_session.add(a)
    db_session.add(ApplicationDocument(application_id=1, doc_type="cin", status="received"))
    db_session.commit()

    q = agency_client.get("/backoffice/gestion-locative/applications/1").json()["qualification"]
    assert q["rent"] == 6000 and q["effort_rate"] == 25.0
    assert q["verdict"] == "solid"
    assert q["missing_documents"] == ["bulletin_salaire", "contrat_travail"]


def test_une_piece_au_format_executable_est_refusee(agency_client, db_session):
    """Relue dans le navigateur, une pièce text/html exécuterait du script sur notre origine."""
    db_session.add(TenantApplication(id=2, property_id=7, agency_id=AGENCY,
                                     applicant_name="Salma Bennani", status="received"))
    db_session.commit()
    refus = agency_client.post(
        "/backoffice/gestion-locative/applications/2/documents?doc_type=cin&filename=x.html",
        content=b"<script>alert(1)</script>", headers={"content-type": "text/html"})
    assert refus.status_code == 400
    assert db_session.query(ApplicationDocument).count() == 0
