import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Product, CartItem, OrderItem

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    c = app.test_client()
    sa = {'Authorization': f'Bearer {login(c, "admin@semsarout.ma", "admin123")}'}
    # a normal agency user must be blocked
    u = User.query.filter(User.agency_id.isnot(None)).first()
    au = {'Authorization': f'Bearer {login(c, u.email, "password123")}'}
    check(c.post('/api/v1/admin/products', json={'category': 'lit', 'name': 'X', 'price': 1}, headers=au).status_code == 403, "agency user blocked -> 403")
    # invalid category
    check(c.post('/api/v1/admin/products', json={'category': 'nope', 'name': 'X', 'price': 1}, headers=sa).status_code == 400, "invalid category -> 400")
    # create (group derived)
    r = c.post('/api/v1/admin/products', json={'category': 'four', 'name': 'Four test', 'price': 2000, 'stock': 3}, headers=sa)
    check(r.status_code in (200, 201), "superadmin creates product")
    pid = r.get_json()['product']['id']
    check(r.get_json()['product']['group'] == 'appliance', "group derived from category")
    check(c.put(f'/api/v1/admin/products/{pid}', json={'stock': 10}, headers=sa).get_json()['product']['stock'] == 10, "update product")
    check(c.delete(f'/api/v1/admin/products/{pid}', headers=sa).status_code == 200, "delete product")
    check(c.get('/api/v1/admin/products', headers=au).status_code == 403, "agency user blocked from list -> 403")
    check(c.get('/api/v1/admin/products', headers=sa).status_code == 200, "superadmin lists products")

    # --- delete robustness: product referenced by CartItem + OrderItem must not 500 ---
    r = c.post('/api/v1/admin/products', json={'category': 'four', 'name': 'Four à supprimer', 'price': 500, 'stock': 5}, headers=sa)
    pid2 = r.get_json()['product']['id']
    c.post('/api/v1/backoffice/shop/cart/items', json={'product_id': pid2, 'quantity': 1}, headers=au)
    r = c.post('/api/v1/backoffice/shop/orders', json={'delivery_address': 'Rue Y, Casablanca'}, headers=au)
    check(r.status_code in (200, 201), "checkout creates order referencing product")
    oid = r.get_json()['order']['id']
    snapshot_name = r.get_json()['order']['items'][0]['product_name']
    check(CartItem.query.filter_by(product_id=pid2).count() >= 0, "cart item state readable before delete")
    resp = c.delete(f'/api/v1/admin/products/{pid2}', headers=sa)
    check(resp.status_code == 200, "delete product referenced by cart+order -> 200 (not 500)")
    db.session.expire_all()
    check(CartItem.query.filter_by(product_id=pid2).count() == 0, "cart items referencing deleted product removed")
    order_view = c.get(f'/api/v1/backoffice/shop/orders/{oid}', headers=au)
    check(order_view.status_code == 200, "order still readable after product deletion")
    oj = order_view.get_json()['order']
    check(oj['items'][0]['product_name'] == snapshot_name and oj['items'][0]['product_id'] is None,
          "order item snapshot intact, product_id nulled")

sys.exit(1 if FAILS else 0)
