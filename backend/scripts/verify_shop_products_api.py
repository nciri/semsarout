import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
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
    # an inactive product must not appear
    inactive = Product(category='chaise', group='furniture', name='__inactive__', price=100, stock=1, is_active=False)
    db.session.add(inactive); db.session.commit()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    check(c.get('/api/v1/backoffice/shop/products').status_code == 401, "products require auth")
    r = c.get('/api/v1/backoffice/shop/categories', headers=h)
    check(r.status_code == 200 and len(r.get_json()['categories']) >= 8, "categories 200")
    r = c.get('/api/v1/backoffice/shop/products', headers=h)
    names = [p['name'] for p in r.get_json()['products']]
    check(r.status_code == 200 and '__inactive__' not in names, "only active products listed")
    r = c.get('/api/v1/backoffice/shop/products?group=appliance', headers=h)
    check(all(p['group'] == 'appliance' for p in r.get_json()['products']), "group filter works")

sys.exit(1 if FAILS else 0)
