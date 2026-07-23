import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, Role
from app.services import seats

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    # Pick an agency whose owner is a real (non-superadmin) agency user, so
    # `admin` can genuinely manage the team via the owner-bypass in
    # seats.can_manage_team. Prefer an agency that already has an owner set
    # (from prior verify runs); otherwise pick one and appoint its first
    # non-superadmin member as owner.
    agency = None
    admin = None
    for cand_agency in Agency.query.order_by(Agency.id).all():
        if cand_agency.owner_id:
            owner = User.query.get(cand_agency.owner_id)
            if owner and owner.agency_id == cand_agency.id and \
                    all(getattr(r, 'slug', None) != 'superadmin' for r in owner.roles):
                agency = cand_agency
                admin = owner
                break
    if agency is None:
        for cand_agency in Agency.query.order_by(Agency.id).all():
            member_candidates = User.query.filter(User.agency_id == cand_agency.id).all()
            non_sa = [u for u in member_candidates
                      if all(getattr(r, 'slug', None) != 'superadmin' for r in u.roles)]
            if non_sa:
                agency = cand_agency
                admin = non_sa[0]
                agency.owner_id = admin.id
                db.session.commit()
                break
    if agency is None or admin is None:
        print("FAIL: no agency with a non-superadmin member found in seed data"); sys.exit(1)
    if not seats.can_manage_team(admin, agency):
        print("FAIL: chosen admin cannot manage team (adjust selection)"); sys.exit(1)

    # A same-agency member (not the owner/admin, not a superadmin) to escalate.
    member = None
    for candidate in User.query.filter(User.agency_id == agency.id, User.id != admin.id).all():
        if all(getattr(r, 'slug', None) != 'superadmin' for r in candidate.roles):
            member = candidate
            break
    if not member:
        member = User(
            email=f'escalate-verify@{agency.slug or "agency"}.test',
            password_hash=admin.password_hash,
            first_name='Escalate', last_name='Member',
            user_type=admin.user_type, agency_id=agency.id, is_active=True,
        )
        db.session.add(member)
        db.session.commit()

    # A legit custom role scoped to this agency.
    own_role = Role.query.filter_by(agency_id=agency.id).first()
    if not own_role:
        own_role = Role(name=f'Rôle agence {agency.id}', slug=f'agency-{agency.id}-role',
                         level=80, agency_id=agency.id)
        db.session.add(own_role)
        db.session.commit()

    superadmin_role = Role.query.filter_by(slug='superadmin').first()

    # A non-manager agency user (no team.manage permission, not the owner).
    non_manager = None
    for candidate in User.query.filter(
        User.agency_id == agency.id, User.id != admin.id, User.id != member.id
    ).all():
        if all(getattr(r, 'slug', None) != 'superadmin' for r in candidate.roles) \
                and candidate.id != agency.owner_id:
            non_manager = candidate
            break
    if not non_manager:
        non_manager = User(
            email=f'nonmanager-verify@{agency.slug or "agency"}.test',
            password_hash=admin.password_hash,
            first_name='Non', last_name='Manager',
            user_type=admin.user_type, agency_id=agency.id, is_active=True,
        )
        db.session.add(non_manager)
        db.session.commit()
    non_manager.roles = []
    db.session.commit()

    member_id = member.id
    own_role_id = own_role.id
    superadmin_role_id = superadmin_role.id if superadmin_role else None
    non_manager_email = non_manager.email

    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    if not tok:
        print("FAIL: could not login agency admin (adjust creds)"); sys.exit(1)
    h = {'Authorization': f'Bearer {tok}'}

    # --- The critical escalation: assigning superadmin via update_user_roles ---
    if superadmin_role_id:
        r = c.put(f'/api/v1/backoffice/users/{member_id}/roles',
                  json={'roles': [superadmin_role_id]}, headers=h)
        check(r.status_code in (400, 403), "assign superadmin via update_user_roles -> 400/403 (blocked)")
        db.session.expire_all()
        member_check = User.query.get(member_id)
        check(all(ro.slug != 'superadmin' for ro in member_check.roles),
              "member did NOT become superadmin")

    # --- Legit same-agency role assignment still works ---
    r = c.put(f'/api/v1/backoffice/users/{member_id}/roles',
              json={'roles': [own_role_id]}, headers=h)
    check(r.status_code == 200, "assign legit own-agency role -> 200")
    db.session.expire_all()
    member_check = User.query.get(member_id)
    check(any(ro.id == own_role_id for ro in member_check.roles),
          "own-agency role actually applied")

    # --- Owner protection ---
    r = c.put(f'/api/v1/backoffice/users/{agency.owner_id}/roles',
              json={'roles': [own_role_id]}, headers=h)
    check(r.status_code == 409, "change owner's role via update_user_roles -> 409")

    # --- Non-manager agency user cannot use the endpoint ---
    tok2 = login(c, non_manager_email, 'password123')
    if tok2:
        h2 = {'Authorization': f'Bearer {tok2}'}
        r = c.put(f'/api/v1/backoffice/users/{member_id}/roles',
                  json={'roles': [own_role_id]}, headers=h2)
        check(r.status_code == 403, "non-manager agency user -> 403")
    else:
        print("SKIP: could not login non-manager (password mismatch in seed)")

sys.exit(1 if FAILS else 0)
