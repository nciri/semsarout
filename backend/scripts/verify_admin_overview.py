"""Run: python3 scripts/verify_admin_overview.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

def login(client, email, pwd):
    r = client.post('/api/v1/auth/login', json={'email': email, 'password': pwd})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    c = app.test_client()
    sa = login(c, 'admin@semsarout.ma', 'admin123')
    check(sa is not None, "superadmin can log in")
    # No token -> 401
    r = c.get('/api/v1/admin/overview')
    check(r.status_code == 401, "no token -> 401")
    # Non-superadmin -> 403
    demo = login(c, 'demo@semsarout.ma', 'demo1234')
    if demo:
        r = c.get('/api/v1/admin/overview', headers={'Authorization': f'Bearer {demo}'})
        check(r.status_code == 403, "non-superadmin -> 403")
    # Superadmin -> 200 with KPI shape
    r = c.get('/api/v1/admin/overview', headers={'Authorization': f'Bearer {sa}'})
    check(r.status_code == 200, "superadmin -> 200")
    body = r.get_json()
    for k in ('total_users','total_agencies','active_subscriptions','mrr_estimate',
              'signups_last_30d','suspended_count','deleted_pending_purge_count'):
        check(k in body, f"overview has {k}")

sys.exit(1 if FAILS else 0)
