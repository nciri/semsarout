"""Page « Biens immobiliers » du back-office : `GET /backoffice/properties/insights`.

Cas tirés du jeu de données de l'agence 1 (base de développement) : chaque contrôle de statut
correspond à un bien réellement contredit par ses dossiers.
"""
import app.main as m
from app import insights
from app.models import Property, PropertyImage
from semsar_auth import Principal, get_principal

REFS = [
    {"city": "Kénitra", "neighborhood": "Bir Rami", "property_type": None, "transaction_type": "sale",
     "avg_price_sqm": 6000.0, "min_price_sqm": 4500.0, "max_price_sqm": 8000.0},
    {"city": "Kénitra", "neighborhood": "Bir Rami", "property_type": "land", "transaction_type": "sale",
     "avg_price_sqm": 2000.0, "min_price_sqm": None, "max_price_sqm": None},
    {"city": "Tanger", "neighborhood": "Malabata", "property_type": None, "transaction_type": "rent",
     "avg_price_sqm": 110.0, "min_price_sqm": 80.0, "max_price_sqm": 150.0},
]


def tx(status, stage, ttype="sale", **kw):
    return {"status": status, "stage": stage, "transaction_type": ttype, **kw}


# --- Fourchette du quartier ---
def test_price_ref_prefers_the_exact_property_type_then_all_types():
    assert insights.match_price_ref(REFS, "Kénitra", "Bir Rami", "sale", "office") == \
        {"avg": 6000.0, "min": 4500.0, "max": 8000.0}
    # Référence du type exact sans bornes : ±20 % comme geo.
    assert insights.match_price_ref(REFS, "Kénitra", "Bir Rami", "sale", "land") == \
        {"avg": 2000.0, "min": 1600.0, "max": 2400.0}


def test_price_ref_needs_same_transaction_type_and_a_neighborhood():
    assert insights.match_price_ref(REFS, "Tanger", "Malabata", "sale", "house") is None
    assert insights.match_price_ref(REFS, "Tanger", None, "rent", "house") is None


# --- Statut contredit par les dossiers ---
def test_won_deal_on_a_property_still_under_option_means_sold():
    c = insights.status_check("pending", [
        tx("active", "compromise"), tx("won", "final_act", final_price=729494, closed_at="2026-06-26T10:00:00")])
    assert (c["reason"], c["expected"], c["tone"], c["open_count"]) == ("won", "sold", "crit", 1)
    assert c["transaction"]["amount"] == 729494


def test_signed_lease_means_rented_not_sold():
    assert insights.status_check("sold", [tx("won", "move_in", "rent")])["expected"] == "rented"
    assert insights.status_check("rented", [tx("won", "move_in", "rent")]) is None


def test_closed_status_with_an_open_deal_goes_back_to_option_or_online_by_stage():
    assert insights.status_check("rented", [tx("active", "negotiation", probability=71)])["expected"] == "pending"
    assert insights.status_check("rented", [tx("active", "contact")])["expected"] == "active"


def test_sold_with_only_lost_deals_goes_back_online():
    c = insights.status_check("sold", [tx("lost", "compromise", closed_at="2026-07-22T00:00:00")])
    assert (c["reason"], c["expected"], c["tone"]) == ("lost", "active", "crit")


def test_under_option_without_open_deal_goes_back_online():
    assert insights.status_check("pending", [])["reason"] == "no_deal"
    assert insights.status_check("pending", [tx("active", "offer")]) is None


def test_consistent_or_unverifiable_statuses_are_not_flagged():
    assert insights.status_check("active", [tx("active", "verification")]) is None
    assert insights.status_check("sold", []) is None  # conclu hors plateforme


# --- Endpoint ---
def _as(agency_id):
    m.app.dependency_overrides[get_principal] = lambda: Principal(
        sub="7", roles=[], agency_id=agency_id, is_superadmin=False, features=[], claims={})


def _prop(db, id, **kw):
    base = {"reference": f"R-{id}", "title": f"Bien {id}", "property_type": "office", "transaction_type": "sale",
            "price": 7030000, "city": "Kénitra", "neighborhood": "Bir Rami", "surface": 120, "agency_id": 1,
            "status": "active"}
    db.add(Property(id=id, **{**base, **kw}))


def test_insights_endpoint_enriches_the_agency_portfolio(client, db_session, monkeypatch):
    _prop(db_session, 1, description="  Belle vue  ")
    _prop(db_session, 2, status="pending")
    _prop(db_session, 3, status="archived")
    _prop(db_session, 4, agency_id=2)
    db_session.add_all([PropertyImage(property_id=1, url="/b.jpg", position=1),
                        PropertyImage(property_id=1, url="/a.jpg", position=0)])
    db_session.commit()
    monkeypatch.setattr(m, "_neighborhood_refs", lambda: REFS)
    monkeypatch.setattr(m, "_agency_transactions", lambda aid: [{"property_id": 1, **tx("active", "visit")}])
    _as(1)
    try:
        body = client.get("/backoffice/properties/insights").json()
    finally:
        m.app.dependency_overrides.pop(get_principal, None)

    rows = {p["id"]: p for p in body["properties"]}
    assert set(rows) == {1, 2}  # archivé et autre agence exclus
    assert (rows[1]["images_count"], rows[1]["cover_url"], rows[1]["description_length"]) == (2, "/a.jpg", 9)
    assert rows[1]["price_ref"] == {"avg": 6000.0, "min": 4500.0, "max": 8000.0}
    assert rows[1]["transactions"][0]["stage"] == "visit" and rows[1]["status_check"] is None
    assert rows[2]["status_check"]["reason"] == "no_deal"
    assert body["sources"] == {"price_refs": True, "transactions": True}


def test_insights_endpoint_says_when_a_source_is_unreachable(client, db_session, monkeypatch):
    _prop(db_session, 1, status="pending")
    db_session.commit()
    monkeypatch.setattr(m, "_neighborhood_refs", lambda: None)
    monkeypatch.setattr(m, "_agency_transactions", lambda aid: None)
    _as(1)
    try:
        body = client.get("/backoffice/properties/insights").json()
    finally:
        m.app.dependency_overrides.pop(get_principal, None)
    # Sans les dossiers, on ne conclut pas « sous option sans dossier » : on ne sait pas.
    assert body["properties"][0]["status_check"] is None and body["properties"][0]["price_ref"] is None
    assert body["sources"] == {"price_refs": False, "transactions": False}
