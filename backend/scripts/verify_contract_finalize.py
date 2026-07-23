import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Property, ContractTemplate
from app.models.client import Client
from app.models.transaction import Transaction, TransactionDocument

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

    # Link a transaction so finalize exercises the TransactionDocument creation path.
    client = Client.query.filter_by(agency_id=agency.id).first()
    if not client:
        client = Client(agency_id=agency.id, first_name='Test', last_name='Client', client_type='buyer')
        db.session.add(client)
        db.session.commit()
    txn = Transaction.query.filter_by(property_id=prop.id, client_id=client.id).first()
    if not txn:
        txn = Transaction(reference=f'TXN-VERIFY-{prop.id}', property_id=prop.id, client_id=client.id,
                           agent_id=admin.id, transaction_type='sale', agency_id=agency.id)
        db.session.add(txn)
        db.session.commit()

    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.post('/api/v1/backoffice/contracts', json={'template_id': tpl.id, 'property_id': prop.id,
                                                       'transaction_id': txn.id}, headers=h)
    cid = r.get_json()['contract']['id']
    r = c.post(f'/api/v1/backoffice/contracts/{cid}/finalize', headers=h)
    check(r.status_code == 200, "finalize 200")
    ct = r.get_json()['contract']
    check(ct['status'] == 'finalized' and ct['pdf_url'], "status finalized + pdf_url")
    # re-finalizing an already-finalized contract must be rejected, and must
    # not duplicate the TransactionDocument row nor rewrite the PDF
    doc_count_before = TransactionDocument.query.filter_by(file_url=ct['pdf_url']).count()
    r = c.post(f'/api/v1/backoffice/contracts/{cid}/finalize', headers=h)
    check(r.status_code == 409, "re-finalize already-finalized -> 409")
    doc_count_after = TransactionDocument.query.filter_by(file_url=ct['pdf_url']).count()
    check(doc_count_before == 1 and doc_count_after == 1, "no duplicate TransactionDocument on re-finalize")
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
