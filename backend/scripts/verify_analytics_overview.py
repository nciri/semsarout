import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/overview', headers=h)
    check(r.status_code == 200, "overview 200")
    b = r.get_json()
    for k in ('financial','market','pipeline','team','listings','hot_leads','seats','subscription','alerts','config'):
        check(k in b, f"overview has {k}")
    # config round-trip
    r = c.put('/api/v1/backoffice/dashboard/config',
              json={'widgets': [{'id': 'financial', 'order': 0, 'hidden': False}]}, headers=h)
    check(r.status_code == 200, "PUT config ok")
    r = c.put('/api/v1/backoffice/dashboard/config',
              json={'widgets': [{'id': 'bogus', 'order': 0, 'hidden': False}]}, headers=h)
    check(r.status_code == 400, "PUT config unknown id -> 400")

sys.exit(1 if FAILS else 0)
