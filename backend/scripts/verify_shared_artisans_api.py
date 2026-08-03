import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import Artisan, Agency

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
    # non-superadmin blocked
    agency = Agency.query.first()
    # create shared
    r = c.post('/api/v1/admin/shared-artisans', json={'trade': 'serrurier', 'name': 'Clés & Serrures'}, headers=h)
    check(r.status_code in (200, 201), "superadmin creates shared artisan")
    aid = r.get_json()['artisan']['id']
    check(Artisan.query.get(aid).agency_id is None, "shared artisan has agency_id None")
    # cannot edit a PRIVATE artisan via shared route
    priv = Artisan.query.filter(Artisan.agency_id.isnot(None)).first()
    if priv:
        check(c.put(f'/api/v1/admin/shared-artisans/{priv.id}', json={'name': 'X'}, headers=h).status_code == 404, "cannot edit private via shared route -> 404")
    check(c.get('/api/v1/admin/shared-artisans', headers=h).status_code == 200, "list shared 200")

sys.exit(1 if FAILS else 0)
