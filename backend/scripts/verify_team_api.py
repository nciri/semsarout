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

with app.app_context():
    # Ensure an agency admin exists and its agency is Pro; find admin creds from seed.
    admin = User.query.filter(User.agency_id.isnot(None)).first()
    agency = Agency.query.get(admin.agency_id)
    pro = SubscriptionPlan.query.filter_by(slug='pro').first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=pro.id, amount=pro.price_monthly, status='active')
        db.session.add(sub)
    else:
        sub.plan_id = pro.id
    if not agency.owner_id:
        agency.owner_id = admin.id
    db.session.commit()

    c = app.test_client()
    tok = login(c, admin.email, 'password123')  # agency agents are seeded with this password
    if not tok:
        print("FAIL: could not login agency admin (adjust creds)"); sys.exit(1)
    h = {'Authorization': f'Bearer {tok}'}

    r = c.get('/api/v1/backoffice/team', headers=h)
    check(r.status_code == 200, "GET team 200")
    body = r.get_json()
    check('seats' in body and 'teams_quota' in body, "team payload shape")
    # create team (pro allows 1)
    r = c.post('/api/v1/backoffice/teams', json={'name': 'Équipe A'}, headers=h)
    check(r.status_code in (200, 201), "create first team ok")
    # second team on pro -> 409
    r = c.post('/api/v1/backoffice/teams', json={'name': 'Équipe B'}, headers=h)
    check(r.status_code == 409, "second team on pro -> 409")

sys.exit(1 if FAILS else 0)
