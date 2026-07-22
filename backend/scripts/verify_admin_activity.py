import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token')

with app.app_context():
    c = app.test_client()
    sa = login(c, 'admin@semsarout.ma', 'admin123')
    h = {'Authorization': f'Bearer {sa}'}
    r = c.get('/api/v1/admin/activity?per_page=10', headers=h)
    check(r.status_code == 200, "activity 200")
    b = r.get_json()
    check('items' in b and 'total' in b, "activity has items+total")

sys.exit(1 if FAILS else 0)
