from app.models import WorkOrder
from app.payeur import mode_propose, payeur_propose, refus_de_creation


def _wo_en_base(db_session, **champs) -> WorkOrder:
    wo = WorkOrder(agency_id=4, **champs)
    db_session.add(wo)
    db_session.commit()
    return wo


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
