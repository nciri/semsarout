import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Property

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return (r.status_code, r.get_json())

with app.app_context():
    c = app.test_client()
    _, body = login(c, 'admin@semsarout.ma', 'admin123')
    sa = body['access_token']
    h = {'Authorization': f'Bearer {sa}'}
    demo = User.query.filter_by(email='demo@semsarout.ma').first()

    # Suspend demo
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/suspend',
               json={'reason': 'test'}, headers=h)
    check(r.status_code == 200, "suspend user 200")
    # demo can no longer log in
    st, _ = login(c, 'demo@semsarout.ma', 'demo1234')
    check(st == 403, "suspended user login -> 403")
    # unsuspend
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/unsuspend', headers=h)
    check(r.status_code == 200, "unsuspend 200")
    st, _ = login(c, 'demo@semsarout.ma', 'demo1234')
    check(st == 200, "unsuspended user can log in again")
    # superadmin cannot suspend self
    r = c.post(f'/api/v1/admin/accounts/users/{body["user"]["id"]}/suspend',
               json={'reason': 'x'}, headers=h)
    check(r.status_code == 409, "cannot suspend self -> 409")

    # --- Public search masking: suspended owner's active listings must not leak ---
    # Find an owner with at least one active property (not the superadmin itself).
    owner_row = (db.session.query(Property.owner_id)
                 .filter(Property.status == 'active')
                 .filter(Property.owner_id != body['user']['id'])
                 .first())
    check(owner_row is not None, "found an owner with an active listing to test search masking")

    if owner_row is not None:
        owner_id = owner_row[0]
        owner_active_refs = {
            p.reference for p in Property.query.filter_by(status='active', owner_id=owner_id).all()
        }
        check(len(owner_active_refs) > 0, "owner has at least one active property (non-vacuous)")

        def search_refs():
            r = c.post('/api/v1/properties/search', json={'filters': {}, 'per_page': 100})
            data = r.get_json()
            return r.status_code, {p['reference'] for p in data.get('properties', [])}

        st, refs = search_refs()
        check(st == 200, "public search 200 before suspend")
        check(owner_active_refs & refs == owner_active_refs, "owner's active listings visible in search before suspend")

        r = c.post(f'/api/v1/admin/accounts/users/{owner_id}/suspend',
                   json={'reason': 'test-search-mask'}, headers=h)
        check(r.status_code == 200, "suspend listing owner 200")

        st, refs = search_refs()
        check(st == 200, "public search 200 after suspend")
        check(not (owner_active_refs & refs), "suspended owner's listings hidden from public search")

        r = c.post(f'/api/v1/admin/accounts/users/{owner_id}/unsuspend', headers=h)
        check(r.status_code == 200, "unsuspend listing owner 200")

        st, refs = search_refs()
        check(st == 200, "public search 200 after unsuspend")
        check(owner_active_refs & refs == owner_active_refs, "owner's active listings reappear in search after unsuspend")

sys.exit(1 if FAILS else 0)
