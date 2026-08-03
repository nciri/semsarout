import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Artisan

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
    shared = Artisan.query.filter_by(agency_id=None).first()
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    # create without artisan (optional)
    r = c.post('/api/v1/backoffice/work-orders', json={'title': 'Fuite salle de bain', 'trade': 'plombier'}, headers=h)
    check(r.status_code in (200, 201), "create work order without artisan")
    wid = r.get_json()['work_order']['id']
    # invalid trade -> 400
    check(c.post('/api/v1/backoffice/work-orders', json={'title': 'X', 'trade': 'nope'}, headers=h).status_code == 400, "invalid trade -> 400")
    # assign shared artisan + mark done
    r = c.put(f'/api/v1/backoffice/work-orders/{wid}', json={'artisan_id': shared.id, 'status': 'done', 'cost_final': 500}, headers=h)
    b = r.get_json()['work_order']
    check(r.status_code == 200 and b['artisan_id'] == shared.id and b['completed_at'], "assign shared + done sets completed_at")
    # list
    check(any(x['id'] == wid for x in c.get('/api/v1/backoffice/work-orders', headers=h).get_json()['work_orders']), "list contains order")
    # get single
    r = c.get(f'/api/v1/backoffice/work-orders/{wid}', headers=h)
    check(r.status_code == 200 and r.get_json()['work_order']['id'] == wid, "get single work order")
    # foreign property -> 400
    other_agency = Agency.query.filter(Agency.id != agency.id).first()
    from app.models import Property
    foreign_prop = Property.query.filter(Property.agency_id != agency.id).first() if other_agency else None
    if foreign_prop:
        check(c.post('/api/v1/backoffice/work-orders', json={'title': 'Y', 'trade': 'plombier', 'property_id': foreign_prop.id}, headers=h).status_code == 400,
              "foreign property_id -> 400")
    # inaccessible artisan -> 400
    foreign_artisan = Artisan.query.filter(Artisan.agency_id.isnot(None), Artisan.agency_id != agency.id).first()
    if foreign_artisan:
        check(c.post('/api/v1/backoffice/work-orders', json={'title': 'Z', 'trade': 'plombier', 'artisan_id': foreign_artisan.id}, headers=h).status_code == 400,
              "inaccessible artisan_id -> 400")
    # delete
    r = c.delete(f'/api/v1/backoffice/work-orders/{wid}', headers=h)
    check(r.status_code == 200, "delete work order")
    check(c.get(f'/api/v1/backoffice/work-orders/{wid}', headers=h).status_code == 404, "deleted work order -> 404")

sys.exit(1 if FAILS else 0)
