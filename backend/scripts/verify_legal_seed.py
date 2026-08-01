import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import SubscriptionPlan, Notary, Agency
from app.services.legal_checklists import default_tasks

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    check(len(default_tasks('sale')) >= 5, "sale checklist has steps")
    check(len(default_tasks('rental')) >= 3, "rental checklist has steps")
    check(default_tasks('unknown') == default_tasks('sale'), "unknown falls back to sale")
    for slug in ('pro', 'enterprise'):
        p = SubscriptionPlan.query.filter_by(slug=slug).first()
        check(p and p.has_legal is True, f"{slug} has_legal")
    check(Notary.query.count() >= 1, "at least one demo notary seeded")

sys.exit(1 if FAILS else 0)
