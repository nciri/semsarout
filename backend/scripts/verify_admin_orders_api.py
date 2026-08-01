import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, Order

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    a = Agency.query.first()
    o = Order(reference='CMD-ADMIN1', agency_id=a.id, status='paid', subtotal=100, total=100)
    db.session.add(o); db.session.commit()
    c = app.test_client()
    sa = {'Authorization': f'Bearer {login(c, "admin@semsarout.ma", "admin123")}'}
    r = c.get('/api/v1/admin/orders', headers=sa)
    check(r.status_code == 200 and any(x['id'] == o.id for x in r.get_json()['orders']), "admin lists all orders")
    r = c.put(f'/api/v1/admin/orders/{o.id}', json={'status': 'shipped'}, headers=sa)
    check(r.status_code == 200 and r.get_json()['order']['status'] == 'shipped', "admin updates status")
    check(c.put(f'/api/v1/admin/orders/{o.id}', json={'status': 'nope'}, headers=sa).status_code == 400, "invalid status -> 400")
    db.session.delete(Order.query.get(o.id)); db.session.commit()

sys.exit(1 if FAILS else 0)
