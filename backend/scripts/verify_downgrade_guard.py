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
    admin = User.query.filter(User.agency_id.isnot(None)).first()
    agency = Agency.query.get(admin.agency_id)
    agency.owner_id = admin.id
    ent = SubscriptionPlan.query.filter_by(slug='enterprise').first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=ent.id, amount=ent.price_monthly, status='active'); db.session.add(sub)
    else:
        sub.plan_id = ent.id
    # Create 7 extra members (beyond owner) so Pro's 5-seat limit is exceeded
    for i in range(7):
        em = f'bulk{i}@test.com'
        u = User.query.filter_by(email=em).first()
        if not u:
            u = User(email=em, first_name='B', last_name=str(i), agency_id=agency.id, is_active=True)
            u.set_password('x'*10); db.session.add(u)
        else:
            u.agency_id = agency.id
    db.session.commit()

    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    # add a default payment method requirement may block earlier; downgrade guard must trigger first OR we assert 409 either way for seat reason
    r = c.post('/api/v1/subscription/change-plan', json={'plan_id': 'pro'}, headers=h)
    check(r.status_code == 409, "downgrade to pro with too many members -> 409")
    check('membre' in (r.get_json() or {}).get('error', '').lower(), "409 mentions members")

sys.exit(1 if FAILS else 0)
