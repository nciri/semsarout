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
    set_plan(agency, 'starter')
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/notaries', headers=h)
    check(r.status_code == 403, "starter (no has_legal) -> 403")
    set_plan(agency, 'pro')
    r = c.post('/api/v1/backoffice/notaries', json={'name': 'Me Test', 'city': 'Rabat'}, headers=h)
    check(r.status_code in (200, 201), "create notary")
    nid = r.get_json()['notary']['id']
    r = c.get('/api/v1/backoffice/notaries', headers=h)
    check(r.status_code == 200 and any(n['id'] == nid for n in r.get_json()['notaries']), "list contains notary")
    r = c.put(f'/api/v1/backoffice/notaries/{nid}', json={'city': 'Fès'}, headers=h)
    check(r.status_code == 200 and r.get_json()['notary']['city'] == 'Fès', "update notary")
    r = c.delete(f'/api/v1/backoffice/notaries/{nid}', headers=h)
    check(r.status_code == 200, "delete notary")

sys.exit(1 if FAILS else 0)
