"""Run: python3 scripts/verify_superadmin_seed.py (after seeding)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import Role, User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    role = Role.query.filter_by(slug='superadmin').first()
    check(role is not None, "superadmin role exists")
    check(role and role.level == 200, "superadmin level == 200")
    check(role and role.is_system is True, "superadmin is_system")
    holders = [u for u in User.query.all()
               if any(r.slug == 'superadmin' for r in u.roles)]
    check(len(holders) >= 1, "at least one superadmin user")
    check(all(u.to_dict()['is_superadmin'] for u in holders), "holders serialize is_superadmin=True")

sys.exit(1 if FAILS else 0)
