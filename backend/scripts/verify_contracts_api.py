import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Property, Client, ContractTemplate

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
    prop = Property.query.filter_by(agency_id=agency.id).first() or Property.query.first()
    tpl = ContractTemplate.query.filter_by(document_type='mandate_sale', agency_id=None).first()

    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.post('/api/v1/backoffice/contracts',
               json={'template_id': tpl.id, 'title': 'Mandat test', 'property_id': prop.id}, headers=h)
    check(r.status_code in (200, 201), "create contract from template")
    ct = r.get_json().get('contract', {})
    cid = ct.get('id')
    check('{{' not in (ct.get('body_html') or ''), "placeholders rendered (no {{ left)")
    check(ct.get('status') == 'draft', "new contract is draft")
    # edit with malicious html
    r = c.put(f'/api/v1/backoffice/contracts/{cid}',
              json={'body_html': '<p>ok</p><script>alert(1)</script>'}, headers=h)
    check(r.status_code == 200 and '<script>' not in (r.get_json()['contract']['body_html'].lower()), "edit sanitized")
    # list
    r = c.get('/api/v1/backoffice/contracts', headers=h)
    check(r.status_code == 200 and any(x['id'] == cid for x in r.get_json().get('contracts', [])), "list contains contract")

sys.exit(1 if FAILS else 0)
