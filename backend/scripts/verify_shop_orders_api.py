import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Product, CartItem, Cart

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    prod = Product.query.filter_by(is_active=True).filter(Product.stock >= 3).first()
    start_stock = prod.stock
    c = app.test_client()
    h = {'Authorization': f'Bearer {login(c, u.email, "password123")}'}
    # empty cart checkout -> 400
    cart = c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']
    for it in cart['items']:
        c.delete(f"/api/v1/backoffice/shop/cart/items/{it['id']}", headers=h)
    check(c.post('/api/v1/backoffice/shop/orders', json={}, headers=h).status_code == 400, "empty cart checkout -> 400")
    # add + checkout
    c.post('/api/v1/backoffice/shop/cart/items', json={'product_id': prod.id, 'quantity': 3}, headers=h)
    r = c.post('/api/v1/backoffice/shop/orders', json={'delivery_address': 'Rue X, Casablanca'}, headers=h)
    check(r.status_code in (200, 201), "checkout creates order")
    oid = r.get_json()['order']['id']
    order = r.get_json()['order']
    check(order['status'] == 'pending' and order['items'][0]['product_name'] == prod.name, "order pending + snapshot")
    # cart cleared
    check(len(c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']['items']) == 0, "cart cleared after checkout")
    # pay -> stock decremented
    r = c.post(f'/api/v1/backoffice/shop/orders/{oid}/pay', headers=h)
    check(r.status_code == 200 and r.get_json()['order']['status'] == 'paid', "pay -> paid")
    db.session.expire_all()
    check(Product.query.get(prod.id).stock == start_stock - 3, "stock decremented by 3 at payment")
    # re-pay -> 409
    check(c.post(f'/api/v1/backoffice/shop/orders/{oid}/pay', headers=h).status_code == 409, "re-pay -> 409")
    # snapshot: change product price, order total unchanged
    prod.price = float(prod.price) + 999; db.session.commit()
    o = c.get(f'/api/v1/backoffice/shop/orders/{oid}', headers=h).get_json()['order']
    check(o['total'] == order['total'], "order total unchanged after product price change")

sys.exit(1 if FAILS else 0)
