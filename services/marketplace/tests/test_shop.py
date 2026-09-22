from datetime import datetime

import httpx

from app import catalog_client
from app.models import Cart, CartItem, Order, OrderItem, ProductRO


def _product(db, pid, price, stock=5, name=None, active=True):
    db.add(ProductRO(id=pid, name=name or f"P{pid}", price=price, stock=stock, is_active=active))
    db.commit()


_seq = iter(range(1, 10_000))


def _order(db, *, agency=1, buyer=3, status="pending", lines=(), created=datetime(2026, 7, 24)):
    o = Order(reference=f"CMD-{next(_seq)}", agency_id=agency, buyer_id=buyer, status=status,
              total=sum(u * q for _, _, u, q in lines), created_at=created)
    db.add(o)
    db.flush()
    for pid, name, unit, qty in lines:
        db.add(OrderItem(order_id=o.id, product_id=pid, product_name=name, unit_price=unit,
                         quantity=qty, line_total=unit * qty))
    db.commit()
    return o


def _reserve_ok(monkeypatch):
    calls = []

    def fake(items):
        calls.append(items)
        return httpx.Response(200, json={"ok": True})
    monkeypatch.setattr(catalog_client, "reserve", fake)
    return calls


def test_pay_refuses_order_with_retired_product(client, db_session, headers, monkeypatch):
    calls = _reserve_ok(monkeypatch)
    o = _order(db_session, lines=[(None, "Four à supprimer", 500, 1)])
    r = client.post(f"/backoffice/shop/orders/{o.id}/pay", headers=headers())
    assert r.status_code == 409
    assert "catalogue" in r.json()["error"]
    assert calls == []
    assert db_session.get(Order, o.id).status == "pending"


def test_pay_refuses_order_with_deactivated_product(client, db_session, headers, monkeypatch):
    calls = _reserve_ok(monkeypatch)
    _product(db_session, 1, 100, active=False)
    o = _order(db_session, lines=[(1, "P1", 100, 1)])
    assert client.post(f"/backoffice/shop/orders/{o.id}/pay", headers=headers()).status_code == 409
    assert calls == []


def test_pay_reserves_stock_when_all_products_exist(client, db_session, headers, monkeypatch):
    calls = _reserve_ok(monkeypatch)
    _product(db_session, 1, 100)
    o = _order(db_session, lines=[(1, "P1", 100, 2)])
    r = client.post(f"/backoffice/shop/orders/{o.id}/pay", headers=headers())
    assert r.status_code == 200, r.text
    assert r.json()["order"]["status"] == "paid"
    assert calls == [[{"product_id": 1, "quantity": 2}]]


def test_order_detail_carries_current_price(client, db_session, headers):
    _product(db_session, 4, 4199)
    o = _order(db_session, status="paid", lines=[(4, "Armoire", 3200, 3), (None, "Four à supprimer", 500, 1)])
    items = client.get(f"/backoffice/shop/orders/{o.id}", headers=headers()).json()["order"]["items"]
    assert items[0]["current_price"] == 4199 and items[0]["available"] is True
    assert items[1]["current_price"] is None and items[1]["available"] is False


def test_list_with_items_keeps_default_contract(client, db_session, headers):
    _product(db_session, 1, 100)
    _order(db_session, lines=[(1, "P1", 90, 1)])
    plain = client.get("/backoffice/shop/orders", headers=headers()).json()["orders"][0]
    assert "items" not in plain and plain["items_count"] == 1
    full = client.get("/backoffice/shop/orders?with_items=true", headers=headers()).json()["orders"][0]
    assert full["items"][0]["current_price"] == 100


def test_cancel_pending_order(client, db_session, headers):
    o = _order(db_session, lines=[(None, "Four à supprimer", 500, 1)])
    r = client.post(f"/backoffice/shop/orders/{o.id}/cancel", headers=headers())
    assert r.status_code == 200, r.text
    assert r.json()["order"]["status"] == "cancelled"


def test_cancel_refuses_paid_order_and_other_agency(client, db_session, headers):
    paid = _order(db_session, status="paid", lines=[(None, "X", 10, 1)])
    other = _order(db_session, agency=2, lines=[(None, "X", 10, 1)])
    assert client.post(f"/backoffice/shop/orders/{paid.id}/cancel", headers=headers()).status_code == 409
    assert client.post(f"/backoffice/shop/orders/{other.id}/cancel", headers=headers()).status_code == 404
    assert db_session.get(Order, other.id).status == "pending"
