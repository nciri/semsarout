"""Estimation d'un bien : référence du secteur, ajustements bornés, refus assumé."""
import pytest
from semsar_auth import Principal, get_principal

from app.main import app
from app.models import ListingRO, NeighborhoodPriceRef


@pytest.fixture(autouse=True)
def _agent_connecte():
    """L'estimation est réservée aux comptes connectés : le client de test en est un."""
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="7", roles=[], agency_id=1, is_superadmin=False, features=[], claims={})
    yield
    app.dependency_overrides.pop(get_principal, None)

BASE = {"city": "Casablanca", "neighborhood": "Anfa", "property_type": "apartment",
        "transaction_type": "sale", "surface": 100}


def _annonces(db, n, price_sqm=12000, city="Casablanca", neighborhood="Anfa",
              property_type="apartment"):
    for i in range(n):
        db.add(ListingRO(id=1000 + i, price=price_sqm * 100, surface=100, city=city,
                         neighborhood=neighborhood, property_type=property_type,
                         transaction_type="sale", status="active"))
    db.commit()


def _ref(db, avg=15000, low=13000, high=17000):
    db.add(NeighborhoodPriceRef(city="Casablanca", neighborhood="Anfa", property_type=None,
                                transaction_type="sale", avg_price_sqm=avg,
                                min_price_sqm=low, max_price_sqm=high))
    db.commit()


def _post(client, **extra):
    return client.post("/market/estimate", json={**BASE, **extra})


def test_sans_comparable_aucun_chiffre_nest_invente(client):
    body = _post(client).json()
    assert body == {"available": False, "reason": "insufficient_data"}


def test_estimation_sur_la_reference_manuelle_du_quartier(client, db_session):
    _ref(db_session)
    body = _post(client).json()
    assert body["available"] is True
    assert body["estimate"] == 1_500_000          # 15 000 Dh/m² × 100 m²
    assert body["source"] == "manual"
    assert body["confidence"] == "high"
    assert body["estimate_low"] < body["estimate"] < body["estimate_high"]


def test_estimation_sur_les_annonces_quand_aucune_reference_nexiste(client, db_session):
    _annonces(db_session, 12)
    body = _post(client).json()
    assert body["reference_price_sqm"] == 12000
    assert body["sample_size"] == 12
    assert body["scope"] == "neighborhood_type"
    assert [c["price_sqm"] for c in body["comparables"]] == [12000] * 5


def test_les_caracteristiques_deplacent_le_prix(client, db_session):
    _ref(db_session)
    neuf = _post(client, condition="new", features=["parking", "terrace"]).json()
    a_renover = _post(client, condition="renovate", floor=5, has_elevator=False).json()

    assert neuf["adjustment_pct"] == 17.0          # 8 + 4 + 5
    assert neuf["estimate"] > 1_500_000
    assert a_renover["adjustment_pct"] == -24.0    # -15, puis -9 pour trois étages sans ascenseur
    assert a_renover["estimate"] < 1_500_000


def test_le_cumul_des_ajustements_reste_borne(client, db_session):
    """Une saisie extrême dégrade l'estimation, elle ne la rend pas absurde."""
    _ref(db_session)
    body = _post(client, condition="renovate", floor=15, has_elevator=False,
                 construction_year=1950).json()
    assert body["adjustment_pct"] == -25.0
    assert body["estimate"] == 1_125_000


def test_une_reference_de_ville_elargit_la_fourchette(client, db_session):
    """Hors du quartier demandé, la référence est plus fragile : on le dit, et on élargit."""
    _annonces(db_session, 6, neighborhood="Maarif")
    body = _post(client).json()
    assert body["scope"] == "city_type"
    assert body["confidence"] == "low"
    assert body["spread_pct"] > 10


def test_parametres_refuses(client):
    assert client.post("/market/estimate", json={**BASE, "city": ""}).status_code == 400
    assert client.post("/market/estimate", json={**BASE, "property_type": "chateau"}).status_code == 400
    assert client.post("/market/estimate", json={**BASE, "surface": 0}).status_code == 400
    assert client.post("/market/estimate", json={**BASE, "surface": "grande"}).status_code == 400
    assert client.post("/market/estimate", json={**BASE, "transaction_type": "troc"}).status_code == 400
