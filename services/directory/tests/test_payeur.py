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
    r = client.get("/internal/work-orders/chargeable?property_ids=7&mode=crg_expense&agency_id=4",
                   headers={"x-internal-token": TOKEN})
    assert [w["id"] for w in r.json()["work_orders"]] == [a.id]


def test_les_depenses_imputables_se_restreignent_a_un_bail(client, db_session):
    ancien = _wo_en_base(db_session, property_id=7, lease_id=1, status="done",
                         cost_final=Decimal("200"), charge_mode="deposit_deduction")
    actuel = _wo_en_base(db_session, property_id=7, lease_id=2, status="done",
                         cost_final=Decimal("350"), charge_mode="deposit_deduction")
    url = "/internal/work-orders/chargeable?property_ids=7&mode=deposit_deduction&agency_id=4"
    h = {"x-internal-token": TOKEN}
    assert {w["id"] for w in client.get(url, headers=h).json()["work_orders"]} == {ancien.id, actuel.id}
    ids = [w["id"] for w in client.get(f"{url}&lease_id=2", headers=h).json()["work_orders"]]
    assert ids == [actuel.id]


def test_l_estampille_est_idempotente(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("450"),
                     charge_mode="crg_expense")
    h = {"x-internal-token": TOKEN}
    assert client.post("/internal/work-orders/charged",
                       json={"ids": [wo.id], "ref": "crg:12", "agency_id": 4}, headers=h).json()["stamped"] == 1
    assert client.post("/internal/work-orders/charged",
                       json={"ids": [wo.id], "ref": "crg:13", "agency_id": 4}, headers=h).json()["stamped"] == 0
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


def test_les_modes_terminaux_quittent_la_liste_des_depenses_en_attente(client, db_session):
    """`direct` et `absorbed` sont terminaux par la spec : personne ne doit rien.

    Ne recevant jamais de `charged_at` ni de `settled_at`, ils s'accumulaient pour toujours et
    allumaient pour toujours l'alerte à 60 jours de l'écran — une alerte toujours allumée n'est
    plus lue, et la vraie remise en état de 8 000 Dh se cachait au milieu.
    """
    for mode in ("direct", "absorbed"):
        _wo_en_base(db_session, property_id=99, status="done", cost_final=Decimal("500"),
                    charge_mode=mode, completed_at=datetime(2026, 1, 1))
    # Un mode non renseigné reste visible : c'est précisément le garde-fou de l'anti-objectif n° 1.
    nul = _wo_en_base(db_session, property_id=99, status="done", cost_final=Decimal("120"),
                      charge_mode=None, completed_at=datetime(2026, 10, 1))
    rebill = _wo_en_base(db_session, property_id=99, status="done", cost_final=Decimal("300"),
                         charge_mode="to_rebill", completed_at=datetime(2026, 10, 2))
    rows = client.get("/backoffice/work-orders?pending=1").json()["work_orders"]
    assert sorted(w["id"] for w in rows) == sorted([nul.id, rebill.id])
    # …et ils restent listés hors du filtre « en attente » : l'historique du bien les garde.
    toutes = client.get("/backoffice/work-orders").json()["work_orders"]
    assert len(toutes) == 4


def test_les_interventions_d_un_bail_se_listent(client, db_session):
    voulu = _wo_en_base(db_session, lease_id=12)
    _wo_en_base(db_session, lease_id=13)
    rows = client.get("/backoffice/work-orders?lease_id=12").json()["work_orders"]
    assert [w["id"] for w in rows] == [voulu.id]


def test_l_internal_exige_son_jeton(client):
    assert client.get(
        "/internal/work-orders/chargeable?property_ids=7&mode=crg_expense&agency_id=4").status_code == 403
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


def test_les_routes_internes_s_arretent_a_l_agence(client, db_session):
    autre = WorkOrder(agency_id=9, title="Ailleurs", trade="plombier", property_id=7, status="done",
                      cost_final=Decimal("100"), charge_mode="crg_expense")
    db_session.add(autre)
    db_session.commit()
    h = {"x-internal-token": TOKEN}
    r = client.get("/internal/work-orders/chargeable?property_ids=7&mode=crg_expense&agency_id=4", headers=h)
    assert r.json()["work_orders"] == []
    r = client.post("/internal/work-orders/charged",
                    json={"ids": [autre.id], "ref": "crg:1", "agency_id": 4}, headers=h)
    assert r.json()["stamped"] == 0
    db_session.refresh(autre)
    assert autre.charged_at is None


def test_les_routes_internes_exigent_l_agence_et_un_mode_connu(client):
    h = {"x-internal-token": TOKEN}
    assert client.get("/internal/work-orders/chargeable?property_ids=7&mode=crg_expense",
                      headers=h).status_code == 400
    assert client.get("/internal/work-orders/chargeable?property_ids=7&mode=inconnu&agency_id=4",
                      headers=h).status_code == 400
    assert client.post("/internal/work-orders/charged", json={"ids": [1], "ref": "x"},
                       headers=h).status_code == 400


def test_un_autre_mode_est_exclu_des_depenses_imputables(client, db_session):
    _wo_en_base(db_session, property_id=7, status="done", cost_final=Decimal("90"),
                charge_mode="to_rebill")
    r = client.get("/internal/work-orders/chargeable?property_ids=7&mode=crg_expense&agency_id=4",
                   headers={"x-internal-token": TOKEN})
    assert r.json()["work_orders"] == []


def test_la_garde_de_l_administration_couvre_tout_ce_qui_designe_le_payeur():
    agent, acheve = _principal("agent"), _wo("done", payer="third_party", third_party_label="Wafa")
    for cle in ("third_party_label", "nature", "client_id", "lease_id", "charge_mode"):
        assert refus_de_modification(agent, acheve, {cle: "x"}) is not None
    # Un statut nul ne change pas le statut courant.
    assert refus_de_modification(agent, acheve, {"status": None, "payer": "tenant"}) is not None
    # Le statut d'arrivée compte aussi.
    assert refus_de_modification(agent, _wo("in_progress"), {"status": "done", "lease_id": 3}) is not None


def test_l_api_refuse_un_tiers_payeur_sans_nom(client, db_session):
    wo = _wo_en_base(db_session, status="scheduled", payer="owner")
    for corps in ({"payer": "third_party"}, {"payer": "third_party", "third_party_label": 123},
                  {"payer": "third_party", "third_party_label": "  "}):
        assert client.put(f"/backoffice/work-orders/{wo.id}", json=corps).status_code == 400
    db_session.refresh(wo)
    assert wo.payer == "owner"


def test_l_estampille_rejouee_avec_le_meme_releve_rend_le_meme_compte(client, db_session):
    """Un relevé qui perd son commit après un estampillage réussi doit pouvoir reprendre."""
    a = _wo_en_base(db_session, status="done", cost_final=Decimal("450"), charge_mode="crg_expense")
    b = _wo_en_base(db_session, status="done", cost_final=Decimal("120"), charge_mode="crg_expense")
    h = {"x-internal-token": TOKEN}
    corps = {"ids": [a.id, b.id], "ref": "crg:12", "agency_id": 4}
    assert client.post("/internal/work-orders/charged", json=corps, headers=h).json()["stamped"] == 2
    db_session.refresh(a)
    pose_le = a.charged_at
    assert client.post("/internal/work-orders/charged", json=corps, headers=h).json()["stamped"] == 2
    db_session.refresh(a)
    assert a.charged_at == pose_le and a.charged_ref == "crg:12"


def test_l_estampille_nomme_les_depenses_portees_par_un_autre_releve(client, db_session):
    """Sans `foreign`, un compte court ne disait pas si le relevé pouvait se corriger.

    L'appelant (rental) distingue grâce à elle la dépense partie sur un AUTRE relevé — qu'il
    retire de son propre relevé, lequel part alors corrigé — de l'identifiant simplement
    inconnu, qui reste un refus.
    """
    a = _wo_en_base(db_session, status="done", cost_final=Decimal("450"), charge_mode="crg_expense")
    b = _wo_en_base(db_session, status="done", cost_final=Decimal("120"), charge_mode="crg_expense")
    h = {"x-internal-token": TOKEN}
    client.post("/internal/work-orders/charged",
                json={"ids": [a.id], "ref": "crg:99", "agency_id": 4}, headers=h)
    r = client.post("/internal/work-orders/charged",
                    json={"ids": [a.id, b.id], "ref": "crg:12", "agency_id": 4}, headers=h).json()
    assert r["stamped"] == 1
    assert r["foreign"] == [{"id": a.id, "charged_ref": "crg:99"}]
    # Rien d'étranger quand tout est à soi, et un id inconnu n'est PAS déclaré étranger.
    r = client.post("/internal/work-orders/charged",
                    json={"ids": [b.id, 99999], "ref": "crg:12", "agency_id": 4}, headers=h).json()
    assert r == {"stamped": 1, "foreign": []}


def test_la_liberation_ne_defait_que_l_estampille_de_son_ref(client, db_session):
    wo = _wo_en_base(db_session, property_id=7, status="done", cost_final=Decimal("450"),
                     charge_mode="deposit_deduction")
    h = {"x-internal-token": TOKEN}
    url = "/internal/work-orders/chargeable?property_ids=7&mode=deposit_deduction&agency_id=4"
    corps = {"ids": [wo.id], "ref": "settlement:7", "agency_id": 4}
    client.post("/internal/work-orders/charged", json=corps, headers=h)
    assert client.get(url, headers=h).json()["work_orders"] == []
    assert client.post("/internal/work-orders/release", json={**corps, "ref": "crg:12"},
                       headers=h).json()["released"] == 0
    assert client.get(url, headers=h).json()["work_orders"] == []
    assert client.post("/internal/work-orders/release", json={**corps, "agency_id": 5},
                       headers=h).json()["released"] == 0
    assert client.post("/internal/work-orders/release", json=corps, headers=h).json()["released"] == 1
    assert [w["id"] for w in client.get(url, headers=h).json()["work_orders"]] == [wo.id]


def test_la_liberation_exige_le_jeton(client):
    assert client.post("/internal/work-orders/release",
                       json={"ids": [1], "ref": "x", "agency_id": 4}).status_code == 403


def test_la_liberation_rejouee_ou_sur_une_depense_libre_reussit(client, db_session):
    a = _wo_en_base(db_session, status="done", cost_final=Decimal("450"), charge_mode="deposit_deduction")
    b = _wo_en_base(db_session, status="done", cost_final=Decimal("120"), charge_mode="deposit_deduction")
    h = {"x-internal-token": TOKEN}
    client.post("/internal/work-orders/charged",
                json={"ids": [a.id], "ref": "settlement:7", "agency_id": 4}, headers=h)
    corps = {"ids": [a.id, b.id], "ref": "settlement:7", "agency_id": 4}
    for _ in range(2):
        assert client.post("/internal/work-orders/release", json=corps, headers=h).json()["released"] == 2


def test_la_liberation_ne_touche_pas_une_depense_d_un_autre_ref(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("450"), charge_mode="crg_expense")
    h = {"x-internal-token": TOKEN}
    client.post("/internal/work-orders/charged",
                json={"ids": [wo.id], "ref": "crg:12", "agency_id": 4}, headers=h)
    db_session.refresh(wo)
    pose_le = wo.charged_at
    assert client.post("/internal/work-orders/release",
                       json={"ids": [wo.id], "ref": "settlement:7", "agency_id": 4},
                       headers=h).json()["released"] == 0
    db_session.refresh(wo)
    assert wo.charged_ref == "crg:12" and wo.charged_at == pose_le


def test_solder_une_refacturation(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"),
                     charge_mode="to_rebill")
    r = client.post(f"/backoffice/work-orders/{wo.id}/settle", json={"method": "encaisse"})
    assert r.status_code == 200
    db_session.refresh(wo)
    assert wo.settled_method == "encaisse" and wo.settled_by == 10 and wo.settled_at is not None
    # Une seule fois.
    assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                       json={"method": "abandonne"}).status_code == 409


def _rien_ecrit(db_session, wo) -> bool:
    db_session.refresh(wo)
    return wo.settled_at is None and wo.settled_method is None and wo.settled_by is None


def test_on_ne_solde_pas_ce_qui_n_est_pas_a_refacturer(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"),
                     charge_mode="crg_expense")
    assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                       json={"method": "encaisse"}).status_code == 400
    assert _rien_ecrit(db_session, wo)


def test_une_methode_inconnue_est_refusee(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"),
                     charge_mode="to_rebill")
    assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                       json={"method": "troc"}).status_code == 400
    assert _rien_ecrit(db_session, wo)


def test_on_ne_solde_pas_une_intervention_inachevee(client, db_session):
    wo = _wo_en_base(db_session, status="in_progress", charge_mode="to_rebill")
    assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                       json={"method": "encaisse"}).status_code == 400
    assert _rien_ecrit(db_session, wo)


def test_on_ne_solde_pas_sans_cout_final(client, db_session):
    wo = _wo_en_base(db_session, status="done", charge_mode="to_rebill")
    for methode in ("encaisse", "impute_commission", "regularisation", "abandonne"):
        assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                           json={"method": methode}).status_code == 400
        assert _rien_ecrit(db_session, wo)
    # Le coût manquant se renseigne tant que le bon n'est pas verrouillé.
    assert client.put(f"/backoffice/work-orders/{wo.id}", json={"cost_final": 80}).status_code == 200
    assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                       json={"method": "encaisse"}).status_code == 200


def test_un_agent_encaisse_mais_n_abandonne_pas(client, db_session):
    app.dependency_overrides[get_principal] = lambda: _principal("agent")
    for methode in ("abandonne", "impute_commission"):
        wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"), charge_mode="to_rebill")
        assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                           json={"method": methode}).status_code == 403
        assert _rien_ecrit(db_session, wo)
    for methode in ("encaisse", "regularisation"):
        wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"), charge_mode="to_rebill")
        assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                           json={"method": methode}).status_code == 200


def test_l_administration_solde_par_toute_methode(client, db_session):
    for methode in ("abandonne", "impute_commission"):
        wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"), charge_mode="to_rebill")
        assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                           json={"method": methode}).status_code == 200


def test_la_liste_dit_si_l_on_peut_abandonner_ou_imputer(client, db_session):
    _wo_en_base(db_session, status="done", cost_final=Decimal("600"), charge_mode="to_rebill")

    def drapeau():
        return client.get("/backoffice/work-orders?pending=1").json()["work_orders"][0]["can_settle_writeoff"]

    assert drapeau() is True
    app.dependency_overrides[get_principal] = lambda: _principal("agent")
    assert drapeau() is False


def test_solder_ignore_une_intervention_d_une_autre_agence(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"), charge_mode="to_rebill")
    wo.agency_id = 99
    db_session.commit()
    assert client.post(f"/backoffice/work-orders/{wo.id}/settle",
                       json={"method": "encaisse"}).status_code == 404
    assert _rien_ecrit(db_session, wo)


def test_une_intervention_soldee_ne_se_reecrit_plus(client, db_session):
    wo = _wo_en_base(db_session, status="done", cost_final=Decimal("600"), charge_mode="to_rebill")
    client.post(f"/backoffice/work-orders/{wo.id}/settle", json={"method": "encaisse"})
    assert client.put(f"/backoffice/work-orders/{wo.id}",
                      json={"cost_final": 1}).status_code == 403
