# Équipes & sièges nominatifs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Pro/Enterprise agencies named team-member seats with plan-enforced limits, an email/link invitation flow (Brevo SMTP + copyable link), lightweight team labels, and a downgrade guard — replacing today's broken "invite" button.

**Architecture:** New `Team` + `Invitation` models and `owner_id`/`team_id`/`max_seats`/`max_teams` columns; a pure `seats` service as the single source of truth for quota checks; a centralized `mailer` (Brevo SMTP via flask-mail, link-fallback); agency-scoped `/backoffice/team*` routes guarded by a `team.manage` permission; public `/invitations/*` accept routes; a downgrade guard in `billing.change_plan`; a reworked React Team page + a public invitation-accept page.

**Tech Stack:** Flask + SQLAlchemy + Flask-Migrate + flask-jwt-extended + flask-mail (backend); React + react-router + react-query + zustand + axios + Tailwind (frontend). Spec: `docs/superpowers/specs/2026-07-23-teams-seats-design.md`.

## Global Constraints

- **JWT identity is always `str(user.id)`** — never trust a client header for identity.
- **No pytest infra.** Verification = standalone scripts in `backend/scripts/` run with `python3`, using `app.test_client()`, `from seed import app`. Each prints `PASS`/`FAIL`, exits non-zero on failure.
- **Frontend API calls go through the shared `api` axios instance** (`frontend/src/services/api.js`).
- **Seat semantics:** `max_seats` counts invited members **excluding the agency owner** (`agency.owner_id`). Pro = 5, Enterprise = -1 (unlimited), starter = 0. A **pending, non-expired invitation consumes a seat**. Revoking frees it.
- **Team semantics:** `max_teams` labels — Pro = 1, Enterprise = -1, starter = 0.
- **Never hard-code secrets.** Brevo SMTP config comes from env (`MAIL_*`), documented in `backend/.env.example`. `MAIL_PASSWORD` never committed.
- **Invitation tokens:** generate `secrets.token_urlsafe(32)`, store **only** `sha256(token).hexdigest()`; never expose the raw token except in the create/resend response (as the copyable link path). Mirror `auth.py:forgot_password`.
- **Management authorization:** an action is allowed if `user.id == agency.owner_id` OR one of the user's roles has permission `team.manage`.
- **French UI copy**; required-field markers per the form-design skill.
- Backend venv: `cd backend && source venv/bin/activate`. Migration head chain currently ends at the brick-1 head (find with `flask db heads`).

---

### Task 1: Models + migration (plan quotas, owner_id, team_id, Team, Invitation)

**Files:**
- Modify: `backend/app/models/subscription.py`, `backend/app/models/agency.py`, `backend/app/models/user.py`, `backend/app/models/__init__.py`
- Create: `backend/app/models/team.py`, `backend/app/models/invitation.py`
- Create: `backend/migrations/versions/b2c3d4e5f6a7_add_teams_and_seats.py`
- Test: `backend/scripts/verify_team_models.py`

**Interfaces (Produces):**
- `SubscriptionPlan.max_seats: int`, `.max_teams: int` (+ in `to_dict()`)
- `Agency.owner_id: int|None`
- `User.team_id: int|None` (+ in `to_dict()`)
- `Team(id, agency_id, name, created_at)`, `Team.to_dict()` → `{id, agency_id, name, members_count}`
- `Invitation(id, agency_id, email, role_id, team_id, token_hash, status, invited_by, expires_at, created_at, accepted_at)`, `Invitation.to_dict()` (no raw token)

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_team_models.py`:

```python
"""Run: python3 scripts/verify_team_models.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import SubscriptionPlan, Agency, User, Team, Invitation

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    p = SubscriptionPlan.query.first()
    check(hasattr(p, 'max_seats') and hasattr(p, 'max_teams'), "plan has max_seats/max_teams")
    check('max_seats' in p.to_dict(), "plan.to_dict has max_seats")
    check(hasattr(Agency, 'owner_id'), "Agency.owner_id exists")
    check(hasattr(User, 'team_id'), "User.team_id exists")
    # Team + Invitation tables usable
    a = Agency.query.first()
    t = Team(agency_id=a.id, name='__verify_team__')
    db.session.add(t); db.session.commit()
    check(t.id is not None and t.to_dict()['name'] == '__verify_team__', "Team row + to_dict")
    inv = Invitation(agency_id=a.id, email='x@example.com', token_hash='deadbeef', status='pending')
    db.session.add(inv); db.session.commit()
    d = inv.to_dict()
    check(inv.id is not None and 'token' not in d and 'token_hash' not in d, "Invitation row, token not exposed")
    db.session.delete(inv); db.session.delete(t); db.session.commit()

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_team_models.py`
Expected: FAIL (ImportError: cannot import Team).

- [ ] **Step 3: Add plan quota columns**

In `backend/app/models/subscription.py`, in `SubscriptionPlan`, after `max_programs`:
```python
    max_seats = db.Column(db.Integer, default=0)   # invited members beyond owner; -1 = unlimited
    max_teams = db.Column(db.Integer, default=0)   # team labels; -1 = unlimited
```
In `SubscriptionPlan.to_dict()` add:
```python
            'max_seats': self.max_seats,
            'max_teams': self.max_teams,
```

- [ ] **Step 4: Add Agency.owner_id and User.team_id**

In `backend/app/models/agency.py`, add:
```python
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
```
In `backend/app/models/user.py`, add:
```python
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=True)
```
and in `User.to_dict()` append `'team_id': self.team_id,`.

- [ ] **Step 5: Create Team model**

Create `backend/app/models/team.py`:
```python
from datetime import datetime
from app import db


class Team(db.Model):
    """A lightweight label to group agency members (no data partitioning)."""
    __tablename__ = 'teams'
    __table_args__ = (db.UniqueConstraint('agency_id', 'name', name='uq_team_agency_name'),)

    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    name = db.Column(db.String(80), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        from app.models.user import User
        return {
            'id': self.id,
            'agency_id': self.agency_id,
            'name': self.name,
            'members_count': User.query.filter_by(team_id=self.id).count(),
        }

    def __repr__(self):
        return f'<Team {self.name}>'
```

- [ ] **Step 6: Create Invitation model**

Create `backend/app/models/invitation.py`:
```python
from datetime import datetime
from app import db


class Invitation(db.Model):
    """A seat invitation sent to an email; token stored hashed only."""
    __tablename__ = 'invitations'

    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    email = db.Column(db.String(120), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=True)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=True)
    token_hash = db.Column(db.String(64), nullable=False, index=True)
    status = db.Column(db.String(20), default='pending')  # pending|accepted|revoked|expired
    invited_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    expires_at = db.Column(db.DateTime)
    accepted_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def is_active_pending(self):
        return self.status == 'pending' and (self.expires_at is None or self.expires_at > datetime.utcnow())

    def to_dict(self):
        role = None
        if self.role_id:
            from app.models.role import Role
            r = Role.query.get(self.role_id)
            role = r.name if r else None
        return {
            'id': self.id,
            'agency_id': self.agency_id,
            'email': self.email,
            'role_id': self.role_id,
            'role_name': role,
            'team_id': self.team_id,
            'status': self.status,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<Invitation {self.email} {self.status}>'
```

- [ ] **Step 7: Register the models**

In `backend/app/models/__init__.py`, add:
```python
from app.models.team import Team
from app.models.invitation import Invitation
```

- [ ] **Step 8: Create the migration**

Find head: `cd backend && source venv/bin/activate && flask db heads`. Create `backend/migrations/versions/b2c3d4e5f6a7_add_teams_and_seats.py` with `down_revision` = that head:

```python
"""Add teams, invitations, seats/owner columns."""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'REPLACE_WITH_CURRENT_HEAD'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.add_column(sa.Column('max_seats', sa.Integer(), nullable=True, server_default='0'))
        b.add_column(sa.Column('max_teams', sa.Integer(), nullable=True, server_default='0'))
    with op.batch_alter_table('agencies', schema=None) as b:
        b.add_column(sa.Column('owner_id', sa.Integer(), nullable=True))

    op.create_table('teams',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('agency_id', 'name', name='uq_team_agency_name'),
    )
    op.create_index('ix_teams_agency_id', 'teams', ['agency_id'])

    with op.batch_alter_table('users', schema=None) as b:
        b.add_column(sa.Column('team_id', sa.Integer(), nullable=True))

    op.create_table('invitations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('email', sa.String(length=120), nullable=False),
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('roles.id'), nullable=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('invited_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_invitations_agency_id', 'invitations', ['agency_id'])
    op.create_index('ix_invitations_token_hash', 'invitations', ['token_hash'])

    # Backfill agency.owner_id: highest-level role holder, else oldest member.
    conn = op.get_bind()
    agencies = conn.execute(sa.text("SELECT id FROM agencies")).fetchall()
    for (aid,) in agencies:
        row = conn.execute(sa.text("""
            SELECT u.id FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id
            LEFT JOIN roles r ON r.id = ur.role_id
            WHERE u.agency_id = :aid
            ORDER BY COALESCE(r.level, -1) DESC, u.created_at ASC
            LIMIT 1
        """), {"aid": aid}).fetchone()
        if row:
            conn.execute(sa.text("UPDATE agencies SET owner_id = :oid WHERE id = :aid"),
                         {"oid": row[0], "aid": aid})


def downgrade():
    with op.batch_alter_table('users', schema=None) as b:
        b.drop_column('team_id')
    op.drop_index('ix_invitations_token_hash', table_name='invitations')
    op.drop_index('ix_invitations_agency_id', table_name='invitations')
    op.drop_table('invitations')
    op.drop_index('ix_teams_agency_id', table_name='teams')
    op.drop_table('teams')
    with op.batch_alter_table('agencies', schema=None) as b:
        b.drop_column('owner_id')
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.drop_column('max_teams')
        b.drop_column('max_seats')
```

Note: role level convention is "higher = more powerful" (admin=100), so `ORDER BY r.level DESC` picks the agency admin as owner.

- [ ] **Step 9: Apply the migration**

Run: `flask db upgrade`
Expected: `Running upgrade ... -> b2c3d4e5f6a7`.

- [ ] **Step 10: Run the verification — verify it passes**

Run: `python3 scripts/verify_team_models.py`
Expected: all PASS.

- [ ] **Step 11: Commit**
```bash
git add backend/app/models/subscription.py backend/app/models/agency.py backend/app/models/user.py backend/app/models/team.py backend/app/models/invitation.py backend/app/models/__init__.py backend/migrations/versions/b2c3d4e5f6a7_add_teams_and_seats.py backend/scripts/verify_team_models.py
git commit -m "feat(teams): modèles Team/Invitation + colonnes sièges/owner/team + migration"
```

---

### Task 2: Seed — plan quotas, owner_id, `team.manage` permission

**Files:**
- Modify: `backend/seed.py` (plan quotas + agency owner_id)
- Modify: `backend/seed_backoffice.py` (`team.manage` permission + assign to admin role)
- Test: `backend/scripts/verify_team_seed.py`

**Interfaces (Produces):** after seeding, `pro.max_seats==5, pro.max_teams==1`, `enterprise.max_seats==-1, enterprise.max_teams==-1`, `starter.max_seats==0`; every agency has a non-null `owner_id`; a `Permission(slug='team.manage')` exists and the `admin` role holds it.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_team_seed.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import SubscriptionPlan, Agency, Permission, Role

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    pro = SubscriptionPlan.query.filter_by(slug='pro').first()
    ent = SubscriptionPlan.query.filter_by(slug='enterprise').first()
    st = SubscriptionPlan.query.filter_by(slug='starter').first()
    check(pro and pro.max_seats == 5 and pro.max_teams == 1, "pro 5 seats / 1 team")
    check(ent and ent.max_seats == -1 and ent.max_teams == -1, "enterprise unlimited")
    check(st and st.max_seats == 0, "starter 0 seats")
    check(all(a.owner_id is not None for a in Agency.query.all()), "every agency has owner_id")
    perm = Permission.query.filter_by(slug='team.manage').first()
    check(perm is not None, "team.manage permission exists")
    admin = Role.query.filter_by(slug='admin').first()
    check(admin and admin.has_permission('team.manage'), "admin role has team.manage")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_team_seed.py`
Expected: FAIL.

- [ ] **Step 3: Set plan quotas in seed.py**

In `backend/seed.py`, in the plan definitions (around the `starter`/`pro`/`enterprise` dicts near lines 138-176), add `'max_seats'` and `'max_teams'` keys: starter `0,0`; pro `5,1`; enterprise `-1,-1`. Then ensure the `SubscriptionPlan(...)` construction passes them through (add `max_seats=plan_data.get('max_seats', 0), max_teams=plan_data.get('max_teams', 0)` to the constructor — read the surrounding code to match how other fields are passed).

- [ ] **Step 4: Backfill agency owner_id in seed.py**

In `backend/seed.py`, after users are assigned to agencies (read the file to find where `user.agency_id` is set / agencies+users exist), add before the final commit of that section:
```python
    # Set each agency's owner = its admin (or first member)
    for agency in Agency.query.all():
        if agency.owner_id:
            continue
        member = (User.query.filter_by(agency_id=agency.id)
                  .order_by(User.created_at.asc()).first())
        if member:
            agency.owner_id = member.id
    db.session.commit()
```
(If seed.py already designates an agency admin explicitly, prefer that user; otherwise the oldest member is fine for seed data.)

- [ ] **Step 5: Seed the `team.manage` permission in seed_backoffice.py**

In `backend/seed_backoffice.py`, the permissions are generated per `module`/`action` (see the loop near line 61). Ensure a `team` module with a `manage` action is produced so `slug='team.manage'` exists, and that `all_permissions` (assigned to `admin`) includes it. Read the permission-generation block and add `team` with action `manage` to the module/action definitions. If permissions are defined as an explicit list, append `{'module': 'team', 'action': 'manage', 'name': 'Gérer l\'équipe'}` (match the existing shape).

- [ ] **Step 6: Re-seed and verify**

Run: `python3 seed.py && python3 seed_backoffice.py && python3 scripts/verify_team_seed.py`
Expected: all PASS. (If `seed.py` errors on a non-empty DB due to the known pre-existing `clear_data()` bug with stale table names, reset the schema — drop/create — then re-run; do NOT modify seed.py.)

- [ ] **Step 7: Commit**
```bash
git add backend/seed.py backend/seed_backoffice.py backend/scripts/verify_team_seed.py
git commit -m "feat(teams): seed quotas de plan, owner_id des agences et permission team.manage"
```

---

### Task 3: `seats` service + `mailer` service (Brevo)

**Files:**
- Create: `backend/app/services/seats.py`
- Create: `backend/app/services/mailer.py`
- Modify: `backend/config/settings.py` (MAIL_* from env + default sender)
- Modify: `backend/.env.example` (Brevo config, no secrets)
- Test: `backend/scripts/verify_seats_service.py`

**Interfaces (Produces):**
- `seats.py`: `seats_used(agency)`, `seats_limit(agency)`, `can_invite(agency)`, `active_member_seats(agency)` (real members excl. owner, no pending), `teams_used(agency)`, `teams_limit(agency)`, `can_create_team(agency)`, `member_count(agency)`, `can_manage_team(user, agency)`.
- `mailer.py`: `send_email(to, subject, body, html=None) -> bool`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_seats_service.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import Agency, SubscriptionPlan, Subscription, User, Invitation
from app.services import seats
from datetime import datetime, timedelta

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    # Attach a Pro plan (5 seats) to an agency for the test
    a = Agency.query.first()
    pro = SubscriptionPlan.query.filter_by(slug='pro').first()
    sub = Subscription.query.filter_by(agency_id=a.id).first()
    if not sub:
        sub = Subscription(agency_id=a.id, plan_id=pro.id, amount=pro.price_monthly, status='active')
        db.session.add(sub)
    else:
        sub.plan_id = pro.id
    db.session.commit()

    check(seats.seats_limit(a) == 5, "pro seat limit 5")
    base = seats.seats_used(a)
    inv = Invitation(agency_id=a.id, email='pending@x.com', token_hash='h1',
                     status='pending', expires_at=datetime.utcnow()+timedelta(days=3))
    db.session.add(inv); db.session.commit()
    check(seats.seats_used(a) == base + 1, "pending invitation consumes a seat")
    inv.status = 'revoked'; db.session.commit()
    check(seats.seats_used(a) == base, "revoked invitation frees the seat")
    db.session.delete(inv); db.session.commit()

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_seats_service.py`
Expected: FAIL (no module `app.services.seats`).

- [ ] **Step 3: Implement the seats service**

Create `backend/app/services/seats.py`:
```python
"""Single source of truth for seat & team quota checks."""
from datetime import datetime
from app.models import User, Team, Invitation, Subscription


def _plan(agency):
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    return sub.plan if sub else None


def seats_limit(agency):
    p = _plan(agency)
    return p.max_seats if p else 0


def active_member_seats(agency):
    """Real members of the agency, excluding the owner and soft-deleted users."""
    q = User.query.filter(User.agency_id == agency.id, User.deleted_at.is_(None))
    if agency.owner_id:
        q = q.filter(User.id != agency.owner_id)
    return q.count()


def _pending_invites(agency):
    now = datetime.utcnow()
    return Invitation.query.filter(
        Invitation.agency_id == agency.id,
        Invitation.status == 'pending',
        (Invitation.expires_at.is_(None)) | (Invitation.expires_at > now),
    ).count()


def seats_used(agency):
    return active_member_seats(agency) + _pending_invites(agency)


def can_invite(agency):
    limit = seats_limit(agency)
    return limit == -1 or seats_used(agency) < limit


def teams_limit(agency):
    p = _plan(agency)
    return p.max_teams if p else 0


def teams_used(agency):
    return Team.query.filter_by(agency_id=agency.id).count()


def can_create_team(agency):
    limit = teams_limit(agency)
    return limit == -1 or teams_used(agency) < limit


def member_count(agency):
    return User.query.filter(User.agency_id == agency.id, User.deleted_at.is_(None)).count()


def can_manage_team(user, agency):
    if user is None or agency is None:
        return False
    if agency.owner_id and user.id == agency.owner_id:
        return True
    return any(r.has_permission('team.manage') for r in user.roles)
```

- [ ] **Step 4: Implement the mailer**

Create `backend/app/services/mailer.py`:
```python
"""Centralized email sending via Brevo SMTP relay (flask-mail); link-fallback otherwise."""
from flask import current_app


def send_email(to, subject, body, html=None):
    """Send an email if MAIL is configured. Returns True if sent, False if only logged.

    Never raises — a mail outage must not fail the calling request.
    """
    server = current_app.config.get('MAIL_SERVER')
    username = current_app.config.get('MAIL_USERNAME')
    if not server or not username:
        current_app.logger.info('[MAIL not configured] To=%s Subject=%s Body=%s', to, subject, body)
        return False
    try:
        from flask_mail import Message
        from app import mail
        sender = current_app.config.get('MAIL_DEFAULT_SENDER') or username
        msg = Message(subject=subject, recipients=[to], body=body, html=html, sender=sender)
        mail.send(msg)
        return True
    except Exception as exc:  # pragma: no cover - depends on live SMTP
        current_app.logger.warning('send_email failed to %s: %s', to, exc)
        return False
```

- [ ] **Step 5: Wire MAIL config from env**

In `backend/config/settings.py`, in the mail block, make TLS and default sender env-driven (keep existing `MAIL_SERVER`/`MAIL_PORT`/`MAIL_USERNAME`/`MAIL_PASSWORD`):
```python
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER')
```
In `backend/.env.example`, add:
```
# Brevo (ex-Sendinblue) SMTP relay — used for team invitations
MAIL_SERVER=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_DEFAULT_SENDER=no-reply@example.com
```

- [ ] **Step 6: Run the verification — verify it passes**

Run: `python3 scripts/verify_seats_service.py`
Expected: all PASS.

- [ ] **Step 7: Commit**
```bash
git add backend/app/services/seats.py backend/app/services/mailer.py backend/config/settings.py backend/.env.example backend/scripts/verify_seats_service.py
git commit -m "feat(teams): services seats (quotas) et mailer (Brevo SMTP)"
```

---

### Task 4: Backoffice team API — read, teams CRUD, member update/remove

**Files:**
- Create: `backend/app/api/v1/backoffice/team.py`
- Modify: `backend/app/api/v1/backoffice/__init__.py` (import the module)
- Test: `backend/scripts/verify_team_api.py`

**Interfaces (Produces):**
- `GET /backoffice/team` → `{owner, members, teams, invitations, seats:{used,limit}, teams_quota:{used,limit}, can_manage}`
- `POST /backoffice/teams {name}` · `PUT /backoffice/teams/:id {name}` · `DELETE /backoffice/teams/:id`
- `PUT /backoffice/team/members/:user_id {team_id?, role_id?}` · `DELETE /backoffice/team/members/:user_id`
- A reusable `_require_manage()` helper returning `(agency, error_response)`.

Consumes: `require_auth` (sets `g.current_user`, `g.agency_id`), `seats` service.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_team_api.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    # Ensure an agency admin exists and its agency is Pro; find admin creds from seed.
    admin = User.query.filter_by(email='admin@immo-casa.ma').first() or \
            User.query.filter(User.agency_id.isnot(None)).first()
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

    c = app.test_client()
    tok = login(c, admin.email, 'admin123')  # adjust if seed uses a different password
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

sys.exit(1 if FAILS else 0)
```

Before running, confirm the agency-admin email + password from `backend/seed.py` / `seed_backoffice.py` and adjust the script literals if needed.

- [ ] **Step 2: Run it — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_team_api.py`
Expected: FAIL (404 on the routes).

- [ ] **Step 3: Implement the team API module**

Create `backend/app/api/v1/backoffice/team.py`:
```python
from flask import jsonify, request, g
from app import db
from app.models import User, Agency, Team, Invitation, Role
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.services import seats


def _agency():
    return Agency.query.get(g.agency_id) if g.agency_id else None


def _require_manage():
    """Return (agency, None) if allowed, else (None, (json, status))."""
    agency = _agency()
    if not agency:
        return None, (jsonify({'error': 'Aucune agence'}), 400)
    if not seats.can_manage_team(g.current_user, agency):
        return None, (jsonify({'error': "Vous n'avez pas le droit de gérer l'équipe."}), 403)
    return agency, None


@backoffice_bp.route('/team', methods=['GET'])
@require_auth
def get_team():
    agency = _agency()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    members = User.query.filter(User.agency_id == agency.id, User.deleted_at.is_(None)).all()
    owner = User.query.get(agency.owner_id) if agency.owner_id else None
    teams = Team.query.filter_by(agency_id=agency.id).all()
    pending = Invitation.query.filter_by(agency_id=agency.id, status='pending').all()

    def member_row(u):
        d = u.to_dict()
        d['roles'] = [r.to_dict() for r in u.roles]
        d['is_owner'] = (u.id == agency.owner_id)
        return d

    return jsonify({
        'owner': owner.to_dict() if owner else None,
        'members': [member_row(u) for u in members],
        'teams': [t.to_dict() for t in teams],
        'invitations': [i.to_dict() for i in pending if i.is_active_pending()],
        'seats': {'used': seats.seats_used(agency), 'limit': seats.seats_limit(agency)},
        'teams_quota': {'used': seats.teams_used(agency), 'limit': seats.teams_limit(agency)},
        'can_manage': seats.can_manage_team(g.current_user, agency),
    })


@backoffice_bp.route('/teams', methods=['POST'])
@require_auth
def create_team():
    agency, err = _require_manage()
    if err:
        return err
    if not seats.can_create_team(agency):
        return jsonify({'error': "Limite d'équipes atteinte pour votre plan."}), 409
    name = (request.get_json(silent=True) or {}).get('name', '').strip()
    if not name:
        return jsonify({'error': "Nom d'équipe requis"}), 400
    if Team.query.filter_by(agency_id=agency.id, name=name).first():
        return jsonify({'error': 'Une équipe porte déjà ce nom.'}), 409
    t = Team(agency_id=agency.id, name=name)
    db.session.add(t)
    db.session.commit()
    return jsonify({'team': t.to_dict()}), 201


@backoffice_bp.route('/teams/<int:team_id>', methods=['PUT'])
@require_auth
def rename_team(team_id):
    agency, err = _require_manage()
    if err:
        return err
    t = Team.query.filter_by(id=team_id, agency_id=agency.id).first()
    if not t:
        return jsonify({'error': 'Équipe introuvable'}), 404
    name = (request.get_json(silent=True) or {}).get('name', '').strip()
    if not name:
        return jsonify({'error': "Nom d'équipe requis"}), 400
    t.name = name
    db.session.commit()
    return jsonify({'team': t.to_dict()})


@backoffice_bp.route('/teams/<int:team_id>', methods=['DELETE'])
@require_auth
def delete_team(team_id):
    agency, err = _require_manage()
    if err:
        return err
    t = Team.query.filter_by(id=team_id, agency_id=agency.id).first()
    if not t:
        return jsonify({'error': 'Équipe introuvable'}), 404
    User.query.filter_by(team_id=t.id).update({'team_id': None})
    db.session.delete(t)
    db.session.commit()
    return jsonify({'message': 'Équipe supprimée'})


@backoffice_bp.route('/team/members/<int:user_id>', methods=['PUT'])
@require_auth
def update_member(user_id):
    agency, err = _require_manage()
    if err:
        return err
    u = User.query.filter_by(id=user_id, agency_id=agency.id).first()
    if not u:
        return jsonify({'error': 'Membre introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'team_id' in data:
        tid = data['team_id']
        if tid is not None and not Team.query.filter_by(id=tid, agency_id=agency.id).first():
            return jsonify({'error': 'Équipe invalide'}), 400
        u.team_id = tid
    if 'role_id' in data and data['role_id'] is not None:
        role = Role.query.get(data['role_id'])
        if role:
            u.roles = [role]
    db.session.commit()
    d = u.to_dict()
    d['roles'] = [r.to_dict() for r in u.roles]
    return jsonify({'member': d})


@backoffice_bp.route('/team/members/<int:user_id>', methods=['DELETE'])
@require_auth
def remove_member(user_id):
    agency, err = _require_manage()
    if err:
        return err
    if user_id == agency.owner_id:
        return jsonify({'error': "Impossible de retirer le propriétaire du compte."}), 409
    u = User.query.filter_by(id=user_id, agency_id=agency.id).first()
    if not u:
        return jsonify({'error': 'Membre introuvable'}), 404
    u.agency_id = None
    u.team_id = None
    db.session.commit()
    return jsonify({'message': 'Membre retiré'})
```

- [ ] **Step 4: Register the module**

In `backend/app/api/v1/backoffice/__init__.py`, add `from app.api.v1.backoffice import team` to the import list.

- [ ] **Step 5: Run the verification — verify it passes**

Run: `python3 scripts/verify_team_api.py`
Expected: all PASS.

- [ ] **Step 6: Commit**
```bash
git add backend/app/api/v1/backoffice/team.py backend/app/api/v1/backoffice/__init__.py backend/scripts/verify_team_api.py
git commit -m "feat(teams): API backoffice équipe (lecture, CRUD équipes, membres)"
```

---

### Task 5: Invitations — create/resend/revoke (backoffice) + public get/accept

**Files:**
- Create: `backend/app/api/v1/invitations.py` (public accept)
- Modify: `backend/app/api/v1/backoffice/team.py` (invitation admin routes)
- Modify: `backend/app/api/v1/__init__.py` (register invitations blueprint/module)
- Test: `backend/scripts/verify_invitations.py`

**Interfaces (Produces):**
- `POST /backoffice/team/invitations {email, role_id?, team_id?}` → `{invitation, invite_path}` (409 over seat limit, 403 if not manager)
- `POST /backoffice/team/invitations/:id/resend` → `{invitation, invite_path}`
- `DELETE /backoffice/team/invitations/:id` → revoke
- `GET /invitations/:token` (public) → `{agency_name, email, role_name}` (404/410)
- `POST /invitations/:token/accept {first_name, last_name, password}` → `{user, access_token, refresh_token}` (409 if seats now full)
- Helper `_new_token()` → `(raw, token_hash)`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_invitations.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Invitation

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
    pro = SubscriptionPlan.query.filter_by(slug='pro').first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=pro.id, amount=pro.price_monthly, status='active'); db.session.add(sub)
    else:
        sub.plan_id = pro.id
    agency.owner_id = admin.id
    # clean previous test invitations
    Invitation.query.filter(Invitation.email.like('seat%@test.com')).delete(synchronize_session=False)
    db.session.commit()

    c = app.test_client()
    tok = login(c, admin.email, 'admin123')
    if not tok:
        print("FAIL: login (adjust creds)"); sys.exit(1)
    h = {'Authorization': f'Bearer {tok}'}

    # invite up to the 5-seat limit (owner excluded). Count current usage first.
    from app.services import seats
    room = 5 - seats.seats_used(agency)
    last_path = None
    for i in range(room):
        r = c.post('/api/v1/backoffice/team/invitations', json={'email': f'seat{i}@test.com'}, headers=h)
        check(r.status_code in (200, 201), f"invite {i} ok")
        last_path = r.get_json().get('invite_path')
    # next invite exceeds limit -> 409
    r = c.post('/api/v1/backoffice/team/invitations', json={'email': 'seatX@test.com'}, headers=h)
    check(r.status_code == 409, "invite beyond seat limit -> 409")

    # accept the last invitation: extract raw token from invite_path
    token = last_path.rsplit('/', 1)[-1]
    r = c.get(f'/api/v1/invitations/{token}')
    check(r.status_code == 200, "public GET invitation 200")
    r = c.post(f'/api/v1/invitations/{token}/accept',
               json={'first_name': 'New', 'last_name': 'Member', 'password': 'memberpass1'})
    check(r.status_code in (200, 201), "accept invitation ok")
    data = r.get_json()
    check('access_token' in data, "accept returns token (auto-login)")
    new_user = User.query.filter_by(email='seat%d@test.com' % (room - 1)).first()
    check(new_user and new_user.agency_id == agency.id, "member attached to agency")
    # member can log in
    check(login(c, new_user.email, 'memberpass1') is not None, "member can log in")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_invitations.py`
Expected: FAIL (404 on invitation routes).

- [ ] **Step 3: Add invitation admin routes to backoffice/team.py**

Append to `backend/app/api/v1/backoffice/team.py`:
```python
import secrets
import hashlib
from datetime import datetime, timedelta
from app.services.mailer import send_email


def _new_token():
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def _invite_path(raw):
    return f'/invitation/{raw}'


@backoffice_bp.route('/team/invitations', methods=['POST'])
@require_auth
def create_invitation():
    agency, err = _require_manage()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Email requis'}), 400
    if User.query.filter_by(email=email, agency_id=agency.id).first():
        return jsonify({'error': 'Cet utilisateur est déjà membre.'}), 409
    if Invitation.query.filter_by(agency_id=agency.id, email=email, status='pending').first():
        return jsonify({'error': 'Une invitation est déjà en attente pour cet email.'}), 409
    if not seats.can_invite(agency):
        return jsonify({'error': "Limite de sièges atteinte. Passez à un plan supérieur."}), 409

    raw, token_hash = _new_token()
    inv = Invitation(agency_id=agency.id, email=email, role_id=data.get('role_id'),
                     team_id=data.get('team_id'), token_hash=token_hash, status='pending',
                     invited_by=g.current_user.id, expires_at=datetime.utcnow() + timedelta(days=7))
    db.session.add(inv)
    db.session.commit()
    path = _invite_path(raw)
    send_email(email, f"Invitation à rejoindre {agency.name}",
               f"Vous avez été invité à rejoindre {agency.name}. Activez votre compte : {path}")
    return jsonify({'invitation': inv.to_dict(), 'invite_path': path}), 201


@backoffice_bp.route('/team/invitations/<int:inv_id>/resend', methods=['POST'])
@require_auth
def resend_invitation(inv_id):
    agency, err = _require_manage()
    if err:
        return err
    inv = Invitation.query.filter_by(id=inv_id, agency_id=agency.id).first()
    if not inv or inv.status != 'pending':
        return jsonify({'error': 'Invitation introuvable'}), 404
    raw, token_hash = _new_token()
    inv.token_hash = token_hash
    inv.expires_at = datetime.utcnow() + timedelta(days=7)
    db.session.commit()
    path = _invite_path(raw)
    send_email(inv.email, f"Invitation à rejoindre {agency.name}",
               f"Activez votre compte : {path}")
    return jsonify({'invitation': inv.to_dict(), 'invite_path': path})


@backoffice_bp.route('/team/invitations/<int:inv_id>', methods=['DELETE'])
@require_auth
def revoke_invitation(inv_id):
    agency, err = _require_manage()
    if err:
        return err
    inv = Invitation.query.filter_by(id=inv_id, agency_id=agency.id).first()
    if not inv:
        return jsonify({'error': 'Invitation introuvable'}), 404
    inv.status = 'revoked'
    db.session.commit()
    return jsonify({'message': 'Invitation révoquée'})
```

- [ ] **Step 4: Implement the public accept module**

Create `backend/app/api/v1/invitations.py`:
```python
import hashlib
from datetime import datetime
from flask import jsonify, request
from flask_jwt_extended import create_access_token, create_refresh_token
from app import db
from app.api.v1 import api_v1_bp
from app.models import Invitation, Agency, User, Role
from app.services import seats


def _find(token):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return Invitation.query.filter_by(token_hash=token_hash).first()


@api_v1_bp.route('/invitations/<token>', methods=['GET'])
def get_invitation(token):
    inv = _find(token)
    if not inv or inv.status != 'pending':
        return jsonify({'error': 'Invitation invalide'}), 404
    if inv.expires_at and inv.expires_at < datetime.utcnow():
        return jsonify({'error': 'Invitation expirée'}), 410
    agency = Agency.query.get(inv.agency_id)
    role = Role.query.get(inv.role_id) if inv.role_id else None
    return jsonify({'agency_name': agency.name if agency else None,
                    'email': inv.email,
                    'role_name': role.name if role else None})


@api_v1_bp.route('/invitations/<token>/accept', methods=['POST'])
def accept_invitation(token):
    inv = _find(token)
    if not inv or inv.status != 'pending':
        return jsonify({'error': 'Invitation invalide'}), 404
    if inv.expires_at and inv.expires_at < datetime.utcnow():
        return jsonify({'error': 'Invitation expirée'}), 410
    agency = Agency.query.get(inv.agency_id)
    if not agency:
        return jsonify({'error': 'Agence introuvable'}), 404

    data = request.get_json(silent=True) or {}
    password = data.get('password')
    if not password or len(password) < 8:
        return jsonify({'error': 'Mot de passe (8 caractères min.) requis'}), 400

    # Re-check seats at accept time (guard the last-seat race), excluding THIS invitation.
    # Mark accepted first so it no longer counts as a pending seat, then require room for
    # the member about to be created: seats_used (without this pending) < limit.
    inv.status = 'accepted'
    db.session.flush()
    _limit = seats.seats_limit(agency)
    if not (_limit == -1 or seats.seats_used(agency) < _limit):
        db.session.rollback()
        return jsonify({'error': "Plus de siège disponible pour cette agence."}), 409

    existing = User.query.filter_by(email=inv.email).first()
    if existing:
        user = existing
        user.agency_id = agency.id
        user.team_id = inv.team_id
    else:
        user = User(email=inv.email,
                    first_name=(data.get('first_name') or '').strip() or 'Membre',
                    last_name=(data.get('last_name') or '').strip() or '',
                    agency_id=agency.id, team_id=inv.team_id,
                    is_active=True, is_verified=True)
        user.set_password(password)
        db.session.add(user)
    db.session.flush()
    if inv.role_id:
        role = Role.query.get(inv.role_id)
        if role:
            user.roles = [role]
    inv.accepted_at = datetime.utcnow()
    db.session.commit()

    access = create_access_token(identity=str(user.id))
    refresh = create_refresh_token(identity=str(user.id))
    return jsonify({'user': user.to_dict(), 'access_token': access, 'refresh_token': refresh}), 201
```

The accept-time seat guard: after marking `accepted`, `seats_used` no longer counts this invitation, so `seats_used < limit` means "there is room for the member about to be created". Keep the logic as written; the verify script exercises the happy path.

- [ ] **Step 5: Register the invitations module**

In `backend/app/api/v1/__init__.py`, add `invitations` to the route-imports line (`from app.api.v1 import auth, ..., invitations`).

- [ ] **Step 6: Run the verification — verify it passes**

Run: `python3 scripts/verify_invitations.py`
Expected: all PASS.

- [ ] **Step 7: Commit**
```bash
git add backend/app/api/v1/backoffice/team.py backend/app/api/v1/invitations.py backend/app/api/v1/__init__.py backend/scripts/verify_invitations.py
git commit -m "feat(teams): invitations (créer/relancer/révoquer) + acceptation publique + auto-login"
```

---

### Task 6: Downgrade guard in `billing.change_plan`

**Files:**
- Modify: `backend/app/api/v1/billing.py`
- Test: `backend/scripts/verify_downgrade_guard.py`

**Interfaces:** `POST /billing/change-plan` returns 409 when the target plan's `max_seats`/`max_teams` would be exceeded by current members/teams.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_downgrade_guard.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription

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
    agency.owner_id = admin.id
    ent = SubscriptionPlan.query.filter_by(slug='enterprise').first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=ent.id, amount=ent.price_monthly, status='active'); db.session.add(sub)
    else:
        sub.plan_id = ent.id
    # Create 7 extra members (beyond owner) so Pro's 5-seat limit is exceeded
    for i in range(7):
        em = f'bulk{i}@test.com'
        u = User.query.filter_by(email=em).first()
        if not u:
            u = User(email=em, first_name='B', last_name=str(i), agency_id=agency.id, is_active=True)
            u.set_password('x'*10); db.session.add(u)
        else:
            u.agency_id = agency.id
    db.session.commit()

    c = app.test_client()
    tok = login(c, admin.email, 'admin123')
    h = {'Authorization': f'Bearer {tok}'}
    # add a default payment method requirement may block earlier; downgrade guard must trigger first OR we assert 409 either way for seat reason
    r = c.post('/api/v1/billing/change-plan', json={'plan_id': 'pro'}, headers=h)
    check(r.status_code == 409, "downgrade to pro with too many members -> 409")
    check('membre' in (r.get_json() or {}).get('error', '').lower(), "409 mentions members")

sys.exit(1 if FAILS else 0)
```

Note: verify the change-plan route path (`/billing/change-plan`) by reading `backend/app/api/v1/billing.py` decorators; adjust the script path literal if different. Ensure the seat guard runs BEFORE the payment-method check so the 409 is about seats.

- [ ] **Step 2: Run it — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_downgrade_guard.py`
Expected: FAIL.

- [ ] **Step 3: Add the guard**

In `backend/app/api/v1/billing.py` `change_plan()`, immediately after `new_plan` is resolved and validated (after the `if not new_plan or not new_plan.is_active:` block) and once you have the agency, insert:
```python
    # Downgrade guard: block if the new plan's seat/team quota is exceeded (spec §7.3)
    if user.agency_id:
        from app.models import Agency
        from app.services import seats
        agency = Agency.query.get(user.agency_id)
        if agency and new_plan.max_seats != -1 and seats.active_member_seats(agency) > new_plan.max_seats:
            excess = seats.active_member_seats(agency) - new_plan.max_seats
            return jsonify({'error': f"Retirez d'abord {excess} membre(s) pour passer à ce plan."}), 409
        if agency and new_plan.max_teams != -1 and seats.teams_used(agency) > new_plan.max_teams:
            return jsonify({'error': "Trop d'équipes pour ce plan : supprimez-en d'abord."}), 409
```
Place this BEFORE the payment-method lookup so a seat violation returns first. `active_member_seats` excludes the owner, matching `max_seats` semantics.

- [ ] **Step 4: Run the verification — verify it passes**

Run: `python3 scripts/verify_downgrade_guard.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/billing.py backend/scripts/verify_downgrade_guard.py
git commit -m "feat(teams): bloquer le downgrade si trop de membres/équipes pour le plan cible"
```

---

### Task 7: Frontend — teamService + reworked backoffice Team page

**Files:**
- Create: `frontend/src/services/teamService.js`
- Rewrite: `frontend/src/pages/backoffice/Team.jsx`
- Test: `cd frontend && npm run build`

**Interfaces (Produces):** `teamService` with `getTeam`, `invite`, `resendInvite`, `revokeInvite`, `createTeam`, `renameTeam`, `deleteTeam`, `updateMember`, `removeMember`.

- [ ] **Step 1: Create the service**

Create `frontend/src/services/teamService.js`:
```javascript
import api from './api'

export const teamService = {
  getTeam: async () => (await api.get('/backoffice/team')).data,
  invite: async (data) => (await api.post('/backoffice/team/invitations', data)).data,
  resendInvite: async (id) => (await api.post(`/backoffice/team/invitations/${id}/resend`)).data,
  revokeInvite: async (id) => (await api.delete(`/backoffice/team/invitations/${id}`)).data,
  createTeam: async (name) => (await api.post('/backoffice/teams', { name })).data,
  renameTeam: async (id, name) => (await api.put(`/backoffice/teams/${id}`, { name })).data,
  deleteTeam: async (id) => (await api.delete(`/backoffice/teams/${id}`)).data,
  updateMember: async (id, data) => (await api.put(`/backoffice/team/members/${id}`, data)).data,
  removeMember: async (id) => (await api.delete(`/backoffice/team/members/${id}`)).data,
}
```

- [ ] **Step 2: Rewrite the Team page**

Replace `frontend/src/pages/backoffice/Team.jsx` entirely with:
```javascript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiUserPlus, FiCopy, FiTrash2, FiRefreshCw } from 'react-icons/fi'
import { teamService } from '../../services/teamService'

function SeatGauge({ used, limit }) {
  const unlimited = limit === -1
  const label = unlimited ? `${used} membre(s) · illimité` : `${used} / ${limit} sièges`
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100))
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-[220px]">
      <div className="text-sm text-gray-500 mb-1">Sièges</div>
      <div className="font-semibold text-gray-900">{label}</div>
      {!unlimited && (
        <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

function copyLink(path) {
  const url = window.location.origin + path
  navigator.clipboard.writeText(url)
  toast.success('Lien d\'invitation copié')
}

function Team() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('team', teamService.getTeam)
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [newTeam, setNewTeam] = useState('')

  const refresh = () => qc.invalidateQueries('team')
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')

  const invite = useMutation(teamService.invite, {
    onSuccess: (res) => { toast.success('Invitation créée'); if (res.invite_path) copyLink(res.invite_path); setEmail(''); refresh() },
    onError: onErr,
  })
  const resend = useMutation(teamService.resendInvite, {
    onSuccess: (res) => { if (res.invite_path) copyLink(res.invite_path); toast.success('Invitation relancée'); refresh() }, onError: onErr,
  })
  const revoke = useMutation(teamService.revokeInvite, { onSuccess: () => { toast.success('Invitation révoquée'); refresh() }, onError: onErr })
  const createTeam = useMutation(() => teamService.createTeam(newTeam), { onSuccess: () => { toast.success('Équipe créée'); setNewTeam(''); refresh() }, onError: onErr })
  const deleteTeam = useMutation(teamService.deleteTeam, { onSuccess: () => { toast.success('Équipe supprimée'); refresh() }, onError: onErr })
  const removeMember = useMutation(teamService.removeMember, { onSuccess: () => { toast.success('Membre retiré'); refresh() }, onError: onErr })
  const assign = useMutation(({ id, body }) => teamService.updateMember(id, body), { onSuccess: () => refresh(), onError: onErr })

  if (isLoading) return <div className="p-8">Chargement…</div>
  const d = data || {}
  const canManage = d.can_manage
  const teamsAllowed = (d.teams_quota?.limit ?? 0) !== 0
  const canAddTeam = d.teams_quota?.limit === -1 || (d.teams_quota?.used ?? 0) < (d.teams_quota?.limit ?? 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Équipe</h1>
          <p className="text-gray-500">Gérez les membres, invitations et équipes.</p>
        </div>
        <SeatGauge used={d.seats?.used ?? 0} limit={d.seats?.limit ?? 0} />
      </div>

      {canManage && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Inviter un membre</h3>
          <div className="flex flex-wrap gap-2">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="email@exemple.com"
                   className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] text-gray-900" />
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
              <option value="">Sans équipe</option>
              {(d.teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              onClick={() => email && invite.mutate({ email, role_id: roleId || null, team_id: teamId || null })}
              className="btn-primary inline-flex items-center gap-2">
              <FiUserPlus /> Inviter
            </button>
          </div>
        </div>
      )}

      {(d.invitations || []).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Invitations en attente</h3>
          <ul className="divide-y divide-gray-100">
            {d.invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                <span>{inv.email}{inv.role_name ? ` · ${inv.role_name}` : ''}</span>
                {canManage && (
                  <span className="flex gap-2">
                    <button onClick={() => resend.mutate(inv.id)} className="text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"><FiRefreshCw /> Relancer</button>
                    <button onClick={() => revoke.mutate(inv.id)} className="text-red-600 inline-flex items-center gap-1"><FiTrash2 /> Révoquer</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {teamsAllowed && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Équipes</h3>
            {canManage && (
              <div className="flex gap-2">
                <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Nouvelle équipe"
                       className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900" />
                <button disabled={!canAddTeam || !newTeam} onClick={() => createTeam.mutate()}
                        className="btn-secondary disabled:opacity-50">Créer</button>
              </div>
            )}
          </div>
          {!canAddTeam && <p className="text-xs text-amber-600 mb-2">Limite d'équipes atteinte — passez à un plan supérieur.</p>}
          <div className="flex flex-wrap gap-2">
            {(d.teams || []).map((t) => (
              <span key={t.id} className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1 text-sm">
                {t.name} ({t.members_count})
                {canManage && <button onClick={() => deleteTeam.mutate(t.id)} className="text-red-500"><FiTrash2 className="w-3.5 h-3.5" /></button>}
              </span>
            ))}
            {(d.teams || []).length === 0 && <span className="text-gray-400 text-sm">Aucune équipe.</span>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Membres</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr><th className="py-2">Nom</th><th>Email</th><th>Équipe</th><th></th></tr>
          </thead>
          <tbody>
            {(d.members || []).map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="py-2">{m.full_name}{m.is_owner && <span className="ml-2 text-xs text-primary-600">(propriétaire)</span>}</td>
                <td>{m.email}</td>
                <td>
                  {canManage && teamsAllowed ? (
                    <select value={m.team_id || ''} onChange={(e) => assign.mutate({ id: m.id, body: { team_id: e.target.value ? Number(e.target.value) : null } })}
                            className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-900">
                      <option value="">—</option>
                      {(d.teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : ((d.teams || []).find((t) => t.id === m.team_id)?.name || '—')}
                </td>
                <td className="text-right">
                  {canManage && !m.is_owner && (
                    <button onClick={() => removeMember.mutate(m.id)} className="text-red-600 text-xs">Retirer</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Team
```

Note: this removes the old broken `POST /backoffice/users/invite` call. If any other file imports helpers from the old Team.jsx, update them (grep `from '../../pages/backoffice/Team'`). Role selection in the invite form is omitted for simplicity (role can be assigned after acceptance via the member row); if the existing page exposed roles and you want parity, add a role `<select>` populated from a roles query — optional.

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/services/teamService.js frontend/src/pages/backoffice/Team.jsx
git commit -m "feat(teams): refonte page Équipe (jauge sièges, invitations lien copiable, équipes)"
```

---

### Task 8: Frontend — public invitation-accept page

**Files:**
- Create: `frontend/src/pages/auth/AcceptInvitation.jsx`
- Modify: `frontend/src/App.jsx` (public route `/invitation/:token`)
- Test: `cd frontend && npm run build`

**Interfaces:** consumes `GET /invitations/:token` and `POST /invitations/:token/accept` (direct `api` calls or via a tiny inline service); on success stores tokens via `useAuthStore` and redirects to `/backoffice`.

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/auth/AcceptInvitation.jsx`:
```javascript
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { toast } from 'react-toastify'
import api from '../../services/api'
import useAuthStore from '../../store/authStore'

function AcceptInvitation() {
  const { token } = useParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.login ? s : s) // access store setters below
  const [form, setForm] = useState({ first_name: '', last_name: '', password: '', confirm: '' })
  const [submitting, setSubmitting] = useState(false)

  const { data, isLoading, isError, error } = useQuery(
    ['invitation', token],
    async () => (await api.get(`/invitations/${token}`)).data,
    { retry: false }
  )

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) return toast.error('Mot de passe : 8 caractères minimum')
    if (form.password !== form.confirm) return toast.error('Les mots de passe ne correspondent pas')
    setSubmitting(true)
    try {
      const res = await api.post(`/invitations/${token}/accept`, {
        first_name: form.first_name, last_name: form.last_name, password: form.password,
      })
      const { user, access_token, refresh_token } = res.data
      localStorage.setItem('token', access_token)
      localStorage.setItem('userId', String(user.id))
      useAuthStore.setState({ user, accessToken: access_token, refreshToken: refresh_token, isAuthenticated: true })
      toast.success('Bienvenue dans l\'équipe !')
      navigate('/backoffice')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Chargement…</div>
  if (isError) {
    const msg = error?.response?.status === 410 ? 'Cette invitation a expiré.' : 'Invitation invalide.'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-gray-700">{msg}</p>
        <Link to="/connexion" className="text-primary-600 underline">Aller à la connexion</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow p-6 w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Rejoindre {data.agency_name}</h1>
        <p className="text-sm text-gray-500">Invitation pour {data.email}{data.role_name ? ` · ${data.role_name}` : ''}</p>
        <div className="grid grid-cols-2 gap-3">
          <input required placeholder="Prénom" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                 className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
          <input required placeholder="Nom" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                 className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        </div>
        <input required type="password" placeholder="Mot de passe (8 car. min.)" value={form.password}
               onChange={(e) => setForm({ ...form, password: e.target.value })}
               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        <input required type="password" placeholder="Confirmer le mot de passe" value={form.confirm}
               onChange={(e) => setForm({ ...form, confirm: e.target.value })}
               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        <button disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Création…' : 'Activer mon compte'}
        </button>
      </form>
    </div>
  )
}

export default AcceptInvitation
```

Note: remove the unused `setAuth` line if lint complains; use `useAuthStore.setState(...)` as shown (zustand exposes `setState` on the store hook). Verify the store's persisted keys match (`user`, `accessToken`, `refreshToken`, `isAuthenticated`) by reading `authStore.js`.

- [ ] **Step 2: Add the public route**

In `frontend/src/App.jsx`, import `AcceptInvitation` and add a public route (inside the `/` Layout group or as a standalone top-level route — match how `/connexion` is placed). Simplest: add alongside the public auth routes:
```javascript
        <Route path="invitation/:token" element={<AcceptInvitation />} />
```
(If placed under the `Layout` route it gets the site chrome; a standalone full-screen route is also fine — pick consistent with `/connexion`.)

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/auth/AcceptInvitation.jsx frontend/src/App.jsx
git commit -m "feat(teams): page publique d'acceptation d'invitation (/invitation/:token)"
```

---

### Task 9: Integration verification + race guard + build

**Files:**
- Create: `backend/scripts/verify_teams_all.py`
- Test: this task is the gate.

- [ ] **Step 1: Aggregate runner**

Create `backend/scripts/verify_teams_all.py`:
```python
"""Run all teams/seats verification scripts. python3 scripts/verify_teams_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = [
    'verify_team_models.py', 'verify_team_seed.py', 'verify_seats_service.py',
    'verify_team_api.py', 'verify_invitations.py', 'verify_downgrade_guard.py',
]
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Clean re-seed**

Run: `cd backend && source venv/bin/activate && python3 seed.py && python3 seed_backoffice.py`
Expected: seeds cleanly. (If `seed.py` errors on a non-empty DB from the known pre-existing `clear_data()` bug, reset the schema drop/create then re-run — do NOT modify seed.py.)

- [ ] **Step 3: Run the full backend suite**

Run: `python3 scripts/verify_teams_all.py`
Expected: `ALL PASS`. If a script fails only because a prior script mutated shared state, re-seed and re-run; if a script reveals a real bug, fix it (or escalate) rather than papering over.

- [ ] **Step 4: Frontend build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, no errors.

- [ ] **Step 5: Manual UI smoke test (deferred to user unless a browser is available)**

As an agency admin (Pro plan): open `/backoffice/equipe` → seat gauge shows N/5 → invite an email → a copyable invite link toast appears → open the link (`/invitation/<token>`) in a private window → fill name+password → land in `/backoffice` as the new member → seat gauge incremented. Create a team (allowed once on Pro; second create disabled). Revoke a pending invitation → seat freed.

- [ ] **Step 6: Commit**
```bash
git add backend/scripts/verify_teams_all.py
git commit -m "test(teams): runner de vérification agrégé équipes & sièges"
```

---

## Self-Review notes (coverage vs spec)

- §4 models + migration → Task 1. §10 seed → Task 2. §5 seats service + §8 mailer → Task 3. §6 permission `team.manage` → Tasks 2 (seed) + 3 (`can_manage_team`) + 4 (guards). §7.1 backoffice API → Tasks 4 (teams/members) + 5 (invitations). §7.2 public accept → Task 5. §7.3 downgrade guard → Task 6. §9.1 Team page → Task 7. §9.2 accept page → Task 8. §11 tests → each task + aggregate Task 9.
- Known simplifications (MVP): invite form omits role selection (role assignable post-accept from the member row); the accept-time seat race guard is coarse (Task 5) — Task 9's manual/edge coverage can tighten it. Brevo SMTP is config-only; delivery is verified via the copyable link path, not a live send.
- Cross-task type consistency: `invite_path` returned by create/resend and consumed by the frontend (`copyLink`); `seats:{used,limit}` / `teams_quota:{used,limit}` shape produced by `GET /backoffice/team` and consumed by `Team.jsx`; `can_manage` boolean gate consistent backend↔frontend.
