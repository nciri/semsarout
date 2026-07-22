import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from flask_jwt_extended import decode_token
from app.models import User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json()

with app.app_context():
    c = app.test_client()
    body = login(c, 'admin@semsarout.ma', 'admin123')
    sa_id = body['user']['id']
    h = {'Authorization': f'Bearer {body["access_token"]}'}
    target = User.query.filter(User.email != 'admin@semsarout.ma',
                               User.deleted_at.is_(None)).first()
    r = c.post(f'/api/v1/admin/accounts/users/{target.id}/impersonate', headers=h)
    check(r.status_code == 200, "impersonate 200")
    tok = r.get_json()['access_token']
    claims = decode_token(tok)
    check(str(claims['sub']) == str(target.id), "token identity is target")
    check(claims.get('impersonated_by') == sa_id, "impersonated_by claim set")
    # cannot impersonate a superadmin (self)
    r = c.post(f'/api/v1/admin/accounts/users/{sa_id}/impersonate', headers=h)
    check(r.status_code == 409, "cannot impersonate superadmin -> 409")

sys.exit(1 if FAILS else 0)
