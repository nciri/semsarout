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
    ag = Agency.query.get(u.agency_id)
    if not ag.owner_id:
        ag.owner_id = u.id
    from app import db; db.session.commit()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/financial?range=12m', headers=h)
    check(r.status_code == 200, "financial 200")
    b = r.get_json()
    for k in ('revenue_realized','revenue_pipeline_weighted','deals_won','deals_lost','avg_deal_size','avg_sales_cycle_days'):
        check(k in b.get('summary', {}), f"summary has {k}")
    for k in ('revenue_trend','commission_by_agent','commission_by_month','win_loss_by_month','deals_by_type'):
        check(k in b.get('detail', {}), f"detail has {k}")
    check(b['summary']['revenue_realized'] >= 0, "revenue_realized non-negative")

sys.exit(1 if FAILS else 0)
