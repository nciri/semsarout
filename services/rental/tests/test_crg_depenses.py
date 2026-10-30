import httpx
import pytest

from app import depenses
from app.main import _crg_aggregate
from app.models import Lease, Mandate, RentPeriod


def _mandat(db, property_id, fee_pct, agency_id=4):
    mnd = Mandate(reference=f"MND-{property_id}", agency_id=agency_id, property_id=property_id,
                  landlord_client_id=1, fee_percent=fee_pct, status="active")
    db.add(mnd)
    db.commit()
    return mnd


def _loyer_encaisse(db, mnd, y, m, montant):
    lease = Lease(reference=f"BAIL-{mnd.id}", mandate_id=mnd.id, property_id=mnd.property_id,
                  agency_id=mnd.agency_id, rent_amount=montant)
    db.add(lease)
    db.commit()
    db.add(RentPeriod(lease_id=lease.id, agency_id=mnd.agency_id, year=y, month=m,
                      rent_amount=montant, total_amount=montant, paid_amount=montant,
                      status="paid"))
    db.commit()


def test_le_net_retire_les_depenses(db_session, monkeypatch):
    mnd = _mandat(db_session, property_id=7, fee_pct=8)
    _loyer_encaisse(db_session, mnd, 2026, 9, montant=6000)
    appels = []

    def _imputables(ids, mode, agency_id, lease_id=None):
        appels.append((ids, mode, agency_id))
        return [{"id": 4, "title": "Chauffe-eau", "cost_final": 1200,
                 "completed_at": "2026-09-14T00:00:00", "property_id": 7}]

    monkeypatch.setattr(depenses, "imputables", _imputables)
    agg = _crg_aggregate(db_session, mnd, 2026, 9)
    assert agg["rent_collected"] == 6000 and agg["fees"] == 480
    assert agg["expenses"] == 1200 and agg["net"] == 4320
    assert [l["id"] for l in agg["expense_lines"]] == [4]
    assert appels == [([7], "crg_expense", 4)]


def test_directory_injoignable_ne_produit_pas_un_net_faux(db_session, monkeypatch):
    mnd = _mandat(db_session, property_id=7, fee_pct=8)
    _loyer_encaisse(db_session, mnd, 2026, 9, montant=6000)

    def _tombe(ids, mode, agency_id, lease_id=None):
        raise depenses.DepensesIndisponibles("directory muet")

    monkeypatch.setattr(depenses, "imputables", _tombe)
    with pytest.raises(depenses.DepensesIndisponibles):
        _crg_aggregate(db_session, mnd, 2026, 9)


class _Rep:
    def __init__(self, status=200, body=None, boom=False):
        self.status_code, self._body, self._boom = status, body, boom

    def json(self):
        if self._boom:
            raise ValueError("corps illisible")
        return self._body


@pytest.mark.parametrize("rep", [_Rep(500, {"work_orders": []}), _Rep(400, {}),
                                 _Rep(200, boom=True), _Rep(200, {"autre": []})])
def test_imputables_ne_rend_jamais_une_liste_vide_en_cas_d_echec(monkeypatch, rep):
    monkeypatch.setattr(depenses.httpx, "get", lambda *a, **k: rep)
    with pytest.raises(depenses.DepensesIndisponibles):
        depenses.imputables([7], "crg_expense", 4)


def test_imputables_reseau_coupe(monkeypatch):
    def _coupe(*a, **k):
        raise httpx.ConnectError("refus")

    monkeypatch.setattr(depenses.httpx, "get", _coupe)
    with pytest.raises(depenses.DepensesIndisponibles):
        depenses.imputables([7], "crg_expense", 4)


def test_imputables_transmet_agence_et_perimetre(monkeypatch):
    vu = {}

    def _get(url, params, headers, timeout):
        vu.update(url=url, params=params, headers=headers, timeout=timeout)
        return _Rep(200, {"work_orders": [{"id": 4}]})

    monkeypatch.setattr(depenses.httpx, "get", _get)
    assert depenses.imputables([7, 8], "crg_expense", 4, lease_id=3) == [{"id": 4}]
    assert vu["url"].endswith("/internal/work-orders/chargeable")
    assert vu["params"] == {"property_ids": "7,8", "mode": "crg_expense", "agency_id": 4,
                            "lease_id": 3}
    assert "x-internal-token" in vu["headers"]


def test_estampiller(monkeypatch):
    vu = {}

    def _post(url, json, headers, timeout):
        vu.update(url=url, json=json)
        return _Rep(200, {"stamped": 2})

    monkeypatch.setattr(depenses.httpx, "post", _post)
    assert depenses.estampiller([1, 2], "crg:12", 4) == 2
    assert vu["json"] == {"ids": [1, 2], "ref": "crg:12", "agency_id": 4}


def test_estampiller_echec_leve(monkeypatch):
    monkeypatch.setattr(depenses.httpx, "post", lambda *a, **k: _Rep(500, {}))
    with pytest.raises(depenses.DepensesIndisponibles):
        depenses.estampiller([1], "crg:12", 4)
