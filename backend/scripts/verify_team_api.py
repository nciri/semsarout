import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Role, Team

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    # Ensure an agency admin exists and its agency is Pro; find admin creds from seed.
    admin = User.query.filter(User.agency_id.isnot(None)).first()
    agency = Agency.query.get(admin.agency_id)
    pro = SubscriptionPlan.query.filter_by(slug='pro').first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=pro.id, amount=pro.price_monthly, status='active')
        db.session.add(sub)
    else:
        sub.plan_id = pro.id
    if not agency.owner_id:
        agency.owner_id = admin.id
    db.session.commit()

    # A second member of the same agency to exercise role assignment on someone
    # other than the acting admin.
    member = User.query.filter(User.agency_id == agency.id, User.id != admin.id).first()
    if not member:
        member = User(
            email=f'member-verify@{agency.slug or "agency"}.test',
            password_hash=admin.password_hash,
            first_name='Verify', last_name='Member',
            user_type=admin.user_type, agency_id=agency.id, is_active=True,
        )
        db.session.add(member)
        db.session.commit()

    # A custom role scoped to this agency (should be assignable).
    own_role = Role.query.filter_by(agency_id=agency.id).first()
    if not own_role:
        own_role = Role(name=f'Rôle agence {agency.id}', slug=f'agency-{agency.id}-role',
                         level=80, agency_id=agency.id)
        db.session.add(own_role)
        db.session.commit()

    # A second agency with its own custom role (should be rejected for this agency).
    other_agency = Agency.query.filter(Agency.id != agency.id).first()
    if not other_agency:
        other_agency = Agency(name='Autre Agence Verify', slug='autre-agence-verify', email='other-verify@test.ma')
        db.session.add(other_agency)
        db.session.commit()
    foreign_role = Role.query.filter_by(agency_id=other_agency.id).first()
    if not foreign_role:
        foreign_role = Role(name=f'Rôle agence {other_agency.id}', slug=f'agency-{other_agency.id}-role',
                             level=80, agency_id=other_agency.id)
        db.session.add(foreign_role)
        db.session.commit()

    # A global (non agency-specific) role that is NOT a platform role.
    global_role = Role.query.filter(
        Role.agency_id.is_(None), Role.slug != 'superadmin'
    ).filter((Role.level.is_(None)) | (Role.level < 200)).first()

    # The platform superadmin role — must never be assignable via team management.
    superadmin_role = Role.query.filter_by(slug='superadmin').first()

    # A team belonging to the other agency (should be rejected for this agency).
    foreign_team = Team.query.filter_by(agency_id=other_agency.id).first()
    if not foreign_team:
        foreign_team = Team(name='Équipe Autre Agence', agency_id=other_agency.id)
        db.session.add(foreign_team)
        db.session.commit()

    member_id = member.id
    owner_id = agency.owner_id
    own_role_id = own_role.id
    foreign_role_id = foreign_role.id
    global_role_id = global_role.id if global_role else None
    superadmin_role_id = superadmin_role.id if superadmin_role else None
    foreign_team_id = foreign_team.id

    c = app.test_client()
    tok = login(c, admin.email, 'password123')  # agency agents are seeded with this password
    if not tok:
        print("FAIL: could not login agency admin (adjust creds)"); sys.exit(1)
    h = {'Authorization': f'Bearer {tok}'}

    r = c.get('/api/v1/backoffice/team', headers=h)
    check(r.status_code == 200, "GET team 200")
    body = r.get_json()
    check('seats' in body and 'teams_quota' in body, "team payload shape")
    # create team (pro allows 1)
    r = c.post('/api/v1/backoffice/teams', json={'name': 'Équipe A'}, headers=h)
    check(r.status_code in (200, 201), "create first team ok")
    # second team on pro -> 409
    r = c.post('/api/v1/backoffice/teams', json={'name': 'Équipe B'}, headers=h)
    check(r.status_code == 409, "second team on pro -> 409")
    # empty name -> 400 (validated before quota check)
    r = c.post('/api/v1/backoffice/teams', json={'name': '  '}, headers=h)
    check(r.status_code == 400, "empty team name -> 400")

    # Role assignment scoping (agency isolation).
    r = c.put(f'/api/v1/backoffice/team/members/{member_id}', json={'role_id': foreign_role_id}, headers=h)
    check(r.status_code == 400, "assign role from another agency -> 400 (isolation)")

    r = c.put(f'/api/v1/backoffice/team/members/{member_id}', json={'role_id': 9999999}, headers=h)
    check(r.status_code == 400, "assign bogus role_id -> 400")

    r = c.put(f'/api/v1/backoffice/team/members/{member_id}', json={'role_id': own_role_id}, headers=h)
    check(r.status_code == 200, "assign own-agency custom role -> 200")
    if r.status_code == 200:
        role_ids = [ro['id'] for ro in r.get_json().get('member', {}).get('roles', [])]
        check(own_role_id in role_ids, "own-agency role actually applied")

    if global_role_id:
        r = c.put(f'/api/v1/backoffice/team/members/{member_id}', json={'role_id': global_role_id}, headers=h)
        check(r.status_code == 200, "assign global (agency_id=None) role -> 200")
        if r.status_code == 200:
            role_ids = [ro['id'] for ro in r.get_json().get('member', {}).get('roles', [])]
            check(global_role_id in role_ids, "global role actually applied")

    # --- Privilege escalation regression: an agency manager must never be able
    # to grant the platform superadmin role (or another agency's role) to a
    # member, nor change the owner's role via team management. ---
    if superadmin_role_id:
        r = c.put(f'/api/v1/backoffice/team/members/{member_id}',
                  json={'role_id': superadmin_role_id}, headers=h)
        check(r.status_code == 400, "assign superadmin role -> 400 (blocked)")
        db.session.expire_all()
        member_check = User.query.get(member_id)
        check(all(ro.slug != 'superadmin' for ro in member_check.roles),
              "member did NOT gain superadmin role")

        r = c.post('/api/v1/backoffice/team/invitations',
                   json={'email': 'esc@test.com', 'role_id': superadmin_role_id}, headers=h)
        check(r.status_code == 400, "invite with superadmin role -> 400 (blocked)")

    r = c.post('/api/v1/backoffice/team/invitations',
               json={'email': 'esc2@test.com', 'team_id': foreign_team_id}, headers=h)
    check(r.status_code == 400, "invite with team_id from another agency -> 400 (blocked)")

    r = c.post('/api/v1/backoffice/team/invitations',
               json={'email': 'esc3@test.com', 'team_id': 99999999}, headers=h)
    check(r.status_code == 400, "invite with bogus team_id -> 400")

    r = c.put(f'/api/v1/backoffice/team/members/{owner_id}',
              json={'role_id': own_role_id}, headers=h)
    check(r.status_code == 409, "change owner's role -> 409 (owner protected)")

sys.exit(1 if FAILS else 0)
