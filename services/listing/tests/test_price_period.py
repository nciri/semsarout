import app.main as m
from app.models import Property
from semsar_auth import Principal, get_principal


def _as_user(uid="7", agency_id=None):
    m.app.dependency_overrides[get_principal] = lambda: Principal(
        sub=uid, roles=[], agency_id=agency_id, is_superadmin=False, features=[], claims={})


def _clear_principal():
    m.app.dependency_overrides.pop(get_principal, None)


def test_apply_price_period_defaults_to_month_for_rent():
    p = Property(transaction_type="rent", price=5000)
    m._apply_price_period(p)
    assert p.price_period == "month"
    assert p.price_per_day is None


def test_apply_price_period_day_sets_price_per_day_equal_to_price():
    p = Property(transaction_type="rent", price=500, price_period="day")
    m._apply_price_period(p)
    assert p.price_per_day == 500


def test_apply_price_period_week_divides_by_seven():
    p = Property(transaction_type="rent", price=3000, price_period="week")
    m._apply_price_period(p)
    assert p.price_per_day == 3000 / 7


def test_apply_price_period_invalid_value_falls_back_to_month():
    p = Property(transaction_type="rent", price=5000, price_period="year")
    m._apply_price_period(p)
    assert p.price_period == "month"


def test_apply_price_period_cleared_for_sale():
    p = Property(transaction_type="sale", price=900000, price_period="day", price_per_day=900000)
    m._apply_price_period(p)
    assert p.price_period is None
    assert p.price_per_day is None


def test_create_property_rent_day_computes_price_per_day(client, db_session):
    _as_user()
    resp = client.post("/properties", json={
        "title": "Chambre meublée", "property_type": "apartment", "transaction_type": "rent",
        "price": 400, "price_period": "day", "city": "Casablanca",
    })
    _clear_principal()
    assert resp.status_code == 201
    body = resp.json()["property"]
    assert body["price_period"] == "day"
    assert body["price_per_day"] == 400


def test_create_property_rent_without_period_defaults_month(client, db_session):
    _as_user()
    resp = client.post("/properties", json={
        "title": "Appartement", "property_type": "apartment", "transaction_type": "rent",
        "price": 6000, "city": "Rabat",
    })
    _clear_principal()
    body = resp.json()["property"]
    assert body["price_period"] == "month"
    assert body["price_per_day"] is None


def test_update_property_switches_period_and_recomputes(client, db_session):
    _as_user()
    created = client.post("/properties", json={
        "title": "Studio", "property_type": "apartment", "transaction_type": "rent",
        "price": 4000, "city": "Marrakech",
    }).json()["property"]
    prop_id = created["id"]
    resp = client.put(f"/properties/{prop_id}", json={"price": 700, "price_period": "week"})
    _clear_principal()
    assert resp.status_code == 200
    body = resp.json()["property"]
    assert body["price_period"] == "week"
    assert body["price_per_day"] == 100.0


def test_bo_create_property_rent_computes_price_per_day(client, db_session):
    _as_user(agency_id=1)
    resp = client.post("/backoffice/properties", json={
        "title": "Riad courte durée", "property_type": "house", "transaction_type": "rent",
        "price": 1200, "price_period": "week", "city": "Fès",
    })
    _clear_principal()
    assert resp.status_code == 201
    body = resp.json()
    assert body["price_period"] == "week"
    assert round(body["price_per_day"], 2) == round(1200 / 7, 2)


def test_bo_create_property_sale_ignores_price_period(client, db_session):
    _as_user(agency_id=1)
    resp = client.post("/backoffice/properties", json={
        "title": "Villa", "property_type": "villa", "transaction_type": "sale",
        "price": 2000000, "price_period": "day", "city": "Tanger",
    })
    _clear_principal()
    body = resp.json()
    assert body["price_period"] is None
    assert body["price_per_day"] is None
