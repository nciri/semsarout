import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import Agency, SubscriptionPlan, Subscription, User, Invitation
from app.services import seats
from datetime import datetime, timedelta

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    # Attach a Pro plan (5 seats) to an agency for the test
    a = Agency.query.first()
    pro = SubscriptionPlan.query.filter_by(slug='pro').first()
    sub = Subscription.query.filter_by(agency_id=a.id).first()
    if not sub:
        sub = Subscription(agency_id=a.id, plan_id=pro.id, amount=pro.price_monthly, status='active')
        db.session.add(sub)
    else:
        sub.plan_id = pro.id
    db.session.commit()

    check(seats.seats_limit(a) == 5, "pro seat limit 5")
    base = seats.seats_used(a)
    inv = Invitation(agency_id=a.id, email='pending@x.com', token_hash='h1',
                     status='pending', expires_at=datetime.utcnow()+timedelta(days=3))
    db.session.add(inv); db.session.commit()
    check(seats.seats_used(a) == base + 1, "pending invitation consumes a seat")
    inv.status = 'revoked'; db.session.commit()
    check(seats.seats_used(a) == base, "revoked invitation frees the seat")
    db.session.delete(inv); db.session.commit()

sys.exit(1 if FAILS else 0)
