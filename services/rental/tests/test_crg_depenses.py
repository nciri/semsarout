from datetime import datetime
from decimal import Decimal
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from semsar_auth import Principal, get_principal

from app import depenses, main
from app.db import get_db
from app.main import _crg_aggregate, app
from app.models import CrgReport, Lease, Mandate, RentPeriod

AGENCY = 4
TOKEN = main.settings.internal_token


@pytest.fixture
def client(db_session):
    """Le back-office du CRG est réservé à l'agence du mandat (gating `rental`)."""
    agent = Principal(sub="3", roles=["agent"], agency_id=AGENCY, is_superadmin=False,
                      features=["rental"], claims={})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: agent
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _mandat(db, property_id, fee_pct, agency_id=AGENCY):
    mnd = Mandate(reference=f"MND-{property_id}", agency_id=agency_id, property_id=property_id,
                  landlord_client_id=1, fee_percent=fee_pct, status="active")
    db.add(mnd)
    db.commit()
    return mnd


def _loyer_encaisse(db, mnd, y, m, montant):
    lease = Lease(reference=f"BAIL-{mnd.id}-{uuid.uuid4().hex[:6]}", mandate_id=mnd.id,
                  property_id=mnd.property_id,
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
        return _Rep(200, {"work_orders": [{"id": 4, "cost_final": 10}]})

    monkeypatch.setattr(depenses.httpx, "get", _get)
    assert depenses.imputables([7, 8], "crg_expense", 4, lease_id=3) == [{"id": 4, "cost_final": 10}]
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


@pytest.mark.parametrize("corps", [["pas", "un", "dict"], "texte"])
def test_imputables_corps_qui_n_est_pas_un_objet(monkeypatch, corps):
    monkeypatch.setattr(depenses.httpx, "get", lambda *a, **k: _Rep(200, corps))
    with pytest.raises(depenses.DepensesIndisponibles):
        depenses.imputables([7], "crg_expense", 4)


@pytest.mark.parametrize("ligne", [{"id": 1, "cost_final": None}, {"id": 1}, {"id": 1, "cost_final": "abc"}, "x"])
def test_imputables_montant_illisible(monkeypatch, ligne):
    monkeypatch.setattr(depenses.httpx, "get",
                        lambda *a, **k: _Rep(200, {"work_orders": [ligne]}))
    with pytest.raises(depenses.DepensesIndisponibles):
        depenses.imputables([7], "crg_expense", 4)


def test_due_crg_un_mandat_muet_n_arrete_pas_les_autres(db_session, monkeypatch):
    y, m = main._prev_period(datetime.utcnow())
    muet = _mandat(db_session, property_id=7, fee_pct=8)
    ok = _mandat(db_session, property_id=8, fee_pct=8)
    sans_loyer = _mandat(db_session, property_id=9, fee_pct=8)
    _loyer_encaisse(db_session, muet, y, m, montant=6000)
    _loyer_encaisse(db_session, ok, y, m, montant=6000)
    vus = []

    def _imputables(ids, mode, agency_id, lease_id=None):
        vus.append(ids)
        if ids == [7]:
            raise depenses.DepensesIndisponibles("directory muet")
        return []

    monkeypatch.setattr(depenses, "imputables", _imputables)
    rep = main.internal_mandates_due_crg(x_internal_token=main.settings.internal_token,
                                         db=db_session)
    assert [r["mandate_id"] for r in rep["drafts"]] == [ok.id]
    assert [7] in vus and [9] not in vus  # le mandat sans loyer n'interroge pas directory
    assert sans_loyer.id not in [r["mandate_id"] for r in rep["drafts"]]


# --- Cycle brouillon → validé → envoyé ------------------------------------------------


def _brouillon(client, db, monkeypatch, loyer, depenses_):
    """Crée un mandat avec `loyer` encaissé sur la période due, puis le brouillon de CRG."""
    y, m = main._prev_period(datetime.utcnow())
    mnd = _mandat(db, property_id=7, fee_pct=8)
    _loyer_encaisse(db, mnd, y, m, montant=loyer)
    lignes = [{"id": i, "title": f"Intervention {i}", "cost_final": cout,
               "artisan_name": "Plomberie Atlas",
               "completed_at": f"2026-09-{10 + n:02d}T00:00:00", "property_id": 7}
              for n, (i, cout) in enumerate(depenses_)]
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None: lignes)
    r = client.get("/internal/mandates/due-crg", headers={"x-internal-token": TOKEN})
    return r.json()["drafts"][0]["crg_id"]


def _mandat_id(db, crg_id):
    return db.get(CrgReport, crg_id).mandate_id


def test_le_crg_nait_brouillon_et_ne_part_pas_seul(client, db_session, monkeypatch):
    mnd = _mandat(db_session, property_id=7, fee_pct=8)
    y, m = main._prev_period(datetime.utcnow())
    _loyer_encaisse(db_session, mnd, y, m, montant=6000)
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None: [])
    r = client.get("/internal/mandates/due-crg", headers={"x-internal-token": TOKEN})
    crg_id = r.json()["drafts"][0]["crg_id"]
    assert db_session.get(CrgReport, crg_id).status == "draft"
    assert r.json()["drafts"][0]["created"] is True
    # Au passage suivant le brouillon est toujours listé, mais plus comme nouveau.
    r2 = client.get("/internal/mandates/due-crg", headers={"x-internal-token": TOKEN})
    assert [(d["crg_id"], d["created"]) for d in r2.json()["drafts"]] == [(crg_id, False)]
    # Tant qu'il n'est pas validé, rien n'est à envoyer.
    assert client.get("/internal/mandates/due-crg-send",
                      headers={"x-internal-token": TOKEN}).json()["reports"] == []


def test_la_validation_ecarte_une_ligne_et_recalcule(client, db_session, monkeypatch):
    # 6000 de loyer, 8 % d'honoraires, deux dépenses de 1200 et 300.
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000,
                        depenses_=[(4, 1200), (5, 300)])
    r = client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate",
                    json={"excluded_work_order_ids": [5]})
    assert r.status_code == 200
    crg = db_session.get(CrgReport, crg_id)
    assert crg.status == "validated" and crg.expenses == Decimal("1200")
    assert crg.net == Decimal("4320")
    envoyables = client.get("/internal/mandates/due-crg-send",
                            headers={"x-internal-token": TOKEN}).json()["reports"]
    assert [(e["crg_id"], e["expenses"], e["net"]) for e in envoyables] == [(crg_id, 1200.0, 4320.0)]


def test_un_second_envoi_n_estampille_pas_une_deuxieme_fois(client, db_session, monkeypatch):
    # Deux appels séquentiels : la fixture sqlite est mono-connexion, la vraie concurrence n'y est
    # pas reproductible. Ce qu'on prouve ici est la garde `status == "sent"` qui la couvre côté
    # base ; l'`UPDATE … WHERE status = 'validated'` fait le reste en production.
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000, depenses_=[(4, 1200)])
    client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate", json={})
    appels = []
    monkeypatch.setattr(depenses, "estampiller_detail",
                        lambda ids, ref, agency_id: (appels.append((tuple(ids), ref, agency_id))
                                                     or (len(ids), {})))
    h = {"x-internal-token": TOKEN}
    mandate_id = _mandat_id(db_session, crg_id)
    for _ in range(2):
        client.post(f"/internal/mandates/{mandate_id}/crg-sent",
                    json={"crg_id": crg_id}, headers=h)
    # L'agence du mandat est transmise à directory : c'est le seul cloisonnement de cette route.
    assert appels == [((4,), f"crg:{crg_id}", AGENCY)]
    assert db_session.get(CrgReport, crg_id).status == "sent"


def test_un_estampillage_qui_echoue_laisse_le_crg_a_renvoyer(client, db_session, monkeypatch):
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000, depenses_=[(4, 1200)])
    client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate", json={})

    def _tombe(ids, ref, agency_id):
        raise depenses.DepensesIndisponibles("directory muet")

    monkeypatch.setattr(depenses, "estampiller_detail", _tombe)
    mandate_id = _mandat_id(db_session, crg_id)
    r = client.post(f"/internal/mandates/{mandate_id}/crg-sent", json={"crg_id": crg_id},
                    headers={"x-internal-token": TOKEN})
    assert r.status_code == 503
    crg = db_session.get(CrgReport, crg_id)
    assert crg.status == "validated" and crg.sent_at is None

    # Un estampillage partiel non plus : pas de CRG envoyé avec une dépense non marquée. Aucune
    # ligne n'est portée par un autre relevé ici — le compte court est un vrai refus.
    monkeypatch.setattr(depenses, "estampiller_detail", lambda ids, ref, agency_id: (0, {}))
    assert client.post(f"/internal/mandates/{mandate_id}/crg-sent", json={"crg_id": crg_id},
                       headers={"x-internal-token": TOKEN}).status_code == 503
    assert db_session.get(CrgReport, crg_id).status == "validated"


def test_un_crg_valide_dont_la_depense_est_partie_au_mois_suivant_part_corrige(
        client, db_session, monkeypatch):
    """Scénario sans concurrence qui bloquait un CRG pour toujours, en cinq pas.

    M−1 validé mais pas envoyé (propriétaire sans e-mail valide : le planificateur fait
    `continue`), M le mois suivant reprend la même dépense — toujours `charged_at IS NULL` —
    la porte et l'estampille. `crg-sent` sur M−1 comptait alors 0 estampille sur 1 et rendait
    503 à chaque tour, pour toujours, sans écran où le voir ni chemin de retour.
    """
    # `directory` simulé : un registre d'estampilles idempotent par ref, comme la vraie route.
    estampilles: dict[int, str] = {}
    toutes = [{"id": 5, "title": "Chauffe-eau", "cost_final": 1200, "artisan_name": "Plomberie Atlas",
               "completed_at": "2026-09-14T00:00:00", "property_id": 7}]

    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None:
                        [l for l in toutes if l["id"] not in estampilles])

    def _estampiller_detail(ids, ref, agency_id):
        for i in ids:
            estampilles.setdefault(i, ref)
        return (sum(1 for i in ids if estampilles[i] == ref),
                {i: estampilles[i] for i in ids if estampilles[i] != ref})

    monkeypatch.setattr(depenses, "estampiller_detail", _estampiller_detail)

    mnd = _mandat(db_session, property_id=7, fee_pct=8)
    _loyer_encaisse(db_session, mnd, 2026, 9, montant=6000)
    _loyer_encaisse(db_session, mnd, 2026, 10, montant=6000)
    h = {"x-internal-token": TOKEN}

    # 1. Le CRG de septembre naît avec la dépense n° 5, et l'agence le valide.
    monkeypatch.setattr(main, "_prev_period", lambda now: (2026, 9))
    crg_sept = client.get("/internal/mandates/due-crg", headers=h).json()["drafts"][0]["crg_id"]
    client.post(f"/backoffice/gestion-locative/crg/{crg_sept}/validate", json={})
    assert [l["id"] for l in main._lignes_depenses(db_session.get(CrgReport, crg_sept))] == [5]

    # 2. L'envoi n'a pas lieu (propriétaire sans e-mail valide) : il reste `validated`, donc
    #    la dépense n'est pas estampillée — c'est la spec : l'estampille se pose à l'ENVOI.
    assert db_session.get(CrgReport, crg_sept).status == "validated" and not estampilles

    # 3. Un mois plus tard, octobre revoit la même dépense : `charged_at` est toujours nul.
    monkeypatch.setattr(main, "_prev_period", lambda now: (2026, 10))
    crg_oct = client.get("/internal/mandates/due-crg", headers=h).json()["drafts"][0]["crg_id"]
    assert crg_oct != crg_sept
    assert [l["id"] for l in main._lignes_depenses(db_session.get(CrgReport, crg_oct))] == [5]

    # 4. Octobre est validé puis envoyé : il estampille la dépense sous SA référence.
    client.post(f"/backoffice/gestion-locative/crg/{crg_oct}/validate", json={})
    mandate_id = _mandat_id(db_session, crg_oct)
    assert client.post(f"/internal/mandates/{mandate_id}/crg-sent", json={"crg_id": crg_oct},
                       headers=h).status_code == 200
    assert estampilles == {5: f"crg:{crg_oct}"}

    # 5. Septembre part enfin — corrigé : sans sa ligne, et avec le net réellement dû.
    r = client.post(f"/internal/mandates/{mandate_id}/crg-sent", json={"crg_id": crg_sept}, headers=h)
    assert r.status_code == 200
    sept = db_session.get(CrgReport, crg_sept)
    db_session.refresh(sept)
    assert sept.status == "sent" and sept.sent_at is not None
    assert main._lignes_depenses(sept) == []
    # 6000 de loyer, 8 % d'honoraires, plus aucune dépense : 6000 − 480 − 0.
    assert sept.expenses == Decimal("0") and sept.net == Decimal("5520")
    # La dépense reste portée UNE seule fois, par octobre.
    assert estampilles == {5: f"crg:{crg_oct}"}


def test_un_crg_valide_bloque_reste_visible_a_cote_des_brouillons(client, db_session, monkeypatch):
    """Sans ça, un `validated` jamais parti n'apparaissait sur AUCUN écran."""
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000, depenses_=[(4, 1200)])
    client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate", json={})
    attente = client.get("/backoffice/gestion-locative/crg/drafts").json()["drafts"]
    assert [(d["crg_id"], d["status"]) for d in attente] == [(crg_id, "validated")]


def test_le_net_ne_devient_jamais_negatif_et_la_plus_vieille_depense_passe_d_abord(
        db_session, monkeypatch):
    mnd = _mandat(db_session, property_id=7, fee_pct=8)
    # 500 de loyer, 40 d'honoraires : 460 disponibles pour les dépenses.
    _loyer_encaisse(db_session, mnd, 2026, 9, montant=500)
    lignes = [{"id": 5, "title": "Peinture", "cost_final": 300, "trade": "peintre",
               "completed_at": "2026-09-20T00:00:00", "property_id": 7},
              {"id": 4, "title": "Chauffe-eau", "cost_final": 460, "trade": "plombier",
               "completed_at": "2026-09-02T00:00:00", "property_id": 7}]
    monkeypatch.setattr(depenses, "imputables",
                        lambda ids, mode, agency_id, lease_id=None: lignes)
    agg = _crg_aggregate(db_session, mnd, 2026, 9)
    # La dépense la plus ancienne absorbe exactement le solde ; la seconde attend le mois suivant.
    assert agg["expenses"] == 460 and agg["net"] == 0
    assert agg["expense_lines"] == [{"id": 4, "title": "Chauffe-eau", "cost_final": 460,
                                     "completed_at": "2026-09-02T00:00:00", "artisan_name": None}]


def test_la_liste_du_crg_montre_le_statut_et_les_depenses(client, db_session, monkeypatch):
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000, depenses_=[(4, 1200)])
    mandate_id = _mandat_id(db_session, crg_id)
    ligne = client.get(f"/backoffice/gestion-locative/mandates/{mandate_id}/crg").json()["reports"][0]
    assert ligne["status"] == "draft" and ligne["expenses"] == 1200.0
    assert [l["id"] for l in ligne["expense_lines"]] == [4]
    assert ligne["expense_lines_editable"] is True
    # La spec exige « date, intitulé, artisan, montant » : l'artisan est porté jusqu'ici.
    assert ligne["expense_lines"][0]["artisan_name"] == "Plomberie Atlas"

    client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate", json={})
    valide = client.get(f"/backoffice/gestion-locative/mandates/{mandate_id}/crg").json()["reports"][0]
    # Validé, les lignes ne se modifient plus, mais elles restent LISIBLES : un net amputé sans
    # ligne explicative est la plainte d'origine de la spec, et l'agence doit pouvoir répondre.
    assert valide["status"] == "validated"
    assert [l["id"] for l in valide["expense_lines"]] == [4]
    assert valide["expense_lines_editable"] is False


def test_un_brouillon_se_recalcule_mais_un_crg_valide_est_fige(client, db_session, monkeypatch):
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000, depenses_=[(4, 1200)])
    crg = db_session.get(CrgReport, crg_id)
    assert (crg.rent_collected, crg.fees, crg.expenses, crg.net) == (6000, 480, 1200, 4320)

    # Un second loyer rentre après la construction du brouillon : les chiffres doivent suivre.
    y, m = main._prev_period(datetime.utcnow())
    mnd = db_session.get(Mandate, crg.mandate_id)
    _loyer_encaisse(db_session, mnd, y, m, montant=2000)
    client.get("/internal/mandates/due-crg", headers={"x-internal-token": TOKEN})
    db_session.refresh(crg)
    assert (crg.rent_collected, crg.fees, crg.expenses, crg.net) == (8000, 640, 1200, 6160)

    # Validé, il ne bouge plus : l'agence a signé ces chiffres.
    client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate", json={})
    _loyer_encaisse(db_session, mnd, y, m, montant=500)
    client.get("/internal/mandates/due-crg", headers={"x-internal-token": TOKEN})
    db_session.refresh(crg)
    assert (crg.rent_collected, crg.fees, crg.net) == (8000, 640, 6160)
    assert crg.status == "validated"


def test_la_validation_s_arrete_a_l_agence_du_mandat(client, db_session, monkeypatch):
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000, depenses_=[(4, 1200)])
    autre = db_session.get(CrgReport, crg_id)
    autre.agency_id = AGENCY + 1
    db_session.commit()
    r = client.post(f"/backoffice/gestion-locative/crg/{crg_id}/validate", json={})
    assert r.status_code == 404
    db_session.refresh(autre)
    assert autre.status == "draft"


def test_les_brouillons_en_attente_se_listent_du_plus_vieux_au_plus_recent(client, db_session,
                                                                          monkeypatch):
    from datetime import timedelta

    vieux = db_session.get(CrgReport,
                           _brouillon(client, db_session, monkeypatch, loyer=6000,
                                      depenses_=[(4, 1200)]))
    vieux.created_at = datetime.utcnow() - timedelta(days=9)
    recent = CrgReport(mandate_id=vieux.mandate_id, agency_id=AGENCY, period_label="Mai 2026",
                       year=2026, month=5, rent_collected=3000, fees=240, net=2760,
                       status="draft")
    envoye = CrgReport(mandate_id=vieux.mandate_id, agency_id=AGENCY, period_label="Avril 2026",
                       year=2026, month=4, rent_collected=3000, fees=240, net=2760,
                       status="sent", sent_at=datetime.utcnow())
    db_session.add_all([recent, envoye])
    db_session.commit()
    rows = client.get("/backoffice/gestion-locative/crg/drafts").json()["drafts"]
    assert [r["crg_id"] for r in rows] == [vieux.id, recent.id]
    assert rows[0]["waiting_days"] == 9 and isinstance(rows[1]["waiting_days"], int)
    assert rows[0]["mandate_reference"] == "MND-7" and rows[0]["created_at"] is not None


def test_un_crg_se_resout_avec_son_mandat_et_reste_cloisonne_par_agence(client, db_session,
                                                                        monkeypatch):
    crg_id = _brouillon(client, db_session, monkeypatch, loyer=6000, depenses_=[(4, 1200)])
    mandat_id = db_session.get(CrgReport, crg_id).mandate_id
    rep = client.get(f"/backoffice/gestion-locative/crg/{crg_id}")
    assert rep.status_code == 200
    assert rep.json()["mandate_id"] == mandat_id and rep.json()["status"] == "draft"
    autre = _mandat(db_session, property_id=99, fee_pct=8, agency_id=AGENCY + 1)
    etranger = CrgReport(mandate_id=autre.id, agency_id=AGENCY + 1, period_label="Mai 2026",
                         year=2026, month=5, rent_collected=0, fees=0, net=0, status="sent")
    db_session.add(etranger)
    db_session.commit()
    assert client.get(f"/backoffice/gestion-locative/crg/{etranger.id}").status_code == 404
    assert client.get("/backoffice/gestion-locative/crg/999999").status_code == 404
    assert client.get("/backoffice/gestion-locative/crg/drafts").status_code == 200
