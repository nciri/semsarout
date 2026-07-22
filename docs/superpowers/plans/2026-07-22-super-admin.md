# Super-admin plateforme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a platform-level super-admin area (`/admin`) that lets Semsar staff view, moderate (suspend / soft-delete / anonymize), audit, and impersonate every user and agency, above the existing per-agency backoffice.

**Architecture:** New Flask blueprint `admin_bp` under `/api/v1/admin`, guarded by a `require_superadmin` decorator (JWT role check, no agency scoping). Moderation state lives as nullable columns on `users` and `agencies`; a shared `moderation` service holds anonymize / login-block / guard logic (DRY, testable). A new React route tree `/admin/*` guarded by `SuperAdminRoute` consumes an `adminService`. Impersonation mints a short-lived JWT carrying an `impersonated_by` claim; the frontend swaps the active session and shows a permanent banner.

**Tech Stack:** Flask 3 + SQLAlchemy + Flask-Migrate + flask-jwt-extended (backend); React + react-router + zustand + react-query + axios + TailwindCSS (frontend). Spec: `docs/superpowers/specs/2026-07-22-super-admin-design.md`.

## Global Constraints

- **JWT identity is always `str(user.id)`** — never trust a client header for identity (see commit `a8982cb`).
- **Money is MAD**, amounts are `Numeric(10,2)`; MRR is a sum of active monthly-normalized `subscriptions.amount`.
- **No pytest infra exists.** Verification = standalone Python scripts under `backend/scripts/` run with `python3`, using `app.test_client()` (convention mirrors `backend/reset_programs.py`). Each prints `PASS`/`FAIL` and exits non-zero on failure.
- **Frontend API calls go through the shared `api` axios instance** (`frontend/src/services/api.js`) — never a raw `fetch`/`axios` (see commit `8554083`).
- **Role level convention (real):** higher level = more powerful (`admin`=100 in `seed_backoffice.py:77`). `superadmin` = **200**. Detect super-admin via the explicit `is_superadmin` boolean in `User.to_dict()`, never via `user.role`.
- **Never hard-code secrets.** The bootstrap super-admin is designated by env var `SUPERADMIN_EMAIL`, documented in `.env.example`.
- **French UI copy**, matching existing pages.
- **Soft-delete + anonymize semantics:** `deleted_at` = archived/reversible; `anonymized_at` = PII scrubbed (irreversible). Retention window before auto-anonymize = **90 days**.
- Run backend commands from `backend/` with the venv: `cd backend && source venv/bin/activate`.

---

### Task 1: Moderation fields on User & Agency + `is_superadmin` + anonymize helper + migration

**Files:**
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/agency.py`
- Create: `backend/migrations/versions/a1b2c3d4e5f6_add_account_moderation_fields.py`
- Test: `backend/scripts/verify_model_moderation.py`

**Interfaces:**
- Produces:
  - `User.is_suspended: bool`, `User.suspended_at: datetime|None`, `User.suspended_reason: str|None`, `User.deleted_at: datetime|None`, `User.anonymized_at: datetime|None`
  - `Agency` same five columns
  - `User.to_dict()` now includes `'is_superadmin': bool`, `'is_suspended': bool`, `'deleted_at': iso|None`, `'suspended_reason': str|None`, `'anonymized_at': iso|None`
  - `Agency.to_dict()` includes the same moderation keys
  - `User.moderation_state()` -> `'active' | 'suspended' | 'deleted'` (helper used by later tasks)

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_model_moderation.py`:

```python
"""Verify moderation fields + is_superadmin serialization. Run: python3 scripts/verify_model_moderation.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User

FAILS = []
def check(cond, msg):
    print(("PASS" if cond else "FAIL") + f": {msg}")
    if not cond: FAILS.append(msg)

with app.app_context():
    u = User.query.first()
    check(hasattr(u, 'is_suspended'), "User.is_suspended exists")
    check(hasattr(u, 'deleted_at'), "User.deleted_at exists")
    check(hasattr(u, 'anonymized_at'), "User.anonymized_at exists")
    d = u.to_dict()
    check('is_superadmin' in d, "to_dict has is_superadmin")
    check(d['is_superadmin'] is False, "regular user is_superadmin False")
    check(u.moderation_state() == 'active', "fresh user moderation_state active")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_model_moderation.py`
Expected: FAIL (AttributeError / missing `is_suspended`).

- [ ] **Step 3: Add columns + helpers to `User`**

In `backend/app/models/user.py`, after the `last_login` column add:

```python
    # Platform moderation (super-admin)
    is_suspended = db.Column(db.Boolean, default=False, nullable=False)
    suspended_at = db.Column(db.DateTime, nullable=True)
    suspended_reason = db.Column(db.String(255), nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    anonymized_at = db.Column(db.DateTime, nullable=True)
```

Add a helper method (below `full_name` property):

```python
    def moderation_state(self):
        """Return 'deleted' | 'suspended' | 'active'."""
        if self.deleted_at is not None:
            return 'deleted'
        if self.is_suspended:
            return 'suspended'
        return 'active'
```

In `to_dict()`, compute and add the new keys. Replace the `return {` block's tail so it includes:

```python
        is_superadmin = any(getattr(r, 'slug', None) == 'superadmin'
                            for r in (list(self.roles) if hasattr(self, 'roles') else []))
        return {
            # ... keep all existing keys ...
            'is_superadmin': is_superadmin,
            'is_suspended': bool(self.is_suspended),
            'suspended_reason': self.suspended_reason,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'anonymized_at': self.anonymized_at.isoformat() if self.anonymized_at else None,
        }
```

(Keep every existing key already in `to_dict`; only append the five new keys and the `is_superadmin` computation.)

- [ ] **Step 4: Add the same columns + moderation keys to `Agency`**

In `backend/app/models/agency.py`, add the identical five columns. In `Agency.to_dict()` append:

```python
            'is_suspended': bool(self.is_suspended),
            'suspended_reason': self.suspended_reason,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'anonymized_at': self.anonymized_at.isoformat() if self.anonymized_at else None,
```

Add helper:

```python
    def moderation_state(self):
        if self.deleted_at is not None:
            return 'deleted'
        if self.is_suspended:
            return 'suspended'
        return 'active'
```

- [ ] **Step 5: Create the migration**

Create `backend/migrations/versions/a1b2c3d4e5f6_add_account_moderation_fields.py`. Set `down_revision` to the current head — find it with `cd backend && source venv/bin/activate && flask db heads` and paste that value.

```python
"""Add account moderation fields to users and agencies."""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'REPLACE_WITH_CURRENT_HEAD'
branch_labels = None
depends_on = None

_COLS = [
    ('is_suspended', sa.Boolean(), {'nullable': False, 'server_default': sa.false()}),
    ('suspended_at', sa.DateTime(), {'nullable': True}),
    ('suspended_reason', sa.String(length=255), {'nullable': True}),
    ('deleted_at', sa.DateTime(), {'nullable': True}),
    ('anonymized_at', sa.DateTime(), {'nullable': True}),
]

def upgrade():
    for table in ('users', 'agencies'):
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name, type_, kw in _COLS:
                batch_op.add_column(sa.Column(name, type_, **kw))

def downgrade():
    for table in ('users', 'agencies'):
        with op.batch_alter_table(table, schema=None) as batch_op:
            for name, _type, _kw in reversed(_COLS):
                batch_op.drop_column(name)
```

- [ ] **Step 6: Apply the migration**

Run: `cd backend && source venv/bin/activate && flask db upgrade`
Expected: `Running upgrade ... -> a1b2c3d4e5f6, Add account moderation fields`.

- [ ] **Step 7: Run the verification script, verify it passes**

Run: `python3 scripts/verify_model_moderation.py`
Expected: all `PASS`, exit 0.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/user.py backend/app/models/agency.py backend/migrations/versions/a1b2c3d4e5f6_add_account_moderation_fields.py backend/scripts/verify_model_moderation.py
git commit -m "feat(admin): champs de modération (suspend/soft-delete/anonymize) sur users & agencies"
```

---

### Task 2: Seed the `superadmin` role and assign it via `SUPERADMIN_EMAIL`

**Files:**
- Modify: `backend/seed_backoffice.py`
- Modify: `backend/.env.example`
- Test: `backend/scripts/verify_superadmin_seed.py`

**Interfaces:**
- Produces: a `Role(slug='superadmin', level=200, is_system=True)` and the user whose email equals `SUPERADMIN_EMAIL` carries it. Consumed by `require_superadmin` (Task 3).

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_superadmin_seed.py`:

```python
"""Run: python3 scripts/verify_superadmin_seed.py (after seeding)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import Role, User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    role = Role.query.filter_by(slug='superadmin').first()
    check(role is not None, "superadmin role exists")
    check(role and role.level == 200, "superadmin level == 200")
    check(role and role.is_system is True, "superadmin is_system")
    holders = [u for u in User.query.all()
               if any(r.slug == 'superadmin' for r in u.roles)]
    check(len(holders) >= 1, "at least one superadmin user")
    check(all(u.to_dict()['is_superadmin'] for u in holders), "holders serialize is_superadmin=True")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_superadmin_seed.py`
Expected: FAIL (no superadmin role).

- [ ] **Step 3: Document the env var**

In `backend/.env.example`, add:

```
# Email of the bootstrap platform super-admin (must match a seeded user)
SUPERADMIN_EMAIL=admin@semsarout.ma
```

- [ ] **Step 4: Seed the role and assign it**

In `backend/seed_backoffice.py`, in the roles list (around line 77) add an entry:

```python
        {'name': 'Super Admin', 'slug': 'superadmin', 'level': 200, 'permissions': all_permissions},
```

After the users get their roles assigned (after the loop that does `user.roles.append(...)`, near line 155), append:

```python
    # Assign the platform super-admin role to SUPERADMIN_EMAIL
    import os
    sa_email = os.environ.get('SUPERADMIN_EMAIL', 'admin@semsarout.ma')
    sa_role = Role.query.filter_by(slug='superadmin').first()
    sa_user = User.query.filter_by(email=sa_email).first()
    if sa_role and sa_user and sa_role not in sa_user.roles:
        sa_user.roles.append(sa_role)
        print(f"  Assigned superadmin to {sa_email}")
    db.session.commit()
```

- [ ] **Step 5: Re-run the backoffice seed**

Run: `cd backend && source venv/bin/activate && python3 seed_backoffice.py`
Expected: prints `Assigned superadmin to admin@semsarout.ma`.

- [ ] **Step 6: Run the verification script, verify it passes**

Run: `python3 scripts/verify_superadmin_seed.py`
Expected: all `PASS`.

- [ ] **Step 7: Commit**

```bash
git add backend/seed_backoffice.py backend/.env.example backend/scripts/verify_superadmin_seed.py
git commit -m "feat(admin): rôle superadmin (level 200) seedé et attribué via SUPERADMIN_EMAIL"
```

---

### Task 3: `require_superadmin` decorator, `admin_bp` blueprint, registration, and `GET /overview`

**Files:**
- Create: `backend/app/api/v1/admin/__init__.py`
- Create: `backend/app/api/v1/admin/overview.py`
- Modify: `backend/app/api/v1/__init__.py`
- Test: `backend/scripts/verify_admin_overview.py`

**Interfaces:**
- Produces:
  - `admin_bp` (Flask Blueprint, `url_prefix='/admin'`) registered on `api_v1_bp` → routes live at `/api/v1/admin/...`
  - `require_superadmin` decorator: sets `g.current_user`; returns 401 (no/invalid token) or 403 (not superadmin)
  - `GET /api/v1/admin/overview` → `{total_users, total_agencies, active_subscriptions:{plan_slug:count}, mrr_estimate, signups_last_30d, suspended_count, deleted_pending_purge_count}`
- Consumes: `User.roles`, `Subscription`, `SubscriptionPlan` from Task 1 models.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_admin_overview.py`:

```python
"""Run: python3 scripts/verify_admin_overview.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

def login(client, email, pwd):
    r = client.post('/api/v1/auth/login', json={'email': email, 'password': pwd})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    c = app.test_client()
    sa = login(c, 'admin@semsarout.ma', 'admin123')
    check(sa is not None, "superadmin can log in")
    # No token -> 401
    r = c.get('/api/v1/admin/overview')
    check(r.status_code == 401, "no token -> 401")
    # Non-superadmin -> 403
    demo = login(c, 'demo@semsarout.ma', 'demo1234')
    if demo:
        r = c.get('/api/v1/admin/overview', headers={'Authorization': f'Bearer {demo}'})
        check(r.status_code == 403, "non-superadmin -> 403")
    # Superadmin -> 200 with KPI shape
    r = c.get('/api/v1/admin/overview', headers={'Authorization': f'Bearer {sa}'})
    check(r.status_code == 200, "superadmin -> 200")
    body = r.get_json()
    for k in ('total_users','total_agencies','active_subscriptions','mrr_estimate',
              'signups_last_30d','suspended_count','deleted_pending_purge_count'):
        check(k in body, f"overview has {k}")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_admin_overview.py`
Expected: FAIL (404 on `/admin/overview`).

- [ ] **Step 3: Create the blueprint + decorator**

Create `backend/app/api/v1/admin/__init__.py`:

```python
"""Platform super-admin API (above per-agency backoffice)."""
from functools import wraps
from flask import Blueprint, jsonify, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from app.models import User

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


def require_superadmin(f):
    """Require a valid JWT whose user carries the 'superadmin' role. No agency scoping."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception:
            return jsonify({'error': 'Authorization required'}), 401
        identity = get_jwt_identity()
        user = User.query.get(int(identity)) if identity else None
        if not user:
            return jsonify({'error': 'Invalid token'}), 401
        if not any(getattr(r, 'slug', None) == 'superadmin' for r in user.roles):
            return jsonify({'error': 'Super-admin access required'}), 403
        g.current_user = user
        return f(*args, **kwargs)
    return decorated


# Import routes so they register on admin_bp
from app.api.v1.admin import overview  # noqa: E402,F401
```

- [ ] **Step 4: Implement the overview endpoint**

Create `backend/app/api/v1/admin/overview.py`:

```python
from datetime import datetime, timedelta
from flask import jsonify
from sqlalchemy import func
from app import db
from app.models import User, Agency, Subscription, SubscriptionPlan
from app.api.v1.admin import admin_bp, require_superadmin


@admin_bp.route('/overview', methods=['GET'])
@require_superadmin
def get_overview():
    total_users = User.query.filter(User.deleted_at.is_(None)).count()
    total_agencies = Agency.query.filter(Agency.deleted_at.is_(None)).count()

    # Active subscriptions grouped by plan slug
    rows = (db.session.query(SubscriptionPlan.slug, func.count(Subscription.id))
            .join(Subscription, Subscription.plan_id == SubscriptionPlan.id)
            .filter(Subscription.status == 'active')
            .group_by(SubscriptionPlan.slug).all())
    active_subscriptions = {slug: count for slug, count in rows}

    # MRR: monthly-normalized amount of active subscriptions
    active = Subscription.query.filter(Subscription.status == 'active').all()
    mrr = 0.0
    for s in active:
        amt = float(s.amount or 0)
        mrr += amt / 12.0 if s.billing_cycle == 'yearly' else amt

    since = datetime.utcnow() - timedelta(days=30)
    signups_last_30d = User.query.filter(User.created_at >= since).count()
    suspended_count = (User.query.filter(User.is_suspended.is_(True)).count()
                       + Agency.query.filter(Agency.is_suspended.is_(True)).count())
    deleted_pending = (User.query.filter(User.deleted_at.isnot(None),
                                         User.anonymized_at.is_(None)).count()
                       + Agency.query.filter(Agency.deleted_at.isnot(None),
                                             Agency.anonymized_at.is_(None)).count())

    return jsonify({
        'total_users': total_users,
        'total_agencies': total_agencies,
        'active_subscriptions': active_subscriptions,
        'mrr_estimate': round(mrr, 2),
        'signups_last_30d': signups_last_30d,
        'suspended_count': suspended_count,
        'deleted_pending_purge_count': deleted_pending,
    })
```

- [ ] **Step 5: Register the blueprint**

In `backend/app/api/v1/__init__.py`, after the backoffice registration add:

```python
# Import admin (platform super-admin) blueprint
from app.api.v1.admin import admin_bp
api_v1_bp.register_blueprint(admin_bp)
```

- [ ] **Step 6: Run the verification script, verify it passes**

Run: `python3 scripts/verify_admin_overview.py`
Expected: all `PASS`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/admin/__init__.py backend/app/api/v1/admin/overview.py backend/app/api/v1/__init__.py backend/scripts/verify_admin_overview.py
git commit -m "feat(admin): blueprint /admin + require_superadmin + overview KPIs"
```

---

### Task 4: Accounts list & detail endpoints (users + agencies)

**Files:**
- Create: `backend/app/api/v1/admin/accounts.py`
- Modify: `backend/app/api/v1/admin/__init__.py` (import the new module)
- Test: `backend/scripts/verify_admin_accounts.py`

**Interfaces:**
- Produces:
  - `GET /api/v1/admin/accounts?type=&status=&plan=&q=&page=&per_page=` → `{items:[{kind:'user'|'agency', id, name, email, status, plan, last_login, listings_count}], total, page, pages}`
  - `GET /api/v1/admin/accounts/users/:id` → `{user, agency, activity:[...], listings_count}`
  - `GET /api/v1/admin/accounts/agencies/:id` → `{agency, members:[...], subscription, listings_count}`
- Consumes: `require_superadmin`, models from Task 1; `ActivityLog` for the timeline.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_admin_accounts.py`:

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    c = app.test_client()
    sa = login(c, 'admin@semsarout.ma', 'admin123')
    h = {'Authorization': f'Bearer {sa}'}
    r = c.get('/api/v1/admin/accounts?per_page=5', headers=h)
    check(r.status_code == 200, "accounts list 200")
    body = r.get_json()
    check('items' in body and 'total' in body, "list has items+total")
    check(all('kind' in it and 'status' in it for it in body['items']), "items have kind+status")
    # search filter narrows results
    r2 = c.get('/api/v1/admin/accounts?q=admin', headers=h)
    check(r2.status_code == 200, "search 200")
    # user detail
    r3 = c.get('/api/v1/admin/accounts/users/1', headers=h)
    check(r3.status_code == 200, "user detail 200")
    check('activity' in r3.get_json(), "user detail has activity")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_admin_accounts.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement accounts endpoints**

Create `backend/app/api/v1/admin/accounts.py`:

```python
from flask import jsonify, request
from sqlalchemy import or_
from app import db
from app.models import User, Agency, Property, ActivityLog
from app.api.v1.admin import admin_bp, require_superadmin


def _user_row(u):
    return {
        'kind': 'user', 'id': u.id, 'name': u.full_name, 'email': u.email,
        'status': u.moderation_state(), 'plan': None,
        'last_login': u.last_login.isoformat() if u.last_login else None,
        'listings_count': Property.query.filter_by(owner_id=u.id).count(),
    }


def _agency_row(a):
    sub = a.subscription
    return {
        'kind': 'agency', 'id': a.id, 'name': a.name,
        'email': getattr(a, 'email', None), 'status': a.moderation_state(),
        'plan': sub.plan.slug if sub and sub.plan else None,
        'last_login': None,
        'listings_count': Property.query.filter_by(agency_id=a.id).count(),
    }


@admin_bp.route('/accounts', methods=['GET'])
@require_superadmin
def list_accounts():
    kind = request.args.get('type')          # 'user' | 'agency' | None(both)
    status = request.args.get('status')       # 'active'|'suspended'|'deleted'
    q = request.args.get('q', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    rows = []
    if kind in (None, 'user'):
        uq = User.query
        if q:
            uq = uq.filter(or_(User.email.ilike(f'%{q}%'),
                               User.first_name.ilike(f'%{q}%'),
                               User.last_name.ilike(f'%{q}%')))
        rows += [_user_row(u) for u in uq.all()]
    if kind in (None, 'agency'):
        aq = Agency.query
        if q:
            aq = aq.filter(Agency.name.ilike(f'%{q}%'))
        rows += [_agency_row(a) for a in aq.all()]

    if status:
        rows = [r for r in rows if r['status'] == status]
    if request.args.get('plan'):
        rows = [r for r in rows if r['plan'] == request.args.get('plan')]

    rows.sort(key=lambda r: (r['name'] or '').lower())
    total = len(rows)
    start = (page - 1) * per_page
    items = rows[start:start + per_page]
    pages = (total + per_page - 1) // per_page if per_page else 1
    return jsonify({'items': items, 'total': total, 'page': page, 'pages': pages})


def _activity_for(entity_type, entity_id, limit=30):
    logs = (ActivityLog.query
            .filter(ActivityLog.entity_type == entity_type,
                    ActivityLog.entity_id == entity_id)
            .order_by(ActivityLog.created_at.desc()).limit(limit).all())
    return [l.to_dict() for l in logs]


@admin_bp.route('/accounts/users/<int:user_id>', methods=['GET'])
@require_superadmin
def user_detail(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({
        'user': u.to_dict(),
        'agency': u.agency.to_dict() if u.agency else None,
        'listings_count': Property.query.filter_by(owner_id=u.id).count(),
        'activity': _activity_for('user', u.id),
    })


@admin_bp.route('/accounts/agencies/<int:agency_id>', methods=['GET'])
@require_superadmin
def agency_detail(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    sub = a.subscription
    return jsonify({
        'agency': a.to_dict(),
        'members': [m.to_dict() for m in a.members],
        'subscription': sub.to_dict() if sub else None,
        'listings_count': Property.query.filter_by(agency_id=a.id).count(),
        'activity': _activity_for('agency', a.id),
    })
```

Note: if `Agency` has no `email` column, `_agency_row` uses `getattr(..., None)` so it is safe. If `Agency.subscription` is a list rather than scalar, replace `a.subscription` with `(a.subscription[0] if a.subscription else None)` — check the relationship in `backend/app/models/agency.py` before running.

- [ ] **Step 4: Register the module**

In `backend/app/api/v1/admin/__init__.py`, extend the import line:

```python
from app.api.v1.admin import overview, accounts  # noqa: E402,F401
```

- [ ] **Step 5: Run the verification script, verify it passes**

Run: `python3 scripts/verify_admin_accounts.py`
Expected: all `PASS`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/admin/accounts.py backend/app/api/v1/admin/__init__.py backend/scripts/verify_admin_accounts.py
git commit -m "feat(admin): endpoints liste + détail des comptes (users & agences)"
```

---

### Task 5: Moderation service, suspend/unsuspend endpoints, login enforcement + public masking

**Files:**
- Create: `backend/app/services/moderation.py`
- Create: `backend/app/api/v1/admin/moderation.py`
- Modify: `backend/app/api/v1/admin/__init__.py`
- Modify: `backend/app/api/v1/auth.py` (login enforcement)
- Modify: `backend/app/api/v1/properties.py` (mask suspended/deleted owners)
- Test: `backend/scripts/verify_admin_suspend.py`

**Interfaces:**
- Produces (in `app/services/moderation.py`):
  - `is_login_blocked(user) -> (blocked: bool, reason: str|None)` — true if user or its agency is suspended/deleted
  - `count_active_superadmins() -> int`
  - `log_admin_action(actor, action, entity_type, entity_id, extra=None) -> None`
  - `suspend_user(user, reason)`, `unsuspend_user(user)`, `suspend_agency(agency, reason)`, `unsuspend_agency(agency)`
- Produces endpoints:
  - `POST /api/v1/admin/accounts/users/:id/suspend` `{reason}` · `/unsuspend`
  - `POST /api/v1/admin/accounts/agencies/:id/suspend` `{reason}` · `/unsuspend`
- Consumes: `require_superadmin`, `g.current_user`, models.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_admin_suspend.py`:

```python
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

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_admin_suspend.py`
Expected: FAIL (404 on suspend).

- [ ] **Step 3: Implement the moderation service**

Create `backend/app/services/moderation.py`:

```python
"""Shared platform-moderation logic (super-admin). Kept out of route modules for reuse/testing."""
from datetime import datetime
from app import db
from app.models import User, ActivityLog


def is_login_blocked(user):
    """Return (blocked, reason) if the user or its agency is suspended/deleted."""
    if user.deleted_at is not None:
        return True, 'Ce compte a été supprimé.'
    if user.is_suspended:
        return True, user.suspended_reason or 'Ce compte a été suspendu.'
    agency = user.agency
    if agency is not None:
        if agency.deleted_at is not None:
            return True, "L'agence de ce compte a été supprimée."
        if agency.is_suspended:
            return True, agency.suspended_reason or "L'agence de ce compte a été suspendue."
    return False, None


def count_active_superadmins():
    return sum(1 for u in User.query.filter(User.deleted_at.is_(None), User.is_suspended.is_(False)).all()
               if any(r.slug == 'superadmin' for r in u.roles))


def log_admin_action(actor, action, entity_type, entity_id, extra=None):
    db.session.add(ActivityLog(
        user_id=actor.id, action=action, entity_type=entity_type,
        entity_id=entity_id, extra_data=extra or {}))


def suspend_user(user, reason):
    user.is_suspended = True
    user.suspended_at = datetime.utcnow()
    user.suspended_reason = reason


def unsuspend_user(user):
    user.is_suspended = False
    user.suspended_at = None
    user.suspended_reason = None


def suspend_agency(agency, reason):
    agency.is_suspended = True
    agency.suspended_at = datetime.utcnow()
    agency.suspended_reason = reason


def unsuspend_agency(agency):
    agency.is_suspended = False
    agency.suspended_at = None
    agency.suspended_reason = None
```

- [ ] **Step 4: Implement the suspend/unsuspend endpoints**

Create `backend/app/api/v1/admin/moderation.py`:

```python
from flask import jsonify, request, g
from app import db
from app.models import User, Agency
from app.api.v1.admin import admin_bp, require_superadmin
from app.services import moderation as mod


def _is_superadmin(user):
    return any(r.slug == 'superadmin' for r in user.roles)


@admin_bp.route('/accounts/users/<int:user_id>/suspend', methods=['POST'])
@require_superadmin
def suspend_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    if u.id == g.current_user.id:
        return jsonify({'error': 'Vous ne pouvez pas vous suspendre vous-même.'}), 409
    if _is_superadmin(u) and mod.count_active_superadmins() <= 1:
        return jsonify({'error': 'Impossible de suspendre le dernier super-admin.'}), 409
    reason = (request.get_json(silent=True) or {}).get('reason')
    mod.suspend_user(u, reason)
    mod.log_admin_action(g.current_user, 'suspend', 'user', u.id, {'reason': reason})
    db.session.commit()
    return jsonify({'message': 'Compte suspendu', 'user': u.to_dict()})


@admin_bp.route('/accounts/users/<int:user_id>/unsuspend', methods=['POST'])
@require_superadmin
def unsuspend_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    mod.unsuspend_user(u)
    mod.log_admin_action(g.current_user, 'unsuspend', 'user', u.id)
    db.session.commit()
    return jsonify({'message': 'Compte réactivé', 'user': u.to_dict()})


@admin_bp.route('/accounts/agencies/<int:agency_id>/suspend', methods=['POST'])
@require_superadmin
def suspend_agency_route(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    reason = (request.get_json(silent=True) or {}).get('reason')
    mod.suspend_agency(a, reason)
    mod.log_admin_action(g.current_user, 'suspend', 'agency', a.id, {'reason': reason})
    db.session.commit()
    return jsonify({'message': 'Agence suspendue', 'agency': a.to_dict()})


@admin_bp.route('/accounts/agencies/<int:agency_id>/unsuspend', methods=['POST'])
@require_superadmin
def unsuspend_agency_route(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    mod.unsuspend_agency(a)
    mod.log_admin_action(g.current_user, 'unsuspend', 'agency', a.id)
    db.session.commit()
    return jsonify({'message': 'Agence réactivée', 'agency': a.to_dict()})
```

Extend the import in `backend/app/api/v1/admin/__init__.py`:

```python
from app.api.v1.admin import overview, accounts, moderation  # noqa: E402,F401
```

- [ ] **Step 5: Enforce at login**

In `backend/app/api/v1/auth.py`, in `login()`, replace the `if not user.is_active:` block with:

```python
    if not user.is_active:
        return jsonify({'error': 'Account is deactivated'}), 403

    from app.services.moderation import is_login_blocked
    blocked, reason = is_login_blocked(user)
    if blocked:
        return jsonify({'error': reason}), 403
```

- [ ] **Step 6: Mask suspended/deleted owners from the public listing**

In `backend/app/api/v1/properties.py`, right after `query = Property.query.filter(Property.status == 'active')` (line ~42), add:

```python
    # Hide listings whose owner or agency is suspended/deleted (platform moderation)
    from app.models import User as _User, Agency as _Agency
    query = (query.join(_User, Property.owner_id == _User.id)
             .filter(_User.is_suspended.is_(False), _User.deleted_at.is_(None))
             .outerjoin(_Agency, Property.agency_id == _Agency.id)
             .filter(db.or_(_Agency.id.is_(None),
                            db.and_(_Agency.is_suspended.is_(False),
                                    _Agency.deleted_at.is_(None)))))
```

Ensure `db` is imported in that file (it is used elsewhere; if not, add `from app import db`).

- [ ] **Step 7: Run the verification script, verify it passes**

Run: `python3 scripts/verify_admin_suspend.py`
Expected: all `PASS`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/moderation.py backend/app/api/v1/admin/moderation.py backend/app/api/v1/admin/__init__.py backend/app/api/v1/auth.py backend/app/api/v1/properties.py backend/scripts/verify_admin_suspend.py
git commit -m "feat(admin): suspension comptes + blocage login + masquage annonces public"
```

---

### Task 6: Soft-delete / restore / anonymize endpoints + guards

**Files:**
- Modify: `backend/app/services/moderation.py` (add anonymize + delete/restore helpers)
- Modify: `backend/app/api/v1/admin/moderation.py` (add routes)
- Test: `backend/scripts/verify_admin_delete.py`

**Interfaces:**
- Produces in service:
  - `soft_delete_user(user)`, `restore_user(user)`, `soft_delete_agency(agency)`, `restore_agency(agency)`
  - `anonymize_user(user)` — scrubs PII, sets `anonymized_at`
- Produces endpoints:
  - `DELETE /api/v1/admin/accounts/users/:id` · `POST …/restore` · `POST …/anonymize`
  - `DELETE /api/v1/admin/accounts/agencies/:id` · `POST …/restore`
- Consumes: guards `count_active_superadmins`, `_is_superadmin`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_admin_delete.py`:

```python
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
    # cannot delete last superadmin
    r = c.delete(f'/api/v1/admin/accounts/users/{body["user"]["id"]}', headers=h)
    check(r.status_code == 409, "cannot delete self/last superadmin -> 409")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_admin_delete.py`
Expected: FAIL (404).

- [ ] **Step 3: Add service helpers**

Append to `backend/app/services/moderation.py`:

```python
import secrets


def soft_delete_user(user):
    user.deleted_at = datetime.utcnow()
    user.is_suspended = True  # also blocks login immediately


def restore_user(user):
    user.deleted_at = None
    user.is_suspended = False
    user.suspended_at = None
    user.suspended_reason = None


def soft_delete_agency(agency):
    agency.deleted_at = datetime.utcnow()
    agency.is_suspended = True


def restore_agency(agency):
    agency.deleted_at = None
    agency.is_suspended = False
    agency.suspended_at = None
    agency.suspended_reason = None


def anonymize_user(user):
    """Irreversible PII scrub. Keeps FK-linked records intact."""
    user.email = f'deleted+{user.id}@semsar.invalid'
    user.first_name = 'Compte'
    user.last_name = 'supprimé'
    user.phone = None
    user.avatar_url = None
    user.reset_token = None
    user.reset_token_expires = None
    user.set_password(secrets.token_urlsafe(32))
    if user.deleted_at is None:
        user.deleted_at = datetime.utcnow()
    user.is_suspended = True
    user.anonymized_at = datetime.utcnow()
```

- [ ] **Step 4: Add the endpoints**

Append to `backend/app/api/v1/admin/moderation.py`:

```python
@admin_bp.route('/accounts/users/<int:user_id>', methods=['DELETE'])
@require_superadmin
def delete_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    if u.id == g.current_user.id:
        return jsonify({'error': 'Vous ne pouvez pas supprimer votre propre compte.'}), 409
    if _is_superadmin(u) and mod.count_active_superadmins() <= 1:
        return jsonify({'error': 'Impossible de supprimer le dernier super-admin.'}), 409
    mod.soft_delete_user(u)
    mod.log_admin_action(g.current_user, 'delete', 'user', u.id)
    db.session.commit()
    return jsonify({'message': 'Compte supprimé', 'user': u.to_dict()})


@admin_bp.route('/accounts/users/<int:user_id>/restore', methods=['POST'])
@require_superadmin
def restore_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    if u.anonymized_at is not None:
        return jsonify({'error': 'Compte anonymisé : restauration impossible.'}), 409
    mod.restore_user(u)
    mod.log_admin_action(g.current_user, 'restore', 'user', u.id)
    db.session.commit()
    return jsonify({'message': 'Compte restauré', 'user': u.to_dict()})


@admin_bp.route('/accounts/users/<int:user_id>/anonymize', methods=['POST'])
@require_superadmin
def anonymize_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    if u.id == g.current_user.id:
        return jsonify({'error': 'Vous ne pouvez pas vous anonymiser vous-même.'}), 409
    if _is_superadmin(u) and mod.count_active_superadmins() <= 1:
        return jsonify({'error': 'Impossible d\'anonymiser le dernier super-admin.'}), 409
    mod.anonymize_user(u)
    mod.log_admin_action(g.current_user, 'anonymize', 'user', u.id)
    db.session.commit()
    return jsonify({'message': 'Compte anonymisé', 'user': u.to_dict()})


@admin_bp.route('/accounts/agencies/<int:agency_id>', methods=['DELETE'])
@require_superadmin
def delete_agency_route(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    mod.soft_delete_agency(a)
    mod.log_admin_action(g.current_user, 'delete', 'agency', a.id)
    db.session.commit()
    return jsonify({'message': 'Agence supprimée', 'agency': a.to_dict()})


@admin_bp.route('/accounts/agencies/<int:agency_id>/restore', methods=['POST'])
@require_superadmin
def restore_agency_route(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    mod.restore_agency(a)
    mod.log_admin_action(g.current_user, 'restore', 'agency', a.id)
    db.session.commit()
    return jsonify({'message': 'Agence restaurée', 'agency': a.to_dict()})
```

- [ ] **Step 5: Run the verification script, verify it passes**

Run: `python3 scripts/verify_admin_delete.py`
Expected: all `PASS`.

Then re-seed to restore the demo user for later tasks: `python3 seed_backoffice.py` (or note the demo account is now anonymized — acceptable for dev DB).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/moderation.py backend/app/api/v1/admin/moderation.py backend/scripts/verify_admin_delete.py
git commit -m "feat(admin): soft-delete, restauration et anonymisation RGPD des comptes"
```

---

### Task 7: Global activity feed endpoint

**Files:**
- Create: `backend/app/api/v1/admin/activity.py`
- Modify: `backend/app/api/v1/admin/__init__.py`
- Test: `backend/scripts/verify_admin_activity.py`

**Interfaces:**
- Produces: `GET /api/v1/admin/activity?entity_type=&actor_id=&page=&per_page=` → `{items:[ActivityLog.to_dict()], total, page, pages}` ordered newest-first.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_admin_activity.py`:

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token')

with app.app_context():
    c = app.test_client()
    sa = login(c, 'admin@semsarout.ma', 'admin123')
    h = {'Authorization': f'Bearer {sa}'}
    r = c.get('/api/v1/admin/activity?per_page=10', headers=h)
    check(r.status_code == 200, "activity 200")
    b = r.get_json()
    check('items' in b and 'total' in b, "activity has items+total")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_admin_activity.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement the activity endpoint**

Create `backend/app/api/v1/admin/activity.py`:

```python
from flask import jsonify, request
from app.models import ActivityLog
from app.api.v1.admin import admin_bp, require_superadmin


@admin_bp.route('/activity', methods=['GET'])
@require_superadmin
def global_activity():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 30, type=int)
    q = ActivityLog.query
    if request.args.get('entity_type'):
        q = q.filter(ActivityLog.entity_type == request.args.get('entity_type'))
    if request.args.get('actor_id', type=int):
        q = q.filter(ActivityLog.user_id == request.args.get('actor_id', type=int))
    q = q.order_by(ActivityLog.created_at.desc())
    p = q.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({'items': [l.to_dict() for l in p.items],
                    'total': p.total, 'page': p.page, 'pages': p.pages})
```

Extend the import in `backend/app/api/v1/admin/__init__.py`:

```python
from app.api.v1.admin import overview, accounts, moderation, activity  # noqa: E402,F401
```

- [ ] **Step 4: Run the verification script, verify it passes**

Run: `python3 scripts/verify_admin_activity.py`
Expected: all `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/admin/activity.py backend/app/api/v1/admin/__init__.py backend/scripts/verify_admin_activity.py
git commit -m "feat(admin): fil d'activité global de la plateforme"
```

---

### Task 8: Impersonation endpoint (backend)

**Files:**
- Create: `backend/app/api/v1/admin/impersonation.py`
- Modify: `backend/app/api/v1/admin/__init__.py`
- Test: `backend/scripts/verify_admin_impersonate.py`

**Interfaces:**
- Produces: `POST /api/v1/admin/accounts/users/:id/impersonate` → `{access_token, user}` where the JWT has `additional_claims={'impersonated_by': <superadmin_id>}` and a 30-minute expiry. Refuses (409) impersonating a superadmin; refuses (403) if target deleted.
- Consumes: `require_superadmin`, `g.current_user`, `create_access_token`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_admin_impersonate.py`:

```python
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_admin_impersonate.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement impersonation**

Create `backend/app/api/v1/admin/impersonation.py`:

```python
from datetime import timedelta
from flask import jsonify, g
from flask_jwt_extended import create_access_token
from app import db
from app.models import User
from app.api.v1.admin import admin_bp, require_superadmin
from app.services import moderation as mod


@admin_bp.route('/accounts/users/<int:user_id>/impersonate', methods=['POST'])
@require_superadmin
def impersonate(user_id):
    target = User.query.get(user_id)
    if not target:
        return jsonify({'error': 'User not found'}), 404
    if target.deleted_at is not None:
        return jsonify({'error': 'Compte supprimé : impersonation impossible.'}), 403
    if any(r.slug == 'superadmin' for r in target.roles):
        return jsonify({'error': 'Impossible de se faire passer pour un super-admin.'}), 409
    token = create_access_token(
        identity=str(target.id),
        additional_claims={'impersonated_by': g.current_user.id},
        expires_delta=timedelta(minutes=30))
    mod.log_admin_action(g.current_user, 'impersonate_start', 'user', target.id)
    db.session.commit()
    return jsonify({'access_token': token, 'user': target.to_dict()})
```

Extend the import in `backend/app/api/v1/admin/__init__.py`:

```python
from app.api.v1.admin import overview, accounts, moderation, activity, impersonation  # noqa: E402,F401
```

- [ ] **Step 4: Run the verification script, verify it passes**

Run: `python3 scripts/verify_admin_impersonate.py`
Expected: all `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/admin/impersonation.py backend/app/api/v1/admin/__init__.py backend/scripts/verify_admin_impersonate.py
git commit -m "feat(admin): impersonation (JWT court + claim impersonated_by + audit)"
```

---

### Task 9: `purge-deleted` CLI command (RGPD auto-anonymize at J+90)

**Files:**
- Create: `backend/app/commands.py`
- Modify: `backend/app/__init__.py` (register commands)
- Modify: `README.md` (document the cron)
- Test: `backend/scripts/verify_purge.py`

**Interfaces:**
- Produces: Flask CLI command `flask purge-deleted` that anonymizes users with `deleted_at < now-90d` and `anonymized_at IS NULL`, logs each, and prints a count. Idempotent.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_purge.py`:

```python
import os, sys
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User
from app.commands import purge_deleted_accounts  # function form for testability

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    # Arrange: a user deleted 100 days ago, not anonymized
    u = User.query.filter_by(email='demo@semsarout.ma').first()
    u.deleted_at = datetime.utcnow() - timedelta(days=100)
    u.anonymized_at = None
    db.session.commit()

    n = purge_deleted_accounts(retention_days=90)
    check(n >= 1, "purge anonymized at least one account")
    db.session.expire_all()
    u2 = User.query.get(u.id)
    check(u2.anonymized_at is not None, "old deleted user is anonymized")
    check('@semsar.invalid' in u2.email, "email scrubbed by purge")

    # Idempotent: running again anonymizes nothing new
    n2 = purge_deleted_accounts(retention_days=90)
    check(n2 == 0, "purge is idempotent")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_purge.py`
Expected: FAIL (ImportError: no `app.commands`).

- [ ] **Step 3: Implement the command**

Create `backend/app/commands.py`:

```python
"""Platform maintenance CLI commands."""
from datetime import datetime, timedelta
import click
from flask.cli import with_appcontext
from app import db
from app.models import User
from app.services.moderation import anonymize_user, log_admin_action


def purge_deleted_accounts(retention_days=90):
    """Anonymize accounts soft-deleted more than retention_days ago. Returns count."""
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    stale = User.query.filter(User.deleted_at.isnot(None),
                              User.deleted_at < cutoff,
                              User.anonymized_at.is_(None)).all()
    for u in stale:
        anonymize_user(u)
        # actor = the account itself (system purge); entity is the user
        log_admin_action(u, 'purge_anonymize', 'user', u.id, {'auto': True})
    db.session.commit()
    return len(stale)


@click.command('purge-deleted')
@click.option('--retention-days', default=90, show_default=True, type=int)
@with_appcontext
def purge_deleted_command(retention_days):
    """Anonymize accounts deleted more than N days ago (RGPD)."""
    count = purge_deleted_accounts(retention_days=retention_days)
    click.echo(f'Anonymized {count} account(s).')


def register_commands(app):
    app.cli.add_command(purge_deleted_command)
```

- [ ] **Step 4: Register the command in the factory**

In `backend/app/__init__.py`, inside `create_app`, before `return app`, add:

```python
    from app.commands import register_commands
    register_commands(app)
```

- [ ] **Step 5: Run the verification script, verify it passes**

Run: `python3 scripts/verify_purge.py`
Expected: all `PASS`.

- [ ] **Step 6: Verify the CLI is wired**

Run: `flask purge-deleted --retention-days 90`
Expected: prints `Anonymized 0 account(s).` (nothing left after the test).

- [ ] **Step 7: Document the cron in README**

Add to `README.md` (a "Maintenance / RGPD" subsection):

```markdown
### Purge RGPD des comptes supprimés

Les comptes supprimés (soft-delete) restent restaurables 90 jours, puis sont anonymisés.
Brancher la commande sur un cron quotidien :

    0 3 * * *  cd /chemin/backend && source venv/bin/activate && flask purge-deleted
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/commands.py backend/app/__init__.py backend/scripts/verify_purge.py README.md
git commit -m "feat(admin): commande purge-deleted (anonymisation auto RGPD à J+90)"
```

---

### Task 10: Frontend — adminService, authStore impersonation, SuperAdminRoute

**Files:**
- Create: `frontend/src/services/adminService.js`
- Modify: `frontend/src/store/authStore.js`
- Create: `frontend/src/components/auth/SuperAdminRoute.jsx`
- Test: manual + build (this task has no runtime UI yet; verified via Task 13 smoke test)

**Interfaces:**
- Produces:
  - `adminService` with: `getOverview()`, `getAccounts(params)`, `getUser(id)`, `getAgency(id)`, `suspendUser(id, reason)`, `unsuspendUser(id)`, `deleteUser(id)`, `restoreUser(id)`, `anonymizeUser(id)`, `suspendAgency(id, reason)`, `unsuspendAgency(id)`, `deleteAgency(id)`, `restoreAgency(id)`, `getActivity(params)`, `impersonate(id)`
  - `authStore`: `startImpersonation(user, token)`, `stopImpersonation()`, and state `impersonating: bool`, `impersonatedUser: {...}|null`
  - `SuperAdminRoute` component (guards `/admin/*`)

- [ ] **Step 1: Create the admin service**

Create `frontend/src/services/adminService.js`:

```javascript
import api from './api'

export const adminService = {
  getOverview: async () => (await api.get('/admin/overview')).data,
  getAccounts: async (params = {}) => (await api.get('/admin/accounts', { params })).data,
  getUser: async (id) => (await api.get(`/admin/accounts/users/${id}`)).data,
  getAgency: async (id) => (await api.get(`/admin/accounts/agencies/${id}`)).data,
  suspendUser: async (id, reason) => (await api.post(`/admin/accounts/users/${id}/suspend`, { reason })).data,
  unsuspendUser: async (id) => (await api.post(`/admin/accounts/users/${id}/unsuspend`)).data,
  deleteUser: async (id) => (await api.delete(`/admin/accounts/users/${id}`)).data,
  restoreUser: async (id) => (await api.post(`/admin/accounts/users/${id}/restore`)).data,
  anonymizeUser: async (id) => (await api.post(`/admin/accounts/users/${id}/anonymize`)).data,
  suspendAgency: async (id, reason) => (await api.post(`/admin/accounts/agencies/${id}/suspend`, { reason })).data,
  unsuspendAgency: async (id) => (await api.post(`/admin/accounts/agencies/${id}/unsuspend`)).data,
  deleteAgency: async (id) => (await api.delete(`/admin/accounts/agencies/${id}`)).data,
  restoreAgency: async (id) => (await api.post(`/admin/accounts/agencies/${id}/restore`)).data,
  getActivity: async (params = {}) => (await api.get('/admin/activity', { params })).data,
  impersonate: async (id) => (await api.post(`/admin/accounts/users/${id}/impersonate`)).data,
}
```

- [ ] **Step 2: Add impersonation to the auth store**

In `frontend/src/store/authStore.js`, add state fields and two actions. Add to the initial state object:

```javascript
      impersonating: false,
      impersonatedUser: null,
```

Add these actions (after `updateUser`):

```javascript
      startImpersonation: (targetUser, token) => {
        const s = get()
        // Snapshot the super-admin session so we can restore it on exit
        localStorage.setItem('semsar.adminAuth', JSON.stringify({
          user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken,
        }))
        localStorage.setItem('token', token)
        localStorage.setItem('userId', String(targetUser.id))
        set({
          user: targetUser, accessToken: token,
          isAuthenticated: true, impersonating: true, impersonatedUser: targetUser,
        })
      },

      stopImpersonation: () => {
        const raw = localStorage.getItem('semsar.adminAuth')
        localStorage.removeItem('semsar.adminAuth')
        if (!raw) { get().logout(); return }
        const admin = JSON.parse(raw)
        localStorage.setItem('token', admin.accessToken)
        localStorage.setItem('userId', String(admin.user.id))
        set({
          user: admin.user, accessToken: admin.accessToken, refreshToken: admin.refreshToken,
          isAuthenticated: true, impersonating: false, impersonatedUser: null,
        })
      },
```

Add `impersonating` and `impersonatedUser` to the `partialize` returned object so they survive a refresh:

```javascript
        impersonating: state.impersonating,
        impersonatedUser: state.impersonatedUser,
```

- [ ] **Step 3: Create the route guard**

Create `frontend/src/components/auth/SuperAdminRoute.jsx`:

```javascript
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

function SuperAdminRoute() {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/connexion" state={{ from: location }} replace />
  }
  if (!user?.is_superadmin) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

export default SuperAdminRoute
```

- [ ] **Step 4: Build to verify no syntax/import errors**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/adminService.js frontend/src/store/authStore.js frontend/src/components/auth/SuperAdminRoute.jsx
git commit -m "feat(admin): adminService + impersonation dans authStore + SuperAdminRoute"
```

---

### Task 11: Frontend — Admin layout + Overview + Accounts + AccountDetail + routes + menu link

**Files:**
- Create: `frontend/src/pages/admin/AdminLayout.jsx`
- Create: `frontend/src/pages/admin/AdminOverview.jsx`
- Create: `frontend/src/pages/admin/AdminAccounts.jsx`
- Create: `frontend/src/pages/admin/AdminAccountDetail.jsx`
- Modify: `frontend/src/App.jsx` (routes)
- Modify: the header/menu component that lists Administration links (locate with grep in Step 6)
- Test: build + Task 13 smoke test

**Interfaces:**
- Consumes: `adminService`, `SuperAdminRoute`, `useAuthStore`.
- Produces routes: `/admin` (overview), `/admin/comptes` (accounts), `/admin/comptes/user/:id`, `/admin/comptes/agence/:id`.

- [ ] **Step 1: Create the layout**

Create `frontend/src/pages/admin/AdminLayout.jsx`:

```javascript
import { NavLink, Outlet } from 'react-router-dom'
import { FiGrid, FiUsers, FiActivity } from 'react-icons/fi'

const link = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium ${
    isActive ? 'bg-midnight text-ivory' : 'text-slate-600 hover:bg-slate-100'
  }`

function AdminLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 p-4">
        <h2 className="px-4 py-3 text-lg font-bold text-midnight">Super-admin</h2>
        <nav className="space-y-1">
          <NavLink to="/admin" end className={link}><FiGrid /> Vue d'ensemble</NavLink>
          <NavLink to="/admin/comptes" className={link}><FiUsers /> Comptes</NavLink>
          <NavLink to="/admin/activite" className={link}><FiActivity /> Activité</NavLink>
        </nav>
      </aside>
      <main className="flex-1 p-8"><Outlet /></main>
    </div>
  )
}

export default AdminLayout
```

- [ ] **Step 2: Create the overview page**

Create `frontend/src/pages/admin/AdminOverview.jsx`:

```javascript
import { useQuery } from 'react-query'
import { adminService } from '../../services/adminService'

function Kpi({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-midnight mt-1">{value}</div>
    </div>
  )
}

function AdminOverview() {
  const { data, isLoading } = useQuery(['admin', 'overview'], adminService.getOverview)
  if (isLoading) return <p>Chargement…</p>
  const d = data || {}
  const subs = Object.entries(d.active_subscriptions || {})
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">Vue d'ensemble</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Utilisateurs" value={d.total_users} />
        <Kpi label="Agences" value={d.total_agencies} />
        <Kpi label="MRR estimé (MAD)" value={d.mrr_estimate} />
        <Kpi label="Inscriptions 30j" value={d.signups_last_30d} />
        <Kpi label="Comptes suspendus" value={d.suspended_count} />
        <Kpi label="En attente de purge" value={d.deleted_pending_purge_count} />
      </div>
      <h2 className="text-lg font-semibold text-midnight mt-8 mb-3">Abonnements actifs</h2>
      <div className="flex gap-4">
        {subs.length === 0 && <p className="text-slate-500">Aucun.</p>}
        {subs.map(([plan, count]) => <Kpi key={plan} label={plan} value={count} />)}
      </div>
    </div>
  )
}

export default AdminOverview
```

- [ ] **Step 3: Create the accounts list page**

Create `frontend/src/pages/admin/AdminAccounts.jsx`:

```javascript
import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { adminService } from '../../services/adminService'

const STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-700',
  deleted: 'bg-red-100 text-red-700',
}

function AdminAccounts() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading } = useQuery(
    ['admin', 'accounts', { q, type, status }],
    () => adminService.getAccounts({ q, type, status, per_page: 50 }),
    { keepPreviousData: true }
  )
  const items = data?.items || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">Comptes</h1>
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…"
               className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800">
          <option value="">Tous types</option>
          <option value="user">Utilisateurs</option>
          <option value="agency">Agences</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800">
          <option value="">Tous statuts</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
          <option value="deleted">Supprimés</option>
        </select>
      </div>
      {isLoading ? <p>Chargement…</p> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Nom</th><th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Plan</th><th className="px-4 py-3">Annonces</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={`${it.kind}-${it.id}`} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link className="text-midnight font-medium hover:underline"
                          to={`/admin/comptes/${it.kind === 'user' ? 'user' : 'agence'}/${it.id}`}>
                      {it.name}
                    </Link>
                    <div className="text-slate-400 text-xs">{it.email}</div>
                  </td>
                  <td className="px-4 py-3">{it.kind === 'user' ? 'Utilisateur' : 'Agence'}</td>
                  <td className="px-4 py-3">{it.plan || '—'}</td>
                  <td className="px-4 py-3">{it.listings_count}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[it.status]}`}>
                      {it.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminAccounts
```

- [ ] **Step 4: Create the account-detail page (with danger zone + impersonation)**

Create `frontend/src/pages/admin/AdminAccountDetail.jsx`:

```javascript
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { adminService } from '../../services/adminService'
import useAuthStore from '../../store/authStore'

function AdminAccountDetail() {
  const { kind, id } = useParams()   // kind: 'user' | 'agence'
  const isUser = kind === 'user'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { startImpersonation } = useAuthStore()

  const { data, isLoading } = useQuery(
    ['admin', 'account', kind, id],
    () => (isUser ? adminService.getUser(id) : adminService.getAgency(id))
  )

  const refresh = () => qc.invalidateQueries(['admin', 'account', kind, id])
  const run = (fn, ok) => useMutation(fn, {
    onSuccess: () => { toast.success(ok); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const suspend = run(() => isUser ? adminService.suspendUser(id, 'Suspendu par admin')
                                   : adminService.suspendAgency(id, 'Suspendu par admin'), 'Suspendu')
  const unsuspend = run(() => isUser ? adminService.unsuspendUser(id)
                                     : adminService.unsuspendAgency(id), 'Réactivé')
  const del = run(() => isUser ? adminService.deleteUser(id) : adminService.deleteAgency(id), 'Supprimé')
  const restore = run(() => isUser ? adminService.restoreUser(id) : adminService.restoreAgency(id), 'Restauré')
  const anonymize = run(() => adminService.anonymizeUser(id), 'Anonymisé')

  if (isLoading) return <p>Chargement…</p>
  const entity = isUser ? data.user : data.agency
  const status = entity.deleted_at ? 'deleted' : (entity.is_suspended ? 'suspended' : 'active')

  const doImpersonate = async () => {
    const res = await adminService.impersonate(id)
    startImpersonation(res.user, res.access_token)
    navigate('/dashboard')
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 mb-4">← Retour</button>
      <h1 className="text-2xl font-bold text-midnight">
        {isUser ? entity.full_name : entity.name}
      </h1>
      <p className="text-slate-500">{entity.email} · statut : {status}</p>
      {entity.deleted_at && (
        <p className="text-red-600 text-sm mt-2">
          Supprimé le {new Date(entity.deleted_at).toLocaleDateString('fr-FR')} — restaurable 90 jours.
        </p>
      )}

      {isUser && (
        <button onClick={doImpersonate}
                className="mt-4 px-4 py-2 rounded-lg bg-midnight text-ivory text-sm">
          Se connecter en tant que cet utilisateur
        </button>
      )}

      <section className="mt-8 border border-red-200 rounded-xl p-5">
        <h2 className="font-semibold text-red-700 mb-3">Zone danger</h2>
        <div className="flex flex-wrap gap-3">
          {status !== 'suspended' && status !== 'deleted' && (
            <button onClick={() => suspend.mutate()} className="px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm">Suspendre</button>
          )}
          {status === 'suspended' && (
            <button onClick={() => unsuspend.mutate()} className="px-3 py-2 rounded-lg bg-green-100 text-green-800 text-sm">Réactiver</button>
          )}
          {status !== 'deleted' && (
            <button onClick={() => del.mutate()} className="px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm">Supprimer</button>
          )}
          {status === 'deleted' && !entity.anonymized_at && (
            <button onClick={() => restore.mutate()} className="px-3 py-2 rounded-lg bg-green-100 text-green-800 text-sm">Restaurer</button>
          )}
          {isUser && !entity.anonymized_at && (
            <button onClick={() => anonymize.mutate()} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm">Anonymiser (RGPD)</button>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-midnight mb-3">Activité</h2>
        <ul className="space-y-2">
          {(data.activity || []).map((a) => (
            <li key={a.id} className="text-sm text-slate-600 border-b border-slate-100 pb-2">
              <span className="font-medium">{a.action}</span> — {a.created_at
                ? new Date(a.created_at).toLocaleString('fr-FR') : ''}
            </li>
          ))}
          {(data.activity || []).length === 0 && <li className="text-slate-400 text-sm">Aucune activité.</li>}
        </ul>
      </section>
    </div>
  )
}

export default AdminAccountDetail
```

Note: `run()` calls `useMutation` inside a helper — since it is called unconditionally and in the same order on every render, this respects the Rules of Hooks. Keep the calls in a fixed order (do not wrap them in conditionals).

- [ ] **Step 5: Wire the routes**

In `frontend/src/App.jsx`, add imports near the other page imports:

```javascript
import SuperAdminRoute from './components/auth/SuperAdminRoute'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverview from './pages/admin/AdminOverview'
import AdminAccounts from './pages/admin/AdminAccounts'
import AdminAccountDetail from './pages/admin/AdminAccountDetail'
```

Add a route block after the `/backoffice` route block (a top-level route, sibling to `/backoffice`):

```javascript
      {/* Super-admin plateforme (protégé, rôle superadmin) */}
      <Route path="/admin" element={<SuperAdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="comptes" element={<AdminAccounts />} />
          <Route path="comptes/:kind/:id" element={<AdminAccountDetail />} />
          <Route path="activite" element={<AdminOverview />} />
        </Route>
      </Route>
```

(`activite` reuses overview for now; a dedicated global feed page can replace it later — out of scope for this brique's MVP.)

- [ ] **Step 6: Add a menu link for super-admins**

Find the header/nav component that renders the "Administration" or account menu:

Run: `cd frontend && grep -rln "Administration\|/backoffice\|Mon compte" src/components`

In that component, read how the current user is obtained (`useAuthStore`) and add, guarded by `user?.is_superadmin`, a link:

```javascript
{user?.is_superadmin && (
  <Link to="/admin" className="...matching existing link classes...">Super-admin</Link>
)}
```

Match the surrounding link markup/classes exactly (copy an adjacent link's `className`).

- [ ] **Step 7: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/admin frontend/src/App.jsx frontend/src/components
git commit -m "feat(admin): UI super-admin (overview, comptes, détail, zone danger, impersonation)"
```

---

### Task 12: Frontend — persistent impersonation banner

**Files:**
- Create: `frontend/src/components/admin/ImpersonationBanner.jsx`
- Modify: `frontend/src/App.jsx` (mount the banner at the top level)
- Test: build + Task 13 smoke test

**Interfaces:**
- Consumes: `useAuthStore` (`impersonating`, `impersonatedUser`, `stopImpersonation`).

- [ ] **Step 1: Create the banner**

Create `frontend/src/components/admin/ImpersonationBanner.jsx`:

```javascript
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

function ImpersonationBanner() {
  const { impersonating, impersonatedUser, stopImpersonation } = useAuthStore()
  const navigate = useNavigate()
  if (!impersonating) return null
  const name = impersonatedUser?.full_name || impersonatedUser?.email || 'utilisateur'
  const exit = () => { stopImpersonation(); navigate('/admin/comptes') }
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-midnight text-sm font-medium
                    px-4 py-2 flex items-center justify-center gap-4 shadow">
      <span>Connecté en tant que <strong>{name}</strong> (impersonation)</span>
      <button onClick={exit} className="underline font-semibold">Quitter</button>
    </div>
  )
}

export default ImpersonationBanner
```

- [ ] **Step 2: Mount it globally**

In `frontend/src/App.jsx`, import it and render it just inside the top-level fragment, before `<Routes>`:

```javascript
import ImpersonationBanner from './components/admin/ImpersonationBanner'
```

```javascript
  return (
    <>
      <ImpersonationBanner />
      <Routes>
        {/* ...existing routes... */}
      </Routes>
    </>
  )
```

(If `App` already returns a fragment/other wrapper, place `<ImpersonationBanner />` as its first child.)

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/ImpersonationBanner.jsx frontend/src/App.jsx
git commit -m "feat(admin): bannière permanente d'impersonation + bouton Quitter"
```

---

### Task 13: Full integration verification (testing-protocol) + regression

**Files:**
- Create: `backend/scripts/verify_admin_all.py` (runs the whole backend suite)
- Test: this task IS the test gate.

**Interfaces:** none produced; final gate before "done".

- [ ] **Step 1: Aggregate backend verification runner**

Create `backend/scripts/verify_admin_all.py`:

```python
"""Run all admin verification scripts. python3 scripts/verify_admin_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = [
    'verify_model_moderation.py', 'verify_superadmin_seed.py', 'verify_admin_overview.py',
    'verify_admin_accounts.py', 'verify_admin_suspend.py', 'verify_admin_delete.py',
    'verify_admin_activity.py', 'verify_admin_impersonate.py', 'verify_purge.py',
]
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    r = subprocess.run([sys.executable, os.path.join(HERE, s)])
    if r.returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Re-seed a clean dev DB**

Run: `cd backend && source venv/bin/activate && python3 seed.py && python3 seed_backoffice.py`
Expected: seed completes; superadmin assigned.

- [ ] **Step 3: Run the full backend suite**

Run: `python3 scripts/verify_admin_all.py`
Expected: `ALL PASS`, exit 0. (Some scripts mutate the demo user; if a later script depends on demo being active, re-run `python3 seed_backoffice.py` between runs — the aggregate is ordered so this is not needed on a fresh seed.)

- [ ] **Step 4: Frontend production build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, no errors.

- [ ] **Step 5: Manual UI smoke test (per testing-protocol + user-scenario-testing)**

Start backend + frontend. As `admin@semsarout.ma` / `admin123`:
1. Confirm the "Super-admin" menu link is visible; navigate to `/admin` → KPIs render.
2. `/admin/comptes` → list loads; search + filters narrow results.
3. Open a user detail → suspend → confirm badge flips; open a private window and confirm that user cannot log in; unsuspend → can log in again.
4. On a non-superadmin user, click "Se connecter en tant que" → redirected to `/dashboard`, amber banner shows "Connecté en tant que …"; click "Quitter" → back to super-admin session.
5. As a non-superadmin, navigate to `/admin` → redirected to `/`.

Record results as a table (pass/fail per step).

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/verify_admin_all.py
git commit -m "test(admin): runner de vérification agrégé de l'espace super-admin"
```

---

## Self-Review notes (coverage vs spec)

- §3 rôle/décorateur → Tasks 2, 3. `is_superadmin` serialization → Task 1.
- §4 data model + migration → Task 1.
- §5 endpoints: overview → 3; accounts list/detail → 4; suspend/unsuspend → 5; delete/restore/anonymize → 6; activity → 7; impersonate → 8. Guards (self / last superadmin / impersonate-superadmin / idempotence) → Tasks 5, 6, 8.
- §6 login enforcement + public masking → Task 5.
- §7 impersonation backend → 8; frontend session swap + banner + audit → Tasks 10, 12 (+ `impersonate_start` log in 8).
- §8 purge J+90 → Task 9.
- §9 anonymization → Task 6 (service) + reused by Task 9.
- §10 front pages/guard/menu → Tasks 10, 11, 12.
- §11 tests → each task + aggregate Task 13.

Known simplification for MVP: `/admin/activite` reuses the overview page; the dedicated global-feed UI (endpoint already built in Task 7) is deferred. Impersonation "stop" is not force-expired server-side (token simply lapses at 30 min) — acceptable for this brique.
