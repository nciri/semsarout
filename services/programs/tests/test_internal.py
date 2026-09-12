"""Point d'entrée interne de résolution d'un lot — consommé par design3d.

design3d vérifie à la création d'un projet que la cible relève du périmètre de son
auteur ; sans cette route, la vérification n'aurait pu couvrir que les biens et le
détournement de fiche publique serait resté ouvert pour les lots de programme.
"""
from app.models import Program, ProgramLot, ProgramPlan

TOKEN = {"x-internal-token": "test-internal-token"}


def _lot(db_session, agency_id=9, created_by_id=1):
    p = Program(name="Résidence A", slug="residence-a", agency_id=agency_id, created_by_id=created_by_id)
    db_session.add(p)
    db_session.flush()
    plan = ProgramPlan(program_id=p.id, name="Masse")
    db_session.add(plan)
    db_session.flush()
    lot = ProgramLot(program_id=p.id, plan_id=plan.id, reference="L1")
    db_session.add(lot)
    db_session.commit()
    return lot


def test_lot_owner_requires_the_internal_token(client, db_session):
    lot = _lot(db_session)
    assert client.get(f"/internal/program-lots/{lot.id}/owner").status_code == 403
    assert client.get(f"/internal/program-lots/{lot.id}/owner", headers={"x-internal-token": "faux"}).status_code == 403


def test_lot_owner_returns_agency_and_author(client, db_session):
    lot = _lot(db_session, agency_id=9, created_by_id=1)
    r = client.get(f"/internal/program-lots/{lot.id}/owner", headers=TOKEN)
    assert r.status_code == 200
    assert r.json() == {"owner_id": 1, "agency_id": 9}


def test_unknown_lot_yields_no_owner(client, db_session):
    r = client.get("/internal/program-lots/424242/owner", headers=TOKEN)
    assert r.status_code == 200
    assert r.json() == {"owner_id": None, "agency_id": None}
