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

    # --- M1: idempotent suspend is a 200 no-op, not a 409 ---
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/suspend',
               json={'reason': 'first'}, headers=h)
    check(r.status_code == 200, "suspend demo (idempotency setup) 200")
    r2 = c.post(f'/api/v1/admin/accounts/users/{demo.id}/suspend',
                json={'reason': 'second'}, headers=h)
    check(r2.status_code == 200, "suspend already-suspended user -> 200 no-op")
    check(r2.get_json().get('message') == 'Compte déjà suspendu', "no-op response has idempotent message")
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/unsuspend', headers=h)
    check(r.status_code == 200, "cleanup: unsuspend demo after idempotency test")

    # --- C1: /auth/refresh must re-check moderation status ---
    st, demo_login_body = login(c, 'demo@semsarout.ma', 'demo1234')
    check(st == 200, "demo login to capture refresh token")
    demo_refresh = demo_login_body.get('refresh_token')
    check(bool(demo_refresh), "captured demo refresh_token (non-vacuous)")
    rh = {'Authorization': f'Bearer {demo_refresh}'}
    r = c.post('/api/v1/auth/refresh', headers=rh)
    check(r.status_code == 200, "refresh 200 while account is in good standing")
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/suspend',
               json={'reason': 'test-refresh-block'}, headers=h)
    check(r.status_code == 200, "suspend demo (refresh test) 200")
    r = c.post('/api/v1/auth/refresh', headers=rh)
    check(r.status_code == 403, "refresh blocked for suspended account -> 403")
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/unsuspend', headers=h)
    check(r.status_code == 200, "unsuspend demo (refresh test) 200")
    r = c.post('/api/v1/auth/refresh', headers=rh)
    check(r.status_code == 200, "refresh works again after unsuspend")

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

        # --- C2: property detail must 404 for a moderated owner ---
        listing = Property.query.filter_by(status='active', owner_id=owner_id).first()
        check(listing is not None, "found a listing id for detail-masking test")
        if listing is not None:
            r = c.get(f'/api/v1/properties/{listing.id}')
            check(r.status_code == 200, "property detail 200 before suspend")
            r = c.post(f'/api/v1/admin/accounts/users/{owner_id}/suspend',
                       json={'reason': 'test-detail-mask'}, headers=h)
            check(r.status_code == 200, "suspend listing owner 200 (detail test)")
            r = c.get(f'/api/v1/properties/{listing.id}')
            check(r.status_code == 404, "property detail 404 for suspended owner")
            r = c.post(f'/api/v1/admin/accounts/users/{owner_id}/unsuspend', headers=h)
            check(r.status_code == 200, "unsuspend listing owner 200 (detail test)")
            r = c.get(f'/api/v1/properties/{listing.id}')
            check(r.status_code == 200, "property detail 200 again after unsuspend")

    # --- C2: agency directory/profile/listings must mask a suspended agency ---
    from app.models import Agency
    agency = (Agency.query.filter(Agency.is_active.is_(True), Agency.is_verified.is_(True),
                                   Agency.is_suspended.is_(False), Agency.deleted_at.is_(None))
              .first())
    check(agency is not None, "found a seeded active/verified agency for masking test")
    if agency is not None:
        r = c.get(f'/api/v1/agencies/{agency.slug}')
        check(r.status_code == 200, "agency profile 200 before suspend")
        r = c.get('/api/v1/agencies?per_page=100')
        check(r.status_code == 200, "agency directory 200 before suspend")
        slugs_before = {a['slug'] for a in r.get_json().get('agencies', [])}
        check(agency.slug in slugs_before, "agency present in directory before suspend")

        r = c.post(f'/api/v1/admin/accounts/agencies/{agency.id}/suspend',
                   json={'reason': 'test-agency-mask'}, headers=h)
        check(r.status_code == 200, "suspend agency 200")

        r = c.get(f'/api/v1/agencies/{agency.slug}')
        check(r.status_code == 404, "agency profile 404 after suspend")
        r = c.get('/api/v1/agencies?per_page=100')
        slugs_after = {a['slug'] for a in r.get_json().get('agencies', [])}
        check(agency.slug not in slugs_after, "agency absent from directory after suspend")

        r = c.post(f'/api/v1/admin/accounts/agencies/{agency.id}/unsuspend', headers=h)
        check(r.status_code == 200, "unsuspend agency 200")
        r = c.get(f'/api/v1/agencies/{agency.slug}')
        check(r.status_code == 200, "agency profile 200 again after unsuspend")
        r = c.get('/api/v1/agencies?per_page=100')
        slugs_final = {a['slug'] for a in r.get_json().get('agencies', [])}
        check(agency.slug in slugs_final, "agency reappears in directory after unsuspend")

sys.exit(1 if FAILS else 0)
