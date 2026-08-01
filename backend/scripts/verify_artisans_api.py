import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Artisan

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
    shared = Artisan.query.filter_by(agency_id=None).first()
    set_plan(agency, 'starter')
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    check(c.get('/api/v1/backoffice/artisans', headers=h).status_code == 403, "starter -> 403")
    set_plan(agency, 'pro')
    r = c.get('/api/v1/backoffice/artisans', headers=h)
    ids = [a['id'] for a in r.get_json()['artisans']]
    check(r.status_code == 200 and shared.id in ids, "GET returns shared artisan")
    # invalid trade
    check(c.post('/api/v1/backoffice/artisans', json={'trade': 'nope', 'name': 'X'}, headers=h).status_code == 400, "invalid trade -> 400")
    # create private
    r = c.post('/api/v1/backoffice/artisans', json={'trade': 'plombier', 'name': 'Mon Plombier'}, headers=h)
    check(r.status_code in (200, 201), "create private artisan")
    aid = r.get_json()['artisan']['id']
    # cannot edit the SHARED artisan
    check(c.put(f'/api/v1/backoffice/artisans/{shared.id}', json={'name': 'Hack'}, headers=h).status_code == 404, "cannot edit shared -> 404")
    # can edit own
    check(c.put(f'/api/v1/backoffice/artisans/{aid}', json={'city': 'Fès'}, headers=h).status_code == 200, "edit own artisan")

sys.exit(1 if FAILS else 0)
