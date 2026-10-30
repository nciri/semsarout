from datetime import datetime
from decimal import Decimal

from semsar_auth import Principal, get_principal

from app.main import app, settings
from app.models import WorkOrder
from app.payeur import mode_propose, payeur_propose, refus_de_creation, refus_de_modification

TOKEN = settings.internal_token


def _wo_en_base(db_session, **champs) -> WorkOrder:
    champs.setdefault("title", "Intervention")
    champs.setdefault("trade", "plombier")
    wo = WorkOrder(agency_id=4, **champs)
    db_session.add(wo)
    db_session.commit()
    return wo


def _wo(status: str, **champs) -> WorkOrder:
    return WorkOrder(agency_id=4, status=status, **champs)


def _principal(role: str) -> Principal:
    return Principal(sub="10", roles=[role], agency_id=4, features=["artisans"])


def test_la_charge_utile_porte_le_payeur(client, db_session):
    wo = _wo_en_base(db_session, title="Chauffe-eau", trade="plombier", property_id=7)
    r = client.get(f"/backoffice/work-orders/{wo.id}")
    assert r.status_code == 200
    body = r.json()["work_order"]
    for champ in ("client_id", "lease_id", "nature", "payer", "charge_mode",
                  "third_party_label", "charged_at", "settled_at"):
        assert champ in body


def test_la_nature_propose_le_payeur():
    assert payeur_propose("structurel", a_un_bail=True) == "owner"
    assert payeur_propose("degat_occupant", a_un_bail=True) == "tenant"
    # Sans locataire, un entretien courant retombe sur le propriétaire.
    assert payeur_propose("entretien", a_un_bail=True) == "tenant"
    assert payeur_propose("entretien", a_un_bail=False) == "owner"


def test_le_mode_suit_le_payeur_et_le_contexte():
    assert mode_propose("owner", a_un_bail=True, a_un_mandat=True) == "crg_expense"
    # Pas de mandat de gérance : aucun CRG où imputer.
    assert mode_propose("owner", a_un_bail=False, a_un_mandat=False) == "to_rebill"
    assert mode_propose("tenant", a_un_bail=True, a_un_mandat=True) == "to_rebill"
    assert mode_propose("agency", a_un_bail=True, a_un_mandat=True) == "absorbed"
    assert mode_propose("third_party", a_un_bail=True, a_un_mandat=True) == "to_rebill"


def test_une_intervention_sans_client_est_refusee():
    base = {"title": "Vitre", "trade": "vitrier", "property_id": 7, "client_id": 3,
            "nature": "degat_occupant", "payer": "tenant", "charge_mode": "to_rebill"}
    assert refus_de_creation(base) is None
    assert refus_de_creation({**base, "client_id": None}) is not None
    assert refus_de_creation({**base, "nature": "inconnue"}) is not None
    assert refus_de_creation({**base, "payer": "voisin"}) is not None
    assert refus_de_creation({**base, "charge_mode": "virement"}) is not None
    # Un tiers sans nom n'est pas un destinataire.
    assert refus_de_creation({**base, "payer": "third_party", "third_party_label": None}) is not None


def test_la_creation_refuse_sans_client(client):
    r = client.post("/backoffice/work-orders", json={
        "title": "Vitre", "trade": "vitrier", "property_id": 7,
        "nature": "degat_occupant", "payer": "tenant", "charge_mode": "to_rebill"})
    assert r.status_code == 400


def test_la_creation_trace_qui_a_choisi_le_payeur(client, db_session):
    r = client.post("/backoffice/work-orders", json={
        "title": "Chauffe-eau", "trade": "plombier", "property_id": 7, "client_id": 3,
        "nature": "structurel", "payer": "owner", "charge_mode": "crg_expense"})
    assert r.status_code == 201
    wo = r.json()["work_order"]
    assert wo["payer"] == "owner" and wo["charge_mode"] == "crg_expense"
    assert wo["payer_set_by"] == 10 and wo["payer_set_at"] is not None


def test_une_depense_deja_portee_ne_se_reecrit_plus():
    patron = _principal("admin")
    porte = _wo("done", charged_at=datetime(2026, 10, 5), charged_ref="crg:12")
    assert refus_de_modification(patron, porte, {"cost_final": "500"}) is not None
    assert refus_de_modification(patron, porte, {"payer": "tenant"}) is not None
    assert refus_de_modification(patron, porte, {"charge_mode": "to_rebill"}) is not None
    # Une note reste modifiable : elle ne figure sur aucun relevé.
    assert refus_de_modification(patron, porte, {"notes": "revu avec le plombier"}) is None


def test_une_depense_reglee_ne_se_reecrit_plus():
    regle = _wo("done", settled_at=datetime(2026, 10, 9))
    assert refus_de_modification(_principal("admin"), regle, {"cost_estimate": "10"}) is not None


def test_changer_le_payeur_apres_achevement_releve_de_l_administration():
    agent, patron = _principal("agent"), _principal("admin")
    acheve = _wo("done")
    assert refus_de_modification(agent, acheve, {"payer": "owner"}) is not None
    assert refus_de_modification(patron, acheve, {"payer": "owner"}) is None
    # Avant l'achèvement, l'agent garde la main.
    assert refus_de_modification(agent, _wo("scheduled"), {"payer": "owner"}) is None


def test_l_api_refuse_la_reecriture_d_une_depense_portee(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("450"),
                     charged_at=datetime(2026, 10, 5), charged_ref="crg:12")
    r = client.put(f"/backoffice/work-orders/{wo.id}", json={"cost_final": 900})
    assert r.status_code == 403
    db_session.refresh(wo)
    assert wo.cost_final == Decimal("450")


def test_l_api_refuse_une_valeur_inconnue_en_400(client, db_session):
    wo = _wo_en_base(db_session, status="scheduled")
    r = client.put(f"/backoffice/work-orders/{wo.id}", json={"payer": "voisin"})
    assert r.status_code == 400


def test_un_libelle_non_textuel_est_refuse_sans_planter(client):
    base = {"title": "Vitre", "trade": "plombier", "property_id": 7, "client_id": 3,
            "nature": "degat_occupant", "payer": "third_party", "charge_mode": "to_rebill"}
    assert refus_de_creation({**base, "third_party_label": 123}) is not None
    r = client.post("/backoffice/work-orders", json={**base, "third_party_label": 123})
    assert r.status_code == 400


def test_le_libelle_du_tiers_est_nettoye_et_propre_au_tiers(client):
    base = {"title": "Vitre", "trade": "plombier", "property_id": 7, "client_id": 3,
            "nature": "degat_occupant", "charge_mode": "to_rebill"}
    tiers = client.post("/backoffice/work-orders", json={
        **base, "payer": "third_party", "third_party_label": "  Assurance Wafa "})
    assert tiers.json()["work_order"]["third_party_label"] == "Assurance Wafa"
    locataire = client.post("/backoffice/work-orders", json={
        **base, "payer": "tenant", "third_party_label": "Assurance Wafa"})
    assert locataire.json()["work_order"]["third_party_label"] is None


def test_les_depenses_imputables_s_arretent_aux_non_estampillees(client, db_session):
    a = _wo_en_base(db_session, property_id=7, status="done", cost_final=Decimal("450"),
                    charge_mode="crg_expense", completed_at=datetime(2026, 10, 2))
    _wo_en_base(db_session, property_id=7, status="done", cost_final=Decimal("300"),
                charge_mode="crg_expense", charged_at=datetime(2026, 10, 5))
    _wo_en_base(db_session, property_id=7, status="scheduled", charge_mode="crg_expense")
    r = client.get("/internal/work-orders/chargeable?property_ids=7&mode=crg_expense",
                   headers={"x-internal-token": TOKEN})
    assert [w["id"] for w in r.json()["work_orders"]] == [a.id]


def test_les_depenses_imputables_se_restreignent_a_un_bail(client, db_session):
    ancien = _wo_en_base(db_session, property_id=7, lease_id=1, status="done",
                         cost_final=Decimal("200"), charge_mode="deposit_deduction")
    actuel = _wo_en_base(db_session, property_id=7, lease_id=2, status="done",
                         cost_final=Decimal("350"), charge_mode="deposit_deduction")
    url = "/internal/work-orders/chargeable?property_ids=7&mode=deposit_deduction"
    h = {"x-internal-token": TOKEN}
    assert {w["id"] for w in client.get(url, headers=h).json()["work_orders"]} == {ancien.id, actuel.id}
    ids = [w["id"] for w in client.get(f"{url}&lease_id=2", headers=h).json()["work_orders"]]
    assert ids == [actuel.id]


def test_l_estampille_est_idempotente(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("450"),
                     charge_mode="crg_expense")
    h = {"x-internal-token": TOKEN}
    assert client.post("/internal/work-orders/charged",
                       json={"ids": [wo.id], "ref": "crg:12"}, headers=h).json()["stamped"] == 1
    assert client.post("/internal/work-orders/charged",
                       json={"ids": [wo.id], "ref": "crg:13"}, headers=h).json()["stamped"] == 0
    db_session.refresh(wo)
    assert wo.charged_ref == "crg:12"


def test_une_depense_sans_mandat_reste_visible(client, db_session):
    # Bien sans mandat de gérance : aucun CRG ne la prendra, elle ne doit pas disparaître.
    _wo_en_base(db_session, property_id=99, status="done", cost_final=Decimal("8000"),
                charge_mode="crg_expense", completed_at=datetime(2026, 8, 1))
    # Et une intervention achevée dont personne n'a choisi le mode y figure aussi.
    _wo_en_base(db_session, property_id=99, status="done", cost_final=Decimal("120"),
                charge_mode=None, completed_at=datetime(2026, 10, 1))
    rows = client.get("/backoffice/work-orders?pending=1").json()["work_orders"]
    assert len(rows) == 2
    assert all(isinstance(w["waiting_days"], int) for w in rows)


def test_les_interventions_d_un_bail_se_listent(client, db_session):
    voulu = _wo_en_base(db_session, lease_id=12)
    _wo_en_base(db_session, lease_id=13)
    rows = client.get("/backoffice/work-orders?lease_id=12").json()["work_orders"]
    assert [w["id"] for w in rows] == [voulu.id]


def test_l_internal_exige_son_jeton(client):
    assert client.get(
        "/internal/work-orders/chargeable?property_ids=7&mode=crg_expense").status_code == 403
    assert client.post("/internal/work-orders/charged", json={"ids": [1], "ref": "x"}).status_code == 403


def test_l_api_reserve_le_payeur_d_un_bon_acheve_a_l_administration(client, db_session):
    wo = _wo_en_base(db_session, status="done", payer="owner", charge_mode="crg_expense")
    app.dependency_overrides[get_principal] = lambda: _principal("agent")
    assert client.put(f"/backoffice/work-orders/{wo.id}", json={"payer": "tenant"}).status_code == 403
    db_session.refresh(wo)
    assert wo.payer == "owner"
    app.dependency_overrides[get_principal] = lambda: _principal("admin")
    r = client.put(f"/backoffice/work-orders/{wo.id}", json={"payer": "tenant"})
    assert r.status_code == 200
    db_session.refresh(wo)
    assert wo.payer == "tenant" and wo.payer_set_by == 10 and wo.payer_set_at is not None


def test_le_statut_termine_n_ouvre_pas_la_porte_au_payeur(client, db_session):
    wo = _wo_en_base(db_session, status="in_progress", payer="owner")
    app.dependency_overrides[get_principal] = lambda: _principal("agent")
    r = client.put(f"/backoffice/work-orders/{wo.id}", json={"status": "done", "payer": "tenant"})
    assert r.status_code == 403
    db_session.refresh(wo)
    assert wo.payer == "owner" and wo.status == "in_progress"


def test_la_modification_du_payeur_nettoie_le_libelle_du_tiers(client, db_session):
    wo = _wo_en_base(db_session, status="scheduled", payer="owner")
    r = client.put(f"/backoffice/work-orders/{wo.id}", json={
        "payer": "third_party", "third_party_label": "  Assurance Wafa "})
    assert r.json()["work_order"]["third_party_label"] == "Assurance Wafa"
    r = client.put(f"/backoffice/work-orders/{wo.id}", json={"payer": "tenant"})
    assert r.json()["work_order"]["third_party_label"] is None
