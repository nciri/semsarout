# Juridique & notaires — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Pro/Enterprise agencies a notary directory (assignable to deals) and a per-transaction legal dossier — an editable checklist auto-generated from a sale/rental template, with per-step status, due date and assignee.

**Architecture:** Three models (`Notary`, `LegalCase`, `LegalTask`) + a `has_legal` plan flag; a `legal_checklists` constant service; agency-scoped `/backoffice/notaries`, `/backoffice/legal-cases`, `/backoffice/legal-tasks` routes gated by `require_legal` (mirrors brick 4's `require_contracts`). Frontend: a Notaries directory + a Legal cases list & checklist detail.

**Tech Stack:** Flask + SQLAlchemy (backend); React 18 + react-router + react-query (frontend). No new deps. Spec: `docs/superpowers/specs/2026-07-23-legal-notaries-design.md`.

## Global Constraints

- **JWT identity always `str(user.id)`**; agency scope from `require_auth` (`g.agency_id`, `g.current_user`) in `backend/app/api/v1/backoffice/dashboard.py`.
- **No pytest infra.** Verification = standalone scripts in `backend/scripts/`, `from seed import app`, `app.test_client()`. Print PASS/FAIL, non-zero exit on failure. Agency-member seed password `password123`.
- **Frontend API via the shared `api` axios instance.**
- **Gating:** `require_legal` (after `require_auth`) → 403 unless the agency's subscription plan has `has_legal`. Model it on brick 4's `require_contracts` in `backend/app/api/v1/backoffice/contracts.py` (`@wraps(f)` outer, `@require_auth` inner, then plan check).
- **Agency isolation:** every notary/case/task query filtered by `g.agency_id`; task routes must verify the PARENT legal case belongs to the agency before any op; `notary_id` assignment validated to belong to the agency; no cross-agency read/write.
- **case_type:** `sale` or `rental`. From a transaction: `sale` if `transaction.transaction_type == 'sale'` else `rental`. Standalone: from body, default `sale`.
- **Checklist generation:** on `LegalCase` create, generate `LegalTask` rows from `LEGAL_CHECKLISTS[case_type]` (fallback `sale`), `position` 0..n, `status='todo'`.
- **Task status:** `todo`/`in_progress`/`done`; setting `done` sets `completed_at=now`, any other status clears it.
- **French UI copy.** Backend venv: `cd backend && source venv/bin/activate`. Migration head via `flask db heads`.
- TDD each task; Conventional Commits French; NEVER AI attribution; commit ONLY the task's listed files (never stage unrelated changes, e.g. PropertyDetail.jsx).

---

### Task 1: Models (`Notary`, `LegalCase`, `LegalTask`) + `has_legal` + migration

**Files:**
- Create: `backend/app/models/legal.py`
- Modify: `backend/app/models/subscription.py` (+`has_legal`), `backend/app/models/__init__.py`
- Create: `backend/migrations/versions/e5f6a7b8c9d0_add_legal.py`
- Test: `backend/scripts/verify_legal_models.py`

**Interfaces (Produces):**
- `Notary(id, agency_id, name, office, city, phone, email, license_number, notes, created_at, updated_at)` + `to_dict()`
- `LegalCase(id, agency_id, transaction_id, property_id, notary_id, title, case_type, status, notes, created_by, created_at, updated_at)` + `to_dict()` (with `tasks_done`, `tasks_total`, `notary`)
- `LegalTask(id, legal_case_id, label, status, due_date, assignee_id, position, notes, completed_at, created_at)` + `to_dict()`
- `SubscriptionPlan.has_legal: bool` (+ in `to_dict()`)

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_legal_models.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import Notary, LegalCase, LegalTask, Agency, SubscriptionPlan

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    p = SubscriptionPlan.query.first()
    check(hasattr(p, 'has_legal') and 'has_legal' in p.to_dict(), "plan.has_legal + to_dict")
    a = Agency.query.first()
    n = Notary(agency_id=a.id, name='Me Test', city='Casablanca')
    db.session.add(n); db.session.commit()
    check(n.id and n.to_dict()['name'] == 'Me Test', "Notary row+to_dict")
    lc = LegalCase(agency_id=a.id, title='Dossier X', case_type='sale', status='open')
    db.session.add(lc); db.session.commit()
    t = LegalTask(legal_case_id=lc.id, label='Titre foncier', status='todo', position=0)
    db.session.add(t); db.session.commit()
    d = lc.to_dict()
    check('tasks_total' in d and d['tasks_total'] == 1, "LegalCase.to_dict tasks_total")
    check(t.to_dict()['label'] == 'Titre foncier', "LegalTask.to_dict")
    db.session.delete(t); db.session.delete(lc); db.session.delete(n); db.session.commit()

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_legal_models.py`
Expected: FAIL (ImportError).

- [ ] **Step 3: Add `has_legal` to the plan**

In `backend/app/models/subscription.py`, `SubscriptionPlan`, after `has_contracts`:
```python
    has_legal = db.Column(db.Boolean, default=False)
```
In `to_dict()` add `'has_legal': self.has_legal,`.

- [ ] **Step 4: Create the models**

Create `backend/app/models/legal.py`:
```python
from datetime import datetime
from app import db


class Notary(db.Model):
    __tablename__ = 'notaries'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    office = db.Column(db.String(200))
    city = db.Column(db.String(100))
    phone = db.Column(db.String(30))
    email = db.Column(db.String(120))
    license_number = db.Column(db.String(50))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'agency_id': self.agency_id, 'name': self.name,
                'office': self.office, 'city': self.city, 'phone': self.phone,
                'email': self.email, 'license_number': self.license_number, 'notes': self.notes,
                'created_at': self.created_at.isoformat() if self.created_at else None}


class LegalCase(db.Model):
    __tablename__ = 'legal_cases'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    transaction_id = db.Column(db.Integer, db.ForeignKey('transactions.id'), nullable=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)
    notary_id = db.Column(db.Integer, db.ForeignKey('notaries.id'), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    case_type = db.Column(db.String(20), default='sale')
    status = db.Column(db.String(20), default='open')
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_tasks=False):
        tasks = LegalTask.query.filter_by(legal_case_id=self.id).all()
        notary = Notary.query.get(self.notary_id) if self.notary_id else None
        d = {
            'id': self.id, 'agency_id': self.agency_id, 'transaction_id': self.transaction_id,
            'property_id': self.property_id, 'notary_id': self.notary_id,
            'notary': notary.to_dict() if notary else None,
            'title': self.title, 'case_type': self.case_type, 'status': self.status,
            'notes': self.notes,
            'tasks_total': len(tasks),
            'tasks_done': sum(1 for t in tasks if t.status == 'done'),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_tasks:
            d['tasks'] = [t.to_dict() for t in sorted(tasks, key=lambda x: x.position)]
        return d


class LegalTask(db.Model):
    __tablename__ = 'legal_tasks'
    id = db.Column(db.Integer, primary_key=True)
    legal_case_id = db.Column(db.Integer, db.ForeignKey('legal_cases.id'), nullable=False, index=True)
    label = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), default='todo')
    due_date = db.Column(db.DateTime, nullable=True)
    assignee_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    position = db.Column(db.Integer, default=0)
    notes = db.Column(db.Text)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'legal_case_id': self.legal_case_id, 'label': self.label,
                'status': self.status,
                'due_date': self.due_date.isoformat() if self.due_date else None,
                'assignee_id': self.assignee_id, 'position': self.position, 'notes': self.notes,
                'completed_at': self.completed_at.isoformat() if self.completed_at else None,
                'created_at': self.created_at.isoformat() if self.created_at else None}
```

- [ ] **Step 5: Register the models**

In `backend/app/models/__init__.py` add:
```python
from app.models.legal import Notary, LegalCase, LegalTask
```

- [ ] **Step 6: Migration**

Find head (`flask db heads`). Create `backend/migrations/versions/e5f6a7b8c9d0_add_legal.py`:
```python
"""Add notaries, legal_cases, legal_tasks + has_legal plan flag."""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'REPLACE_WITH_CURRENT_HEAD'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.add_column(sa.Column('has_legal', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.create_table('notaries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('office', sa.String(length=200), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=30), nullable=True),
        sa.Column('email', sa.String(length=120), nullable=True),
        sa.Column('license_number', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_notaries_agency_id', 'notaries', ['agency_id'])
    op.create_table('legal_cases',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('transaction_id', sa.Integer(), sa.ForeignKey('transactions.id'), nullable=True),
        sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True),
        sa.Column('notary_id', sa.Integer(), sa.ForeignKey('notaries.id'), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('case_type', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_legal_cases_agency_id', 'legal_cases', ['agency_id'])
    op.create_table('legal_tasks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('legal_case_id', sa.Integer(), sa.ForeignKey('legal_cases.id'), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('assignee_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('position', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_legal_tasks_legal_case_id', 'legal_tasks', ['legal_case_id'])

def downgrade():
    op.drop_index('ix_legal_tasks_legal_case_id', table_name='legal_tasks')
    op.drop_table('legal_tasks')
    op.drop_index('ix_legal_cases_agency_id', table_name='legal_cases')
    op.drop_table('legal_cases')
    op.drop_index('ix_notaries_agency_id', table_name='notaries')
    op.drop_table('notaries')
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.drop_column('has_legal')
```
Apply: `flask db upgrade`.

- [ ] **Step 7: Run — verify it passes**

Run: `python3 scripts/verify_legal_models.py`
Expected: all PASS.

- [ ] **Step 8: Commit**
```bash
git add backend/app/models/legal.py backend/app/models/subscription.py backend/app/models/__init__.py backend/migrations/versions/e5f6a7b8c9d0_add_legal.py backend/scripts/verify_legal_models.py
git commit -m "feat(juridique): modèles Notary/LegalCase/LegalTask + flag plan has_legal + migration"
```

---

### Task 2: Checklist constant + seed (`has_legal` flag + demo notaries)

**Files:**
- Create: `backend/app/services/legal_checklists.py`
- Modify: `backend/seed_backoffice.py`
- Test: `backend/scripts/verify_legal_seed.py`

**Interfaces (Produces):**
- `legal_checklists.LEGAL_CHECKLISTS: dict`, `legal_checklists.default_tasks(case_type) -> list[str]`
- After seeding: `pro`/`enterprise` have `has_legal=True`; each seeded agency has ≥1 demo `Notary`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_legal_seed.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import SubscriptionPlan, Notary, Agency
from app.services.legal_checklists import default_tasks

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    check(len(default_tasks('sale')) >= 5, "sale checklist has steps")
    check(len(default_tasks('rental')) >= 3, "rental checklist has steps")
    check(default_tasks('unknown') == default_tasks('sale'), "unknown falls back to sale")
    for slug in ('pro', 'enterprise'):
        p = SubscriptionPlan.query.filter_by(slug=slug).first()
        check(p and p.has_legal is True, f"{slug} has_legal")
    check(Notary.query.count() >= 1, "at least one demo notary seeded")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_legal_seed.py`
Expected: FAIL.

- [ ] **Step 3: Create the checklist constant**

Create `backend/app/services/legal_checklists.py`:
```python
"""Default legal checklists per transaction type."""

LEGAL_CHECKLISTS = {
    'sale': [
        'Vérification du titre foncier',
        'Certificat de propriété récent',
        'Quitus fiscal / taxes à jour',
        'Compromis de vente signé',
        'Dépôt du dossier chez le notaire',
        'Levée des conditions suspensives',
        "Signature de l'acte définitif",
        'Enregistrement & conservation foncière',
    ],
    'rental': [
        'Vérification de la propriété',
        "État des lieux d'entrée",
        'Contrat de bail signé',
        'Dépôt de garantie encaissé',
        'Enregistrement du bail',
    ],
}


def default_tasks(case_type):
    return list(LEGAL_CHECKLISTS.get(case_type, LEGAL_CHECKLISTS['sale']))
```

- [ ] **Step 4: Seed in seed_backoffice.py**

In `backend/seed_backoffice.py`, add a function and call it from the seed entrypoint (read the file to find it, e.g. `seed_all()`; `db`, `Agency` available):
```python
def seed_legal():
    from app.models import SubscriptionPlan, Notary, Agency
    for slug in ('pro', 'enterprise'):
        plan = SubscriptionPlan.query.filter_by(slug=slug).first()
        if plan:
            plan.has_legal = True
    for agency in Agency.query.all():
        if Notary.query.filter_by(agency_id=agency.id).first():
            continue
        db.session.add(Notary(agency_id=agency.id, name='Me Fatima Alaoui',
                              office='Étude notariale Alaoui', city=agency.city or 'Casablanca',
                              phone='+212 522 00 00 00', email='contact@notaire-alaoui.ma'))
    db.session.commit()
    print("  Seeded has_legal flag + demo notaries")
```
Call `seed_legal()` in the seed entrypoint.

- [ ] **Step 5: Re-seed + verify**

Run: `python3 seed_backoffice.py && python3 scripts/verify_legal_seed.py`
Expected: all PASS. (If reseed needs a schema reset per the known pre-existing `clear_data` bug, reset schema drop/create + `flask db upgrade` + reseed; do NOT modify seed.py.)

- [ ] **Step 6: Commit**
```bash
git add backend/app/services/legal_checklists.py backend/seed_backoffice.py backend/scripts/verify_legal_seed.py
git commit -m "feat(juridique): checklists par défaut + seed flag has_legal et notaires démo"
```

---

### Task 3: `require_legal` guard + Notaries CRUD API

**Files:**
- Create: `backend/app/api/v1/backoffice/legal.py`
- Modify: `backend/app/api/v1/backoffice/__init__.py`
- Test: `backend/scripts/verify_notaries_api.py`

**Interfaces (Produces):**
- `require_legal` decorator, `_agency()`, `_plan(agency)`.
- `GET/POST /backoffice/notaries` · `PUT/DELETE /backoffice/notaries/:id` (agency-scoped).

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_notaries_api.py`:
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
def set_plan(agency, slug):
    plan = SubscriptionPlan.query.filter_by(slug=slug).first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=plan.id, amount=plan.price_monthly, status='active'); db.session.add(sub)
    else:
        sub.plan_id = plan.id
    db.session.commit()

with app.app_context():
    admin = User.query.filter(User.agency_id.isnot(None)).first()
    agency = Agency.query.get(admin.agency_id)
    set_plan(agency, 'starter')
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/notaries', headers=h)
    check(r.status_code == 403, "starter (no has_legal) -> 403")
    set_plan(agency, 'pro')
    r = c.post('/api/v1/backoffice/notaries', json={'name': 'Me Test', 'city': 'Rabat'}, headers=h)
    check(r.status_code in (200, 201), "create notary")
    nid = r.get_json()['notary']['id']
    r = c.get('/api/v1/backoffice/notaries', headers=h)
    check(r.status_code == 200 and any(n['id'] == nid for n in r.get_json()['notaries']), "list contains notary")
    r = c.put(f'/api/v1/backoffice/notaries/{nid}', json={'city': 'Fès'}, headers=h)
    check(r.status_code == 200 and r.get_json()['notary']['city'] == 'Fès', "update notary")
    r = c.delete(f'/api/v1/backoffice/notaries/{nid}', headers=h)
    check(r.status_code == 200, "delete notary")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_notaries_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement guard + notaries routes**

Create `backend/app/api/v1/backoffice/legal.py`:
```python
from functools import wraps
from flask import jsonify, request, g
from app import db
from app.models import Agency, Subscription, Notary
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth


def _agency():
    return Agency.query.get(g.agency_id) if g.agency_id else None


def _plan(agency):
    sub = Subscription.query.filter_by(agency_id=agency.id).first() if agency else None
    return sub.plan if sub else None


def require_legal(f):
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        agency = _agency()
        plan = _plan(agency)
        if not agency or not plan or not plan.has_legal:
            return jsonify({'error': "Fonction réservée aux plans Pro et Entreprise."}), 403
        return f(*args, **kwargs)
    return decorated


_NOTARY_FIELDS = ['name', 'office', 'city', 'phone', 'email', 'license_number', 'notes']


@backoffice_bp.route('/notaries', methods=['GET'])
@require_legal
def list_notaries():
    rows = Notary.query.filter_by(agency_id=g.agency_id).order_by(Notary.name).all()
    return jsonify({'notaries': [n.to_dict() for n in rows]})


@backoffice_bp.route('/notaries', methods=['POST'])
@require_legal
def create_notary():
    data = request.get_json(silent=True) or {}
    if not data.get('name'):
        return jsonify({'error': 'Le nom est requis'}), 400
    n = Notary(agency_id=g.agency_id, **{k: data.get(k) for k in _NOTARY_FIELDS})
    db.session.add(n)
    db.session.commit()
    return jsonify({'notary': n.to_dict()}), 201


@backoffice_bp.route('/notaries/<int:nid>', methods=['PUT'])
@require_legal
def update_notary(nid):
    n = Notary.query.filter_by(id=nid, agency_id=g.agency_id).first()
    if not n:
        return jsonify({'error': 'Notaire introuvable'}), 404
    data = request.get_json(silent=True) or {}
    for k in _NOTARY_FIELDS:
        if k in data:
            setattr(n, k, data[k])
    db.session.commit()
    return jsonify({'notary': n.to_dict()})


@backoffice_bp.route('/notaries/<int:nid>', methods=['DELETE'])
@require_legal
def delete_notary(nid):
    n = Notary.query.filter_by(id=nid, agency_id=g.agency_id).first()
    if not n:
        return jsonify({'error': 'Notaire introuvable'}), 404
    db.session.delete(n)
    db.session.commit()
    return jsonify({'message': 'Notaire supprimé'})
```
In `backend/app/api/v1/backoffice/__init__.py`, add `from app.api.v1.backoffice import legal`.

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_notaries_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/legal.py backend/app/api/v1/backoffice/__init__.py backend/scripts/verify_notaries_api.py
git commit -m "feat(juridique): garde require_legal + API annuaire notaires"
```

---

### Task 4: Legal cases API (create+checklist gen, list, get, update, delete)

**Files:**
- Modify: `backend/app/api/v1/backoffice/legal.py`
- Test: `backend/scripts/verify_legal_cases_api.py`

**Interfaces (Produces):**
- `GET /backoffice/legal-cases?transaction_id=&status=`
- `POST /backoffice/legal-cases {title?, transaction_id?, property_id?, case_type?, notary_id?}` → generates tasks
- `GET /backoffice/legal-cases/:id` (with tasks) · `PUT /:id {title?, status?, notary_id?, notes?}` · `DELETE /:id`

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_legal_cases_api.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription
from app.services.legal_checklists import default_tasks

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
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.post('/api/v1/backoffice/legal-cases', json={'title': 'Dossier vente A', 'case_type': 'sale'}, headers=h)
    check(r.status_code in (200, 201), "create legal case")
    cid = r.get_json()['case']['id']
    r = c.get(f'/api/v1/backoffice/legal-cases/{cid}', headers=h)
    body = r.get_json()['case']
    check(len(body['tasks']) == len(default_tasks('sale')), "checklist generated from sale template")
    check(body['tasks_total'] == len(default_tasks('sale')), "tasks_total matches")
    r = c.put(f'/api/v1/backoffice/legal-cases/{cid}', json={'status': 'in_progress'}, headers=h)
    check(r.status_code == 200 and r.get_json()['case']['status'] == 'in_progress', "update status")
    r = c.get('/api/v1/backoffice/legal-cases', headers=h)
    check(r.status_code == 200 and any(x['id'] == cid for x in r.get_json()['cases']), "list contains case")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_legal_cases_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement legal-cases routes**

Append to `backend/app/api/v1/backoffice/legal.py`:
```python
from app.models import LegalCase, LegalTask, Transaction, Property
from app.services.legal_checklists import default_tasks


def _get_case(cid):
    return LegalCase.query.filter_by(id=cid, agency_id=g.agency_id).first()


@backoffice_bp.route('/legal-cases', methods=['GET'])
@require_legal
def list_legal_cases():
    q = LegalCase.query.filter_by(agency_id=g.agency_id)
    if request.args.get('status'):
        q = q.filter(LegalCase.status == request.args.get('status'))
    if request.args.get('transaction_id', type=int):
        q = q.filter(LegalCase.transaction_id == request.args.get('transaction_id', type=int))
    rows = q.order_by(LegalCase.created_at.desc()).all()
    return jsonify({'cases': [c.to_dict() for c in rows]})


@backoffice_bp.route('/legal-cases', methods=['POST'])
@require_legal
def create_legal_case():
    data = request.get_json(silent=True) or {}
    txn = prop = None
    if data.get('transaction_id'):
        txn = Transaction.query.filter_by(id=data['transaction_id'], agency_id=g.agency_id).first()
    if data.get('property_id'):
        prop = Property.query.filter_by(id=data['property_id'], agency_id=g.agency_id).first()
    case_type = data.get('case_type')
    if txn is not None:
        case_type = 'sale' if txn.transaction_type == 'sale' else 'rental'
    if case_type not in ('sale', 'rental'):
        case_type = 'sale'
    notary_id = None
    if data.get('notary_id'):
        if not Notary.query.filter_by(id=data['notary_id'], agency_id=g.agency_id).first():
            return jsonify({'error': 'Notaire invalide'}), 400
        notary_id = data['notary_id']
    title = data.get('title') or (f"Dossier {txn.reference}" if txn else 'Dossier juridique')
    case = LegalCase(agency_id=g.agency_id, transaction_id=(txn.id if txn else None),
                     property_id=(prop.id if prop else None), notary_id=notary_id,
                     title=title, case_type=case_type, status='open', created_by=g.current_user.id)
    db.session.add(case)
    db.session.flush()
    for i, label in enumerate(default_tasks(case_type)):
        db.session.add(LegalTask(legal_case_id=case.id, label=label, status='todo', position=i))
    db.session.commit()
    return jsonify({'case': case.to_dict(include_tasks=True)}), 201


@backoffice_bp.route('/legal-cases/<int:cid>', methods=['GET'])
@require_legal
def get_legal_case(cid):
    case = _get_case(cid)
    if not case:
        return jsonify({'error': 'Dossier introuvable'}), 404
    return jsonify({'case': case.to_dict(include_tasks=True)})


@backoffice_bp.route('/legal-cases/<int:cid>', methods=['PUT'])
@require_legal
def update_legal_case(cid):
    case = _get_case(cid)
    if not case:
        return jsonify({'error': 'Dossier introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        case.title = data['title']
    if 'status' in data:
        case.status = data['status']
    if 'notes' in data:
        case.notes = data['notes']
    if 'notary_id' in data:
        nid = data['notary_id']
        if nid and not Notary.query.filter_by(id=nid, agency_id=g.agency_id).first():
            return jsonify({'error': 'Notaire invalide'}), 400
        case.notary_id = nid
    db.session.commit()
    return jsonify({'case': case.to_dict(include_tasks=True)})


@backoffice_bp.route('/legal-cases/<int:cid>', methods=['DELETE'])
@require_legal
def delete_legal_case(cid):
    case = _get_case(cid)
    if not case:
        return jsonify({'error': 'Dossier introuvable'}), 404
    LegalTask.query.filter_by(legal_case_id=case.id).delete()
    db.session.delete(case)
    db.session.commit()
    return jsonify({'message': 'Dossier supprimé'})
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_legal_cases_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/legal.py backend/scripts/verify_legal_cases_api.py
git commit -m "feat(juridique): API dossiers (création + génération checklist, liste, get, update, delete)"
```

---

### Task 5: Legal tasks API (add, update/toggle, delete)

**Files:**
- Modify: `backend/app/api/v1/backoffice/legal.py`
- Test: `backend/scripts/verify_legal_tasks_api.py`

**Interfaces (Produces):**
- `POST /backoffice/legal-cases/:id/tasks {label, due_date?, assignee_id?}`
- `PUT /backoffice/legal-tasks/:id {label?, status?, due_date?, assignee_id?, position?}`
- `DELETE /backoffice/legal-tasks/:id`
- All verify the parent case belongs to `g.agency_id`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_legal_tasks_api.py`:
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
    plan = SubscriptionPlan.query.filter_by(slug='pro').first()
    sub = Subscription.query.filter_by(agency_id=agency.id).first()
    if not sub:
        sub = Subscription(agency_id=agency.id, plan_id=plan.id, amount=plan.price_monthly, status='active'); db.session.add(sub)
    else:
        sub.plan_id = plan.id
    db.session.commit()
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    cid = c.post('/api/v1/backoffice/legal-cases', json={'title': 'D', 'case_type': 'sale'}, headers=h).get_json()['case']['id']
    # add task
    r = c.post(f'/api/v1/backoffice/legal-cases/{cid}/tasks', json={'label': 'Étape ajoutée'}, headers=h)
    check(r.status_code in (200, 201), "add task")
    tid = r.get_json()['task']['id']
    # mark done -> completed_at set
    r = c.put(f'/api/v1/backoffice/legal-tasks/{tid}', json={'status': 'done'}, headers=h)
    check(r.status_code == 200 and r.get_json()['task']['completed_at'], "done sets completed_at")
    # back to todo -> completed_at cleared
    r = c.put(f'/api/v1/backoffice/legal-tasks/{tid}', json={'status': 'todo'}, headers=h)
    check(r.status_code == 200 and not r.get_json()['task']['completed_at'], "todo clears completed_at")
    # delete
    r = c.delete(f'/api/v1/backoffice/legal-tasks/{tid}', headers=h)
    check(r.status_code == 200, "delete task")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_legal_tasks_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement task routes**

Append to `backend/app/api/v1/backoffice/legal.py`:
```python
from datetime import datetime


def _get_task_scoped(tid):
    """Task whose parent case belongs to this agency, else None."""
    task = LegalTask.query.get(tid)
    if not task:
        return None
    case = LegalCase.query.filter_by(id=task.legal_case_id, agency_id=g.agency_id).first()
    return task if case else None


def _parse_due(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


@backoffice_bp.route('/legal-cases/<int:cid>/tasks', methods=['POST'])
@require_legal
def add_task(cid):
    case = _get_case(cid)
    if not case:
        return jsonify({'error': 'Dossier introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if not data.get('label'):
        return jsonify({'error': 'Le libellé est requis'}), 400
    maxpos = db.session.query(db.func.max(LegalTask.position)).filter_by(legal_case_id=cid).scalar()
    t = LegalTask(legal_case_id=cid, label=data['label'], status='todo',
                  due_date=_parse_due(data.get('due_date')), assignee_id=data.get('assignee_id'),
                  position=(maxpos or 0) + 1)
    db.session.add(t)
    db.session.commit()
    return jsonify({'task': t.to_dict()}), 201


@backoffice_bp.route('/legal-tasks/<int:tid>', methods=['PUT'])
@require_legal
def update_task(tid):
    t = _get_task_scoped(tid)
    if not t:
        return jsonify({'error': 'Tâche introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'label' in data:
        t.label = data['label']
    if 'assignee_id' in data:
        t.assignee_id = data['assignee_id']
    if 'position' in data:
        t.position = data['position']
    if 'notes' in data:
        t.notes = data['notes']
    if 'due_date' in data:
        t.due_date = _parse_due(data['due_date'])
    if 'status' in data:
        t.status = data['status']
        t.completed_at = datetime.utcnow() if data['status'] == 'done' else None
    db.session.commit()
    return jsonify({'task': t.to_dict()})


@backoffice_bp.route('/legal-tasks/<int:tid>', methods=['DELETE'])
@require_legal
def delete_task(tid):
    t = _get_task_scoped(tid)
    if not t:
        return jsonify({'error': 'Tâche introuvable'}), 404
    db.session.delete(t)
    db.session.commit()
    return jsonify({'message': 'Tâche supprimée'})
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_legal_tasks_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/legal.py backend/scripts/verify_legal_tasks_api.py
git commit -m "feat(juridique): API tâches de checklist (ajout, mise à jour/coche, suppression) avec scope agence"
```

---

### Task 6: Frontend — legalService + Notaries directory (gated) + route + menu

**Files:**
- Create: `frontend/src/services/legalService.js`, `frontend/src/pages/backoffice/legal/NotariesDirectory.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/pages/backoffice/components/BackofficeLayout.jsx`
- Test: `cd frontend && npm run build`

**Interfaces (Produces):** `legalService` (`listNotaries, createNotary, updateNotary, deleteNotary, listCases, createCase, getCase, updateCase, deleteCase, addTask, updateTask, deleteTask`); a gated Notaries directory page + `/backoffice/notaires` route + menu entry.

- [ ] **Step 1: Service**

Create `frontend/src/services/legalService.js`:
```javascript
import api from './api'

export const legalService = {
  listNotaries: async () => (await api.get('/backoffice/notaries')).data,
  createNotary: async (data) => (await api.post('/backoffice/notaries', data)).data,
  updateNotary: async (id, data) => (await api.put(`/backoffice/notaries/${id}`, data)).data,
  deleteNotary: async (id) => (await api.delete(`/backoffice/notaries/${id}`)).data,
  listCases: async (params = {}) => (await api.get('/backoffice/legal-cases', { params })).data,
  createCase: async (data) => (await api.post('/backoffice/legal-cases', data)).data,
  getCase: async (id) => (await api.get(`/backoffice/legal-cases/${id}`)).data,
  updateCase: async (id, data) => (await api.put(`/backoffice/legal-cases/${id}`, data)).data,
  deleteCase: async (id) => (await api.delete(`/backoffice/legal-cases/${id}`)).data,
  addTask: async (caseId, data) => (await api.post(`/backoffice/legal-cases/${caseId}/tasks`, data)).data,
  updateTask: async (id, data) => (await api.put(`/backoffice/legal-tasks/${id}`, data)).data,
  deleteTask: async (id) => (await api.delete(`/backoffice/legal-tasks/${id}`)).data,
}
```

- [ ] **Step 2: Notaries directory (gated)**

Create `frontend/src/pages/backoffice/legal/NotariesDirectory.jsx`:
```javascript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiTrash2 } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'

const EMPTY = { name: '', office: '', city: '', phone: '', email: '', license_number: '' }

function NotariesDirectory() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('notaries', () => legalService.listNotaries())
  const [form, setForm] = useState(EMPTY)
  const gated = error?.response?.status === 403

  const create = useMutation(() => legalService.createNotary(form), {
    onSuccess: () => { toast.success('Notaire ajouté'); setForm(EMPTY); qc.invalidateQueries('notaries') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const del = useMutation((id) => legalService.deleteNotary(id), {
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries('notaries') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (gated) {
    return (
      <div className="p-8 text-center">
        <FiLock className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Notaires</h1>
        <p className="text-gray-500 mt-2">L'annuaire des notaires est réservé aux plans Pro et Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-block mt-4">Voir les offres</Link>
      </div>
    )
  }
  if (isLoading) return <div className="p-8">Chargement…</div>
  const notaries = data?.notaries || []
  return (
    <div className="p-6 grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Annuaire des notaires</h1>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500"><tr>
              <th className="px-4 py-3">Nom</th><th>Étude</th><th>Ville</th><th>Contact</th><th></th></tr></thead>
            <tbody>
              {notaries.map((n) => (
                <tr key={n.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{n.name}</td><td>{n.office}</td><td>{n.city}</td>
                  <td>{n.phone}<div className="text-xs text-gray-400">{n.email}</div></td>
                  <td className="text-right"><button onClick={() => del.mutate(n.id)} className="text-red-600"><FiTrash2 /></button></td>
                </tr>
              ))}
              {notaries.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun notaire.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 h-fit">
        <h2 className="font-semibold text-gray-900 mb-3">Ajouter un notaire</h2>
        {['name', 'office', 'city', 'phone', 'email', 'license_number'].map((f) => (
          <input key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                 placeholder={{ name: 'Nom *', office: 'Étude', city: 'Ville', phone: 'Téléphone', email: 'Email', license_number: 'N° agrément' }[f]}
                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 text-gray-900" />
        ))}
        <button disabled={!form.name} onClick={() => create.mutate()} className="btn-primary w-full disabled:opacity-50">Ajouter</button>
      </div>
    </div>
  )
}
export default NotariesDirectory
```

- [ ] **Step 3: Route + menu**

In `frontend/src/App.jsx`, import `NotariesDirectory` and add inside the `/backoffice` group:
```javascript
          <Route path="notaires" element={<NotariesDirectory />} />
```
In `BackofficeLayout.jsx`, add a "Notaires" nav item (icon `FiBriefcase`, path `/backoffice/notaires`).

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/services/legalService.js frontend/src/pages/backoffice/legal/NotariesDirectory.jsx frontend/src/App.jsx frontend/src/pages/backoffice/components/BackofficeLayout.jsx
git commit -m "feat(juridique): service + annuaire notaires (gardé par le plan) + route/menu"
```

---

### Task 7: Frontend — Legal cases list + case detail (checklist)

**Files:**
- Create: `frontend/src/pages/backoffice/legal/LegalCasesList.jsx`, `frontend/src/pages/backoffice/legal/LegalCaseDetail.jsx`
- Modify: `frontend/src/App.jsx` (routes), `frontend/src/pages/backoffice/components/BackofficeLayout.jsx` (menu)
- Test: `cd frontend && npm run build`

- [ ] **Step 1: Cases list**

Create `frontend/src/pages/backoffice/legal/LegalCasesList.jsx`:
```javascript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'

const STATUS = { open: ['Ouvert', 'bg-blue-100 text-blue-700'], in_progress: ['En cours', 'bg-amber-100 text-amber-700'], closed: ['Clôturé', 'bg-green-100 text-green-700'] }

function LegalCasesList() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('legal-cases', () => legalService.listCases())
  const [title, setTitle] = useState('')
  const [type, setType] = useState('sale')
  const gated = error?.response?.status === 403

  const create = useMutation(() => legalService.createCase({ title: title || undefined, case_type: type }), {
    onSuccess: () => { toast.success('Dossier créé'); setTitle(''); qc.invalidateQueries('legal-cases') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (gated) {
    return (
      <div className="p-8 text-center">
        <FiLock className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Dossiers juridiques</h1>
        <p className="text-gray-500 mt-2">Réservé aux plans Pro et Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-block mt-4">Voir les offres</Link>
      </div>
    )
  }
  if (isLoading) return <div className="p-8">Chargement…</div>
  const cases = data?.cases || []
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Dossiers juridiques</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-2 items-center">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (optionnel)"
               className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 min-w-[200px]" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="sale">Vente</option><option value="rental">Location</option>
        </select>
        <button onClick={() => create.mutate()} className="btn-primary inline-flex items-center gap-2"><FiPlus /> Nouveau dossier</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr>
            <th className="px-4 py-3">Titre</th><th>Type</th><th>Notaire</th><th>Progression</th><th>Statut</th></tr></thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-3"><Link className="text-primary-600 font-medium" to={`/backoffice/juridique/${c.id}`}>{c.title}</Link></td>
                <td>{c.case_type === 'sale' ? 'Vente' : 'Location'}</td>
                <td>{c.notary?.name || '—'}</td>
                <td>{c.tasks_done}/{c.tasks_total}</td>
                <td><span className={`text-xs px-2 py-1 rounded-full ${STATUS[c.status]?.[1]}`}>{STATUS[c.status]?.[0] || c.status}</span></td>
              </tr>
            ))}
            {cases.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun dossier.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default LegalCasesList
```

- [ ] **Step 2: Case detail (checklist)**

Create `frontend/src/pages/backoffice/legal/LegalCaseDetail.jsx`:
```javascript
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiCheckCircle, FiCircle, FiTrash2, FiPlus } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'

const NEXT = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

function LegalCaseDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery(['legal-case', id], () => legalService.getCase(id))
  const { data: notariesData } = useQuery('notaries', () => legalService.listNotaries())
  const [newTask, setNewTask] = useState('')

  const refresh = () => qc.invalidateQueries(['legal-case', id])
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const toggle = useMutation(({ tid, status }) => legalService.updateTask(tid, { status }), { onSuccess: refresh, onError: onErr })
  const addTask = useMutation(() => legalService.addTask(id, { label: newTask }), { onSuccess: () => { setNewTask(''); refresh() }, onError: onErr })
  const delTask = useMutation((tid) => legalService.deleteTask(tid), { onSuccess: refresh, onError: onErr })
  const setStatus = useMutation((status) => legalService.updateCase(id, { status }), { onSuccess: refresh, onError: onErr })
  const setNotary = useMutation((notary_id) => legalService.updateCase(id, { notary_id: notary_id || null }), { onSuccess: refresh, onError: onErr })

  if (isLoading) return <div className="p-8">Chargement…</div>
  const c = data.case
  const pct = c.tasks_total ? Math.round((c.tasks_done / c.tasks_total) * 100) : 0
  const notaries = notariesData?.notaries || []

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">{c.title}</h1>
      <div className="flex flex-wrap items-center gap-3 mt-2 mb-4">
        <span className="text-sm text-gray-500">{c.case_type === 'sale' ? 'Vente' : 'Location'}</span>
        <select value={c.status} onChange={(e) => setStatus.mutate(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900">
          <option value="open">Ouvert</option><option value="in_progress">En cours</option><option value="closed">Clôturé</option>
        </select>
        <select value={c.notary_id || ''} onChange={(e) => setNotary.mutate(e.target.value ? Number(e.target.value) : '')} className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900">
          <option value="">Aucun notaire</option>
          {notaries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>
      <div className="mb-5">
        <div className="flex justify-between text-sm mb-1"><span>Progression</span><span>{c.tasks_done}/{c.tasks_total}</span></div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-primary-500" style={{ width: `${pct}%` }} /></div>
      </div>
      <ul className="space-y-2">
        {(c.tasks || []).map((t) => (
          <li key={t.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2">
            <button onClick={() => toggle.mutate({ tid: t.id, status: NEXT[t.status] })}>
              {t.status === 'done' ? <FiCheckCircle className="text-green-600" /> : <FiCircle className={t.status === 'in_progress' ? 'text-amber-500' : 'text-gray-300'} />}
            </button>
            <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.label}</span>
            <button onClick={() => delTask.mutate(t.id)} className="text-red-500"><FiTrash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-4">
        <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Ajouter une étape…"
               className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
        <button disabled={!newTask} onClick={() => addTask.mutate()} className="btn-secondary inline-flex items-center gap-1 disabled:opacity-50"><FiPlus /> Ajouter</button>
      </div>
    </div>
  )
}
export default LegalCaseDetail
```

- [ ] **Step 3: Routes + menu**

In `frontend/src/App.jsx`, import both and add inside the `/backoffice` group:
```javascript
          <Route path="juridique" element={<LegalCasesList />} />
          <Route path="juridique/:id" element={<LegalCaseDetail />} />
```
In `BackofficeLayout.jsx`, add a "Juridique" nav item (icon `FiShield`, path `/backoffice/juridique`).

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/backoffice/legal/LegalCasesList.jsx frontend/src/pages/backoffice/legal/LegalCaseDetail.jsx frontend/src/App.jsx frontend/src/pages/backoffice/components/BackofficeLayout.jsx
git commit -m "feat(juridique): liste des dossiers + détail avec checklist (coche, ajout, notaire, progression)"
```

---

### Task 8: Integration verification + build

**Files:**
- Create: `backend/scripts/verify_legal_all.py`
- Test: this task is the gate.

- [ ] **Step 1: Aggregate runner**

Create `backend/scripts/verify_legal_all.py`:
```python
"""python3 scripts/verify_legal_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_legal_models.py', 'verify_legal_seed.py', 'verify_notaries_api.py',
           'verify_legal_cases_api.py', 'verify_legal_tasks_api.py']
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Clean re-seed + run suite**

Run: `cd backend && source venv/bin/activate && python3 seed.py && python3 seed_backoffice.py && python3 scripts/verify_legal_all.py`
Expected: `ALL PASS`. (If `seed.py` errors on a non-empty DB from the known pre-existing `clear_data` bug, reset schema drop/create + `flask db upgrade` + reseed — do NOT modify seed.py. If a script reveals a real bug, fix it; don't paper over.)

- [ ] **Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, no errors.

- [ ] **Step 4: Manual UI smoke test (deferred to user)**

As a Pro agency admin: `/backoffice/notaires` → add a notary. `/backoffice/juridique` → New case (Vente) → checklist auto-generated → open it → tick steps (todo→in_progress→done), progress bar updates → assign the notary → add a custom step → delete a step. As a starter agency: both pages show the upgrade CTA (403).

- [ ] **Step 5: Commit**
```bash
git add backend/scripts/verify_legal_all.py
git commit -m "test(juridique): runner de vérification agrégé juridique & notaires"
```

---

## Self-Review notes (coverage vs spec)

- §3 models + migration → Task 1. §4 checklists → Task 2. §5 gating (`require_legal`) → Task 3, reused in 4/5; agency isolation on every route (notary/case/task) → Tasks 3/4/5. §6.1 notaries API → Task 3; §6.2 cases API → Task 4; §6.3 tasks API → Task 5. §7 front → Tasks 6 (notaries) + 7 (cases+checklist). §8 seed → Task 2. §9 tests → each task + Task 8.
- Type consistency: `legalService` methods ↔ backend routes; response envelopes `{notaries}`/`{notary}`/`{cases}`/`{case}`/`{task}` consumed by the pages; `case.tasks` present only when `include_tasks=True` (get/create/update return it; list returns summary only — the list page uses `tasks_done`/`tasks_total`, the detail page uses `tasks`).
- Security: `require_legal` on every route; task routes verify parent-case agency ownership (`_get_task_scoped`); `notary_id` assignment validated to the agency; no cross-agency access.
- Known MVP simplifications: legal case is created standalone or from a transaction/property id typed via the API (the list page's "new case" form offers title+type; linking to a specific transaction/property from the UI is a nice-to-have deferred); checklist templates are code constants.
- Verify scripts assume agency-member seed password `password123`; Task 2 seeds the flag + demo notaries.
```
