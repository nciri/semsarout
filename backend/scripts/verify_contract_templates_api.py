import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

def set_plan(agency, slug):
    plan = SubscriptionPlan.query.filter_by(slug=slug).first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=plan.id, amount=plan.price_monthly, status='active'); db.session.add(sub)
    else:
        sub.plan_id = plan.id
    db.session.commit()

with app.app_context():
    admin = User.query.filter(User.agency_id.isnot(None)).first()
    agency = Agency.query.get(admin.agency_id)
    agency.owner_id = admin.id
    # First as PRO: templates readable, but cannot create
    set_plan(agency, 'pro')
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/contract-templates', headers=h)
    check(r.status_code == 200 and len(r.get_json().get('templates', [])) >= 4, "pro reads global templates")
    r = c.post('/api/v1/backoffice/contract-templates',
               json={'name': 'X', 'document_type': 'other', 'body_html': '<p>{{date}}</p>'}, headers=h)
    check(r.status_code == 403, "pro cannot create template (403)")
    # As ENTERPRISE: can create scoped to agency
    set_plan(agency, 'enterprise')
    r = c.post('/api/v1/backoffice/contract-templates',
               json={'name': 'Custom', 'document_type': 'other', 'body_html': '<p onclick=x>{{date}}</p>'}, headers=h)
    check(r.status_code in (200, 201), "enterprise creates template")
    body = r.get_json().get('template', {})
    check('onclick' not in (body.get('body_html') or ''), "template body sanitized")
    # gating: agency with NO has_contracts plan
    set_plan(agency, 'starter')
    r = c.get('/api/v1/backoffice/contract-templates', headers=h)
    check(r.status_code == 403, "starter (no has_contracts) -> 403")

sys.exit(1 if FAILS else 0)
