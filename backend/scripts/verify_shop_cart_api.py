import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User, Product

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    prod = Product.query.filter_by(is_active=True).first()
    c = app.test_client()
    h = {'Authorization': f'Bearer {login(c, u.email, "password123")}'}
    # clear any existing cart items to start clean
    cart = c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']
    for it in cart['items']:
        c.delete(f"/api/v1/backoffice/shop/cart/items/{it['id']}", headers=h)
    r = c.post('/api/v1/backoffice/shop/cart/items', json={'product_id': prod.id, 'quantity': 2}, headers=h)
    check(r.status_code in (200, 201), "add to cart")
    # add same product again -> merged quantity
    c.post('/api/v1/backoffice/shop/cart/items', json={'product_id': prod.id, 'quantity': 1}, headers=h)
    cart = c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']
    line = next(x for x in cart['items'] if x['product_id'] == prod.id)
    check(line['quantity'] == 3, "quantities merged (2+1=3)")
    r = c.put(f"/api/v1/backoffice/shop/cart/items/{line['id']}", json={'quantity': 5}, headers=h)
    check(r.status_code == 200, "update quantity")
    r = c.put(f"/api/v1/backoffice/shop/cart/items/{line['id']}", json={'quantity': 0}, headers=h)
    check(r.status_code == 400, "update quantity 0 rejected")
    r = c.put(f"/api/v1/backoffice/shop/cart/items/{line['id']}", json={'quantity': -1}, headers=h)
    check(r.status_code == 400, "update quantity -1 rejected")
    r = c.put(f"/api/v1/backoffice/shop/cart/items/{line['id']}", json={'quantity': 'x'}, headers=h)
    check(r.status_code == 400, "update quantity non-integer rejected")
    r = c.put(f"/api/v1/backoffice/shop/cart/items/{line['id']}", json={'quantity': 4}, headers=h)
    check(r.status_code == 200, "update quantity 4 accepted")
    cart = c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']
    line = next(x for x in cart['items'] if x['id'] == line['id'])
    check(line['quantity'] == 4, "quantity updated to 4")
    r = c.delete(f"/api/v1/backoffice/shop/cart/items/{line['id']}", headers=h)
    check(r.status_code == 200, "remove item")

sys.exit(1 if FAILS else 0)
