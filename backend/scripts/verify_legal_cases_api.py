import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription
from app.services.legal_checklists import default_tasks

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    admin = User.query.filter(User.agency_id.isnot(None)).first()
    agency = Agency.query.get(admin.agency_id)
    plan = SubscriptionPlan.query.filter_by(slug='pro').first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=plan.id, amount=plan.price_monthly, status='active'); db.session.add(sub)
    else:
        sub.plan_id = plan.id
    db.session.commit()
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.post('/api/v1/backoffice/legal-cases', json={'title': 'Dossier vente A', 'case_type': 'sale'}, headers=h)
    check(r.status_code in (200, 201), "create legal case")
    cid = r.get_json()['case']['id']
    r = c.get(f'/api/v1/backoffice/legal-cases/{cid}', headers=h)
    body = r.get_json()['case']
    check(len(body['tasks']) == len(default_tasks('sale')), "checklist generated from sale template")
    check(body['tasks_total'] == len(default_tasks('sale')), "tasks_total matches")
    r = c.put(f'/api/v1/backoffice/legal-cases/{cid}', json={'status': 'in_progress'}, headers=h)
    check(r.status_code == 200 and r.get_json()['case']['status'] == 'in_progress', "update status")
    r = c.get('/api/v1/backoffice/legal-cases', headers=h)
    check(r.status_code == 200 and any(x['id'] == cid for x in r.get_json()['cases']), "list contains case")

sys.exit(1 if FAILS else 0)
