import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User, Agency, Role, Permission
from app.services.analytics_scope import analytics_scope

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    check(hasattr(u, 'dashboard_config'), "User.dashboard_config exists")
    check('dashboard_config' in u.to_dict(), "to_dict has dashboard_config")
    check(Permission.query.filter_by(slug='analytics.view_all').first() is not None, "analytics.view_all seeded")
    admin = Role.query.filter_by(slug='admin').first()
    check(admin and admin.has_permission('analytics.view_all'), "admin has analytics.view_all")
    agency = Agency.query.get(u.agency_id)
    if not agency.owner_id:
        agency.owner_id = u.id
    scope = analytics_scope(u, agency)
    check(isinstance(scope, dict) and 'all' in scope and 'agent_id' in scope, "scope shape")
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    if tok:
        r = c.get('/api/v1/backoffice/analytics/ping', headers={'Authorization': f'Bearer {tok}'})
        check(r.status_code == 200, "analytics blueprint mounted (/ping 200)")

sys.exit(1 if FAILS else 0)
