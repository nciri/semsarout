import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription

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
    cid = c.post('/api/v1/backoffice/legal-cases', json={'title': 'D', 'case_type': 'sale'}, headers=h).get_json()['case']['id']
    # add task
    r = c.post(f'/api/v1/backoffice/legal-cases/{cid}/tasks', json={'label': 'Étape ajoutée'}, headers=h)
    check(r.status_code in (200, 201), "add task")
    tid = r.get_json()['task']['id']
    # mark done -> completed_at set
    r = c.put(f'/api/v1/backoffice/legal-tasks/{tid}', json={'status': 'done'}, headers=h)
    check(r.status_code == 200 and r.get_json()['task']['completed_at'], "done sets completed_at")
    # back to todo -> completed_at cleared
    r = c.put(f'/api/v1/backoffice/legal-tasks/{tid}', json={'status': 'todo'}, headers=h)
    check(r.status_code == 200 and not r.get_json()['task']['completed_at'], "todo clears completed_at")
    # delete
    r = c.delete(f'/api/v1/backoffice/legal-tasks/{tid}', headers=h)
    check(r.status_code == 200, "delete task")

sys.exit(1 if FAILS else 0)
