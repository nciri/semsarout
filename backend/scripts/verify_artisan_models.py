import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import Artisan, WorkOrder, Agency, SubscriptionPlan

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    p = SubscriptionPlan.query.first()
    check(hasattr(p, 'has_artisans') and 'has_artisans' in p.to_dict(), "plan.has_artisans + to_dict")
    a = Agency.query.first()
    shared = Artisan(agency_id=None, trade='plombier', name='Plomberie Pro')
    db.session.add(shared); db.session.commit()
    check(shared.to_dict()['is_shared'] is True, "shared artisan is_shared True")
    priv = Artisan(agency_id=a.id, trade='peintre', name='Peintures X')
    db.session.add(priv); db.session.commit()
    check(priv.to_dict()['is_shared'] is False, "private artisan is_shared False")
    wo = WorkOrder(agency_id=a.id, artisan_id=priv.id, title='Repeindre appart', trade='peintre', status='requested')
    db.session.add(wo); db.session.commit()
    d = wo.to_dict()
    check(d['status'] == 'requested' and d.get('artisan'), "WorkOrder to_dict + artisan summary")
    db.session.delete(wo); db.session.commit()
    db.session.delete(priv); db.session.delete(shared); db.session.commit()

sys.exit(1 if FAILS else 0)
