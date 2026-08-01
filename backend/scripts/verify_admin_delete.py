import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.status_code, r.get_json()

with app.app_context():
    c = app.test_client()
    _, body = login(c, 'admin@semsarout.ma', 'admin123')
    h = {'Authorization': f'Bearer {body["access_token"]}'}
    demo = User.query.filter_by(email='demo@semsarout.ma').first()

    r = c.delete(f'/api/v1/admin/accounts/users/{demo.id}', headers=h)
    check(r.status_code == 200, "soft-delete 200")
    st, _ = login(c, 'demo@semsarout.ma', 'demo1234')
    check(st == 403, "deleted user cannot log in")

    # --- M1: idempotent delete is a 200 no-op, not a 409/500 ---
    r2 = c.delete(f'/api/v1/admin/accounts/users/{demo.id}', headers=h)
    check(r2.status_code == 200, "delete already-deleted user -> 200 no-op")
    check(r2.get_json().get('message') == 'Compte déjà supprimé', "no-op response has idempotent message")

    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/restore', headers=h)
    check(r.status_code == 200, "restore 200")
    st, _ = login(c, 'demo@semsarout.ma', 'demo1234')
    check(st == 200, "restored user can log in")
    # anonymize
    r = c.post(f'/api/v1/admin/accounts/users/{demo.id}/anonymize', headers=h)
    check(r.status_code == 200, "anonymize 200")
    db.session.expire_all()
    d2 = User.query.get(demo.id)
    check(d2.anonymized_at is not None, "anonymized_at set")
    check('@semsar.invalid' in d2.email, "email scrubbed")

    # --- M1: idempotent anonymize is a 200 no-op, not a 409/500 ---
    r3 = c.post(f'/api/v1/admin/accounts/users/{demo.id}/anonymize', headers=h)
    check(r3.status_code == 200, "anonymize already-anonymized user -> 200 no-op")
    check(r3.get_json().get('message') == 'Compte déjà anonymisé', "no-op response has idempotent message")
    # cannot delete last superadmin
    r = c.delete(f'/api/v1/admin/accounts/users/{body["user"]["id"]}', headers=h)
    check(r.status_code == 409, "cannot delete self/last superadmin -> 409")

sys.exit(1 if FAILS else 0)
