import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return (r.status_code, r.get_json())

with app.app_context():
    c = app.test_client()
    _, body = login(c, 'admin@semsarout.ma', 'admin123')
    sa = body['access_token']
    h = {'Authorization': f'Bearer {sa}'}
    demo = User.query.filter_by(email='demo@semsarout.ma').first()

    # Suspend demo
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/suspend',
               json={'reason': 'test'}, headers=h)
    check(r.status_code == 200, "suspend user 200")
    # demo can no longer log in
    st, _ = login(c, 'demo@semsarout.ma', 'demo1234')
    check(st == 403, "suspended user login -> 403")
    # unsuspend
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/unsuspend', headers=h)
    check(r.status_code == 200, "unsuspend 200")
    st, _ = login(c, 'demo@semsarout.ma', 'demo1234')
    check(st == 200, "unsuspended user can log in again")
    # superadmin cannot suspend self
    r = c.post(f'/api/v1/admin/accounts/users/{body["user"]["id"]}/suspend',
               json={'reason': 'x'}, headers=h)
    check(r.status_code == 409, "cannot suspend self -> 409")

sys.exit(1 if FAILS else 0)
