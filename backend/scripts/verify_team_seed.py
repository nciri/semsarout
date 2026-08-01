import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import SubscriptionPlan, Agency, Permission, Role

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    pro = SubscriptionPlan.query.filter_by(slug='pro').first()
    ent = SubscriptionPlan.query.filter_by(slug='enterprise').first()
    st = SubscriptionPlan.query.filter_by(slug='starter').first()
    check(pro and pro.max_seats == 5 and pro.max_teams == 1, "pro 5 seats / 1 team")
    check(ent and ent.max_seats == -1 and ent.max_teams == -1, "enterprise unlimited")
    check(st and st.max_seats == 0, "starter 0 seats")
    check(all(a.owner_id is not None for a in Agency.query.all()), "every agency has owner_id")
    perm = Permission.query.filter_by(slug='team.manage').first()
    check(perm is not None, "team.manage permission exists")
    admin = Role.query.filter_by(slug='admin').first()
    check(admin and admin.has_permission('team.manage'), "admin role has team.manage")

sys.exit(1 if FAILS else 0)
