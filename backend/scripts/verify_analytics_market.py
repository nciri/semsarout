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
    u = User.query.filter(User.agency_id.isnot(None)).first()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/market?range=12m', headers=h)
    check(r.status_code == 200, "market 200")
    b = r.get_json()
    for k in ('portfolio_avg_price_sqm','market_avg_price_sqm','price_gap_pct','avg_days_on_market','absorption_rate'):
        check(k in b.get('summary', {}), f"summary has {k}")
    for k in ('price_sqm_by_neighborhood','days_on_market_distribution','portfolio_valuation_by_city','inventory_by_status'):
        check(k in b.get('detail', {}), f"detail has {k}")
    ab = b['summary']['absorption_rate']
    check(0 <= ab <= 1, "absorption_rate in [0,1]")

sys.exit(1 if FAILS else 0)
