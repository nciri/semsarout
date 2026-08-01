import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import ContractTemplate, SubscriptionPlan

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    for dt in ('mandate_sale', 'mandate_rental', 'compromise', 'lease'):
        t = ContractTemplate.query.filter_by(document_type=dt, agency_id=None, is_builtin=True).first()
        check(t is not None, f"builtin template {dt} seeded")
        check(t and '{{' in t.body_html, f"{dt} has merge placeholders")
    for slug in ('pro', 'enterprise'):
        p = SubscriptionPlan.query.filter_by(slug=slug).first()
        check(p and p.has_contracts is True, f"{slug} has_contracts")

sys.exit(1 if FAILS else 0)
