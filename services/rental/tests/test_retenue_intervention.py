from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from semsar_auth import Principal, get_principal

from app import depenses
from app.db import get_db
from app.main import app
from app.models import DeductionLine, DepositSettlement, Lease

AGENCY = 4


@pytest.fixture
def client(db_session):
    """Le décompte est réservé à l'agence du bail (gating `rental`)."""
    agent = Principal(sub="3", roles=["agent"], agency_id=AGENCY, is_superadmin=False,
                      features=["rental"], claims={})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: agent
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _bail_et_decompte(db, deposit, status="draft"):
    bail = Lease(reference="BAIL-RET", property_id=7, agency_id=AGENCY, rent_amount=5000,
                 deposit_amount=deposit)
    db.add(bail)
    db.commit()
    dec = DepositSettlement(lease_id=bail.id, agency_id=AGENCY, deposit_amount=deposit,
                            status=status)
    db.add(dec)
    db.commit()
    return bail, dec


def _ligne(db, dec, work_order_id, amount):
    db.add(DeductionLine(settlement_id=dec.id, label="Retenue", amount=amount,
                         work_order_id=work_order_id))
    db.commit()


def _vitre(wo_id=4, cout=600):
    return {"id": wo_id, "title": "Vitre salon", "cost_final": cout,
            "completed_at": "2026-10-02T00:00:00"}


def test_les_suggestions_ne_proposent_pas_une_retenue_deja_posee(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000)
    appels = []

    def _imputables(ids, mode, agency_id, lease_id=None):
        appels.append((ids, mode, agency_id, lease_id))
        return [_vitre(4), {"id": 5, "title": "Serrure", "cost_final": 300,
                            "completed_at": "2026-10-03T00:00:00"}]

    monkeypatch.setattr(depenses, "imputables", _imputables)
    _ligne(db_session, dec, work_order_id=5, amount=300)
    r = client.get(f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions")
    assert [s["work_order_id"] for s in r.json()["suggestions"]] == [4]
    assert appels == [([7], "deposit_deduction", AGENCY, bail.id)]


def test_une_intervention_dun_autre_bail_nest_pas_proposee(client, db_session, monkeypatch):
    """Le filtre par bail est délégué à directory : on vérifie qu'il lui est bien demandé."""
    bail, dec = _bail_et_decompte(db_session, deposit=5000)
    autre = Lease(reference="BAIL-AUTRE", property_id=7, agency_id=AGENCY, rent_amount=5000)
    db_session.add(autre)
    db_session.commit()
    base = {bail.id: [_vitre(4)], autre.id: [_vitre(9)]}
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None: base.get(lease_id, []))
    r = client.get(f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions")
    assert [s["work_order_id"] for s in r.json()["suggestions"]] == [4]


def test_directory_injoignable_ne_montre_pas_une_liste_vide(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000)

    def _tombe(ids, mode, agency_id, lease_id=None):
        raise depenses.DepensesIndisponibles("directory muet")

    monkeypatch.setattr(depenses, "imputables", _tombe)
    assert client.get(
        f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions").status_code == 503


def test_accepter_une_suggestion_cree_la_ligne_et_estampille(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000)
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None: [_vitre(4)])
    vus = []
    monkeypatch.setattr(depenses, "estampiller",
                        lambda ids, ref, agency_id: vus.append((ids, ref, agency_id)) or len(ids))
    r = client.post(f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions/4/accept")
    assert r.status_code == 201
    db_session.refresh(dec)
    assert dec.total_deductions == Decimal("600") and dec.refunded_amount == Decimal("4400")
    assert vus == [([4], f"settlement:{dec.id}", AGENCY)]
    # Deuxième acceptation : refusée, pas de doublon.
    assert client.post(
        f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions/4/accept").status_code == 409
    assert db_session.query(DeductionLine).filter_by(settlement_id=dec.id).count() == 1


def test_estampillage_en_echec_ne_laisse_aucune_ligne(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000)
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None: [_vitre(4)])

    def _tombe(ids, ref, agency_id):
        raise depenses.DepensesIndisponibles("directory muet")

    monkeypatch.setattr(depenses, "estampiller", _tombe)
    r = client.post(f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions/4/accept")
    assert r.status_code == 503
    assert db_session.query(DeductionLine).filter_by(settlement_id=dec.id).count() == 0


def test_une_intervention_estampillee_ailleurs_est_refusee(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000)
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None: [_vitre(4)])
    monkeypatch.setattr(depenses, "estampiller", lambda ids, ref, agency_id: 0)
    r = client.post(f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions/4/accept")
    assert r.status_code == 409
    assert db_session.query(DeductionLine).filter_by(settlement_id=dec.id).count() == 0


def test_un_decompte_finalise_n_accepte_plus_rien(client, db_session, monkeypatch):
    bail, dec = _bail_et_decompte(db_session, deposit=5000, status="finalized")
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None: [_vitre(4)])
    assert client.post(
        f"/backoffice/gestion-locative/settlements/{dec.id}/suggestions/4/accept").status_code == 403
