import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    c = app.test_client()
    sa = login(c, 'admin@semsarout.ma', 'admin123')
    h = {'Authorization': f'Bearer {sa}'}
    r = c.get('/api/v1/admin/accounts?per_page=5', headers=h)
    check(r.status_code == 200, "accounts list 200")
    body = r.get_json()
    check('items' in body and 'total' in body, "list has items+total")
    check(all('kind' in it and 'status' in it for it in body['items']), "items have kind+status")
    # search filter narrows results
    r2 = c.get('/api/v1/admin/accounts?q=admin', headers=h)
    check(r2.status_code == 200, "search 200")
    # user detail
    r3 = c.get('/api/v1/admin/accounts/users/1', headers=h)
    check(r3.status_code == 200, "user detail 200")
    check('activity' in r3.get_json(), "user detail has activity")

sys.exit(1 if FAILS else 0)
