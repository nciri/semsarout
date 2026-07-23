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
    r = c.get('/api/v1/backoffice/analytics/team?range=12m', headers=h)
    check(r.status_code == 200, "team 200")
    b = r.get_json()
    for k in ('top_agents','lead_sources','cost_per_lead','best_source'):
        check(k in b.get('summary', {}), f"summary has {k}")
    for k in ('agent_performance','lead_roi_by_source','conversion_by_source','conversion_by_service'):
        check(k in b.get('detail', {}), f"detail has {k}")

sys.exit(1 if FAILS else 0)
