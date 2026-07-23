import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Invitation

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    from app.services import seats as _seats_probe
    # Pick an agency with headroom under a 5-seat Pro plan (owner excluded);
    # some seeded agencies already have >=5 non-owner members.
    agency = None
    for a in Agency.query.all():
        if _seats_probe.active_member_seats(a) < 5:
            agency = a
            break
    if agency is None:
        agency = Agency.query.first()
    admin = User.query.filter_by(id=agency.owner_id).first() or User.query.filter_by(agency_id=agency.id).first()
    pro = SubscriptionPlan.query.filter_by(slug='pro').first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=pro.id, amount=pro.price_monthly, status='active'); db.session.add(sub)
    else:
        sub.plan_id = pro.id
    agency.owner_id = admin.id
    # clean previous test invitations
    Invitation.query.filter(Invitation.email.like('seat%@test.com')).delete(synchronize_session=False)
    db.session.commit()

    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    if not tok:
        print("FAIL: login (adjust creds)"); sys.exit(1)
    h = {'Authorization': f'Bearer {tok}'}

    # invite up to the 5-seat limit (owner excluded). Count current usage first.
    from app.services import seats
    room = 5 - seats.seats_used(agency)
    last_path = None
    for i in range(room):
        r = c.post('/api/v1/backoffice/team/invitations', json={'email': f'seat{i}@test.com'}, headers=h)
        check(r.status_code in (200, 201), f"invite {i} ok")
        last_path = r.get_json().get('invite_path')
    # next invite exceeds limit -> 409
    r = c.post('/api/v1/backoffice/team/invitations', json={'email': 'seatX@test.com'}, headers=h)
    check(r.status_code == 409, "invite beyond seat limit -> 409")

    # accept the last invitation: extract raw token from invite_path
    token = last_path.rsplit('/', 1)[-1]
    r = c.get(f'/api/v1/invitations/{token}')
    check(r.status_code == 200, "public GET invitation 200")
    r = c.post(f'/api/v1/invitations/{token}/accept',
               json={'first_name': 'New', 'last_name': 'Member', 'password': 'memberpass1'})
    check(r.status_code in (200, 201), "accept invitation ok")
    data = r.get_json()
    check('access_token' in data, "accept returns token (auto-login)")
    new_user = User.query.filter_by(email='seat%d@test.com' % (room - 1)).first()
    check(new_user and new_user.agency_id == agency.id, "member attached to agency")
    # member can log in
    check(login(c, new_user.email, 'memberpass1') is not None, "member can log in")

sys.exit(1 if FAILS else 0)
