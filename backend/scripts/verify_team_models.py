"""Run: python3 scripts/verify_team_models.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import SubscriptionPlan, Agency, User, Team, Invitation

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    p = SubscriptionPlan.query.first()
    check(hasattr(p, 'max_seats') and hasattr(p, 'max_teams'), "plan has max_seats/max_teams")
    check('max_seats' in p.to_dict(), "plan.to_dict has max_seats")
    check(hasattr(Agency, 'owner_id'), "Agency.owner_id exists")
    check(hasattr(User, 'team_id'), "User.team_id exists")
    # Team + Invitation tables usable
    a = Agency.query.first()
    t = Team(agency_id=a.id, name='__verify_team__')
    db.session.add(t); db.session.commit()
    check(t.id is not None and t.to_dict()['name'] == '__verify_team__', "Team row + to_dict")
    inv = Invitation(agency_id=a.id, email='x@example.com', token_hash='deadbeef', status='pending')
    db.session.add(inv); db.session.commit()
    d = inv.to_dict()
    check(inv.id is not None and 'token' not in d and 'token_hash' not in d, "Invitation row, token not exposed")
    db.session.delete(inv); db.session.delete(t); db.session.commit()

sys.exit(1 if FAILS else 0)
