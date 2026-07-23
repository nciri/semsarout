import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Property, ContractTemplate

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
    r = c.post('/api/v1/backoffice/contracts', json={'template_id': tpl.id, 'property_id': prop.id}, headers=h)
    cid = r.get_json()['contract']['id']
    r = c.post(f'/api/v1/backoffice/contracts/{cid}/finalize', headers=h)
    check(r.status_code == 200, "finalize 200")
    ct = r.get_json()['contract']
    check(ct['status'] == 'finalized' and ct['pdf_url'], "status finalized + pdf_url")
    # cannot edit after finalize
    r = c.put(f'/api/v1/backoffice/contracts/{cid}', json={'body_html': '<p>x</p>'}, headers=h)
    check(r.status_code == 409, "edit after finalize -> 409")
    # download pdf
    r = c.get(f'/api/v1/backoffice/contracts/{cid}/pdf', headers=h)
    check(r.status_code == 200 and r.data[:4] == b'%PDF', "pdf download starts with %PDF")
    # mark signed
    r = c.post(f'/api/v1/backoffice/contracts/{cid}/mark-signed', headers=h)
    check(r.status_code == 200 and r.get_json()['contract']['status'] == 'signed', "mark signed")

sys.exit(1 if FAILS else 0)
