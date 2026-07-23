import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import Notary, LegalCase, LegalTask, Agency, SubscriptionPlan

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    p = SubscriptionPlan.query.first()
    check(hasattr(p, 'has_legal') and 'has_legal' in p.to_dict(), "plan.has_legal + to_dict")
    a = Agency.query.first()
    n = Notary(agency_id=a.id, name='Me Test', city='Casablanca')
    db.session.add(n); db.session.commit()
    check(n.id and n.to_dict()['name'] == 'Me Test', "Notary row+to_dict")
    lc = LegalCase(agency_id=a.id, title='Dossier X', case_type='sale', status='open')
    db.session.add(lc); db.session.commit()
    t = LegalTask(legal_case_id=lc.id, label='Titre foncier', status='todo', position=0)
    db.session.add(t); db.session.commit()
    d = lc.to_dict()
    check('tasks_total' in d and d['tasks_total'] == 1, "LegalCase.to_dict tasks_total")
    check(t.to_dict()['label'] == 'Titre foncier', "LegalTask.to_dict")
    db.session.delete(t); db.session.commit()
    db.session.delete(lc); db.session.delete(n); db.session.commit()

sys.exit(1 if FAILS else 0)
