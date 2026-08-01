import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User, Agency

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    ag = Agency.query.filter(Agency.owner_id.isnot(None)).first()
    u = User.query.get(ag.owner_id) if ag else None
    if not u:
        u = User.query.filter(User.agency_id.isnot(None)).first()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/pipeline?range=12m', headers=h)
    check(r.status_code == 200, "pipeline 200")
    b = r.get_json()
    s = b.get('summary', {})
    check('funnel' in s and 'closed' in s['funnel'], "summary funnel")
    f = s['funnel']
    check(f['leads'] >= f['qualified'] >= f['visits'] >= f['offers'] >= f['closed'],
          "funnel monotonic (leads >= qualified >= visits >= offers >= closed)")
    check(0 <= s['conversion_overall_pct'] <= 100, "conversion in [0,100]")
    for k in ('funnel_stages','conversion_by_stage','stage_velocity_days','expected_closings_timeline'):
        check(k in b.get('detail', {}), f"detail has {k}")
    for row in b.get('detail', {}).get('conversion_by_stage', []):
        check(0 <= row['pct'] <= 100, f"conversion_by_stage[{row.get('from')}] in [0,100]")

sys.exit(1 if FAILS else 0)
