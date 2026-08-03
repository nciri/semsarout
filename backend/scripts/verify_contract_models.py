import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import ContractTemplate, Contract, Agency, SubscriptionPlan

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    p = SubscriptionPlan.query.first()
    check(hasattr(p, 'has_contracts'), "plan.has_contracts exists")
    check('has_contracts' in p.to_dict(), "plan.to_dict has has_contracts")
    a = Agency.query.first()
    t = ContractTemplate(agency_id=None, document_type='mandate_sale', name='__t__',
                         body_html='<p>{{x}}</p>', is_builtin=True)
    db.session.add(t); db.session.commit()
    check(t.id and t.to_dict()['name'] == '__t__', "ContractTemplate row+to_dict")
    c = Contract(agency_id=a.id, title='__c__', document_type='mandate_sale',
                 body_html='<p>hi</p>', status='draft')
    db.session.add(c); db.session.commit()
    d = c.to_dict()
    check(c.id and d['status'] == 'draft', "Contract row+to_dict")
    db.session.delete(c); db.session.delete(t); db.session.commit()

sys.exit(1 if FAILS else 0)
