# Édition de contrats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Pro/Enterprise agencies instantiate contracts from templates (merge fields auto-filled), edit them in a WYSIWYG editor, finalize to a stored PDF (copied into the linked transaction's documents), and track status — with Enterprise able to manage custom templates.

**Architecture:** Two models (`ContractTemplate`, `Contract`) + a `has_contracts` plan flag; a `contract_merge` service (context builder + `{{placeholder}}` renderer) and an `html_sanitize` service (bleach); agency-scoped `/backoffice/contract-templates` + `/backoffice/contracts` routes gated by `has_contracts` (template CRUD gated to Enterprise); server-side HTML→PDF via `xhtml2pdf`. Frontend: `react-quill-new` editor + a Contracts section.

**Tech Stack:** Flask + SQLAlchemy + xhtml2pdf + bleach (backend); React 18 + react-router + react-query + react-quill-new (frontend). Spec: `docs/superpowers/specs/2026-07-23-contracts-design.md`.

## Global Constraints

- **JWT identity always `str(user.id)`**; agency scope from `require_auth` (`g.agency_id`, `g.current_user`) in `backend/app/api/v1/backoffice/dashboard.py`.
- **No pytest infra.** Verification = standalone scripts in `backend/scripts/`, `from seed import app`, `app.test_client()`. Print PASS/FAIL, non-zero exit on failure. Agency-member seed password is `password123`.
- **Frontend API via the shared `api` axios instance.**
- **Security:** ALL `body_html` saved (contracts AND custom templates) is sanitized server-side with `bleach` (allowlist tags `p,br,strong,b,em,i,u,s,ul,ol,li,h1,h2,h3,h4,blockquote,table,thead,tbody,tr,td,th,span,a`; attrs `a[href]` (http/https/mailto), `td/th[colspan,rowspan]`, `*[style]` limited to `text-align`; strip everything else — never `<script>`/`<style>`/`on*`/`javascript:`). Rendered HTML is already-sanitized.
- **Gating:** `require_contracts` (after `require_auth`) → 403 unless the agency's subscription plan has `has_contracts`. Custom-template CRUD additionally requires the plan slug == `enterprise` (`can_manage_templates`).
- **Agency isolation:** every template/contract query filtered by `g.agency_id`; global templates (`agency_id=None`) are read-only for everyone; no agency can read/mutate another's.
- **Status lifecycle:** `draft` → `finalized` → `signed`. Editing (`PUT`) allowed only in `draft`. Delete only in `draft`.
- **PDF:** server-side `xhtml2pdf` (pisa); store bytes under `uploads/documents/` and serve via an authenticated ownership-checked endpoint (mirror `backend/app/api/v1/selling.py` `/documents/<id>` + `uploads_dir`).
- **French UI copy**; money MAD. Backend venv: `cd backend && source venv/bin/activate`. Migration head via `flask db heads`.
- TDD each task; Conventional Commits French; NEVER AI attribution; commit ONLY the task's listed files (never stage unrelated changes, e.g. PropertyDetail.jsx).

---

### Task 1: Models (`ContractTemplate`, `Contract`) + `has_contracts` + migration

**Files:**
- Create: `backend/app/models/contract.py`
- Modify: `backend/app/models/subscription.py` (+`has_contracts`), `backend/app/models/__init__.py`
- Create: `backend/migrations/versions/d4e5f6a7b8c9_add_contracts.py`
- Test: `backend/scripts/verify_contract_models.py`

**Interfaces (Produces):**
- `ContractTemplate(id, agency_id, document_type, name, body_html, is_builtin, created_by, created_at, updated_at)` + `to_dict()`
- `Contract(id, agency_id, title, document_type, template_id, transaction_id, property_id, client_id, body_html, merge_context, status, pdf_url, created_by, finalized_at, signed_at, created_at, updated_at)` + `to_dict()`
- `SubscriptionPlan.has_contracts: bool` (+ in `to_dict()`)

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_contract_models.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import ContractTemplate, Contract, Agency, SubscriptionPlan

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    p = SubscriptionPlan.query.first()
    check(hasattr(p, 'has_contracts'), "plan.has_contracts exists")
    check('has_contracts' in p.to_dict(), "plan.to_dict has has_contracts")
    a = Agency.query.first()
    t = ContractTemplate(agency_id=None, document_type='mandate_sale', name='__t__',
                         body_html='<p>{{x}}</p>', is_builtin=True)
    db.session.add(t); db.session.commit()
    check(t.id and t.to_dict()['name'] == '__t__', "ContractTemplate row+to_dict")
    c = Contract(agency_id=a.id, title='__c__', document_type='mandate_sale',
                 body_html='<p>hi</p>', status='draft')
    db.session.add(c); db.session.commit()
    d = c.to_dict()
    check(c.id and d['status'] == 'draft', "Contract row+to_dict")
    db.session.delete(c); db.session.delete(t); db.session.commit()

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_contract_models.py`
Expected: FAIL (ImportError).

- [ ] **Step 3: Add `has_contracts` to the plan**

In `backend/app/models/subscription.py`, `SubscriptionPlan`, after `has_programs`/`max_programs`:
```python
    has_contracts = db.Column(db.Boolean, default=False)
```
In `to_dict()` add `'has_contracts': self.has_contracts,`.

- [ ] **Step 4: Create the models**

Create `backend/app/models/contract.py`:
```python
from datetime import datetime
from app import db


class ContractTemplate(db.Model):
    __tablename__ = 'contract_templates'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True, index=True)
    document_type = db.Column(db.String(30), nullable=False)  # mandate_sale|mandate_rental|compromise|lease|other
    name = db.Column(db.String(150), nullable=False)
    body_html = db.Column(db.Text, nullable=False)
    is_builtin = db.Column(db.Boolean, default=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_body=True):
        d = {
            'id': self.id, 'agency_id': self.agency_id, 'document_type': self.document_type,
            'name': self.name, 'is_builtin': self.is_builtin, 'is_global': self.agency_id is None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_body:
            d['body_html'] = self.body_html
        return d

    def __repr__(self):
        return f'<ContractTemplate {self.name}>'


class Contract(db.Model):
    __tablename__ = 'contracts'
    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    document_type = db.Column(db.String(30), nullable=False)
    template_id = db.Column(db.Integer, db.ForeignKey('contract_templates.id'), nullable=True)
    transaction_id = db.Column(db.Integer, db.ForeignKey('transactions.id'), nullable=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=True)
    body_html = db.Column(db.Text, nullable=False)
    merge_context = db.Column(db.JSON)
    status = db.Column(db.String(20), default='draft')  # draft|finalized|signed
    pdf_url = db.Column(db.String(255), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    finalized_at = db.Column(db.DateTime)
    signed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_body=True):
        d = {
            'id': self.id, 'agency_id': self.agency_id, 'title': self.title,
            'document_type': self.document_type, 'template_id': self.template_id,
            'transaction_id': self.transaction_id, 'property_id': self.property_id,
            'client_id': self.client_id, 'status': self.status, 'pdf_url': self.pdf_url,
            'finalized_at': self.finalized_at.isoformat() if self.finalized_at else None,
            'signed_at': self.signed_at.isoformat() if self.signed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_body:
            d['body_html'] = self.body_html
        return d

    def __repr__(self):
        return f'<Contract {self.title} {self.status}>'
```

- [ ] **Step 5: Register the models**

In `backend/app/models/__init__.py` add:
```python
from app.models.contract import ContractTemplate, Contract
```

- [ ] **Step 6: Migration**

Find head (`flask db heads`). Create `backend/migrations/versions/d4e5f6a7b8c9_add_contracts.py`:
```python
"""Add contracts + contract_templates + has_contracts plan flag."""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'REPLACE_WITH_CURRENT_HEAD'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.add_column(sa.Column('has_contracts', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.create_table('contract_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=True),
        sa.Column('document_type', sa.String(length=30), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('body_html', sa.Text(), nullable=False),
        sa.Column('is_builtin', sa.Boolean(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_contract_templates_agency_id', 'contract_templates', ['agency_id'])
    op.create_table('contracts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('document_type', sa.String(length=30), nullable=False),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('contract_templates.id'), nullable=True),
        sa.Column('transaction_id', sa.Integer(), sa.ForeignKey('transactions.id'), nullable=True),
        sa.Column('property_id', sa.Integer(), sa.ForeignKey('properties.id'), nullable=True),
        sa.Column('client_id', sa.Integer(), sa.ForeignKey('clients.id'), nullable=True),
        sa.Column('body_html', sa.Text(), nullable=False),
        sa.Column('merge_context', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('pdf_url', sa.String(length=255), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('finalized_at', sa.DateTime(), nullable=True),
        sa.Column('signed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_contracts_agency_id', 'contracts', ['agency_id'])

def downgrade():
    op.drop_index('ix_contracts_agency_id', table_name='contracts')
    op.drop_table('contracts')
    op.drop_index('ix_contract_templates_agency_id', table_name='contract_templates')
    op.drop_table('contract_templates')
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.drop_column('has_contracts')
```
Apply: `flask db upgrade`.

- [ ] **Step 7: Run — verify it passes**

Run: `python3 scripts/verify_contract_models.py`
Expected: all PASS.

- [ ] **Step 8: Commit**
```bash
git add backend/app/models/contract.py backend/app/models/subscription.py backend/app/models/__init__.py backend/migrations/versions/d4e5f6a7b8c9_add_contracts.py backend/scripts/verify_contract_models.py
git commit -m "feat(contrats): modèles Contract/ContractTemplate + flag plan has_contracts + migration"
```

---

### Task 2: Services — HTML sanitizer (bleach) + merge renderer

**Files:**
- Create: `backend/app/services/html_sanitize.py`
- Create: `backend/app/services/contract_merge.py`
- Modify: `backend/requirements.txt` (`bleach`, `xhtml2pdf`)
- Test: `backend/scripts/verify_contract_services.py`

**Interfaces (Produces):**
- `html_sanitize.sanitize_html(html: str) -> str`
- `contract_merge.build_context(agency, *, transaction=None, property=None, client=None) -> dict`
- `contract_merge.render(body_html: str, context: dict) -> str`

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_contract_services.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import Agency, Property, Client
from app.services.html_sanitize import sanitize_html
from app.services.contract_merge import build_context, render

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    dirty = '<p onclick="x()">hi</p><script>alert(1)</script><b>ok</b><img src=x onerror=alert(1)>'
    clean = sanitize_html(dirty)
    check('<script>' not in clean.lower() and 'onerror' not in clean.lower() and 'onclick' not in clean.lower(), "script/handlers stripped")
    check('<b>ok</b>' in clean or '<b>ok' in clean, "allowed tag kept")

    a = Agency.query.first()
    p = Property.query.filter_by(agency_id=a.id).first() or Property.query.first()
    ctx = build_context(a, property=p)
    check('agency_name' in ctx and 'property_price' in ctx, "context has keys")
    out = render('Bien: {{property_address}} — Prix: {{property_price}} — {{unknown_key}}', ctx)
    check('{{property_address}}' not in out and '{{unknown_key}}' not in out, "placeholders replaced, unknown -> empty")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_contract_services.py`
Expected: FAIL (no module).

- [ ] **Step 3: Add dependencies**

In `backend/requirements.txt` add:
```
bleach==6.1.0
xhtml2pdf==0.2.16
```
Install: `cd backend && source venv/bin/activate && pip install bleach==6.1.0 xhtml2pdf==0.2.16`.

- [ ] **Step 4: Implement the sanitizer**

Create `backend/app/services/html_sanitize.py`:
```python
"""Server-side sanitization of WYSIWYG HTML (prevents stored XSS)."""
import bleach

ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
                'h1', 'h2', 'h3', 'h4', 'blockquote', 'table', 'thead', 'tbody',
                'tr', 'td', 'th', 'span', 'a']
ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
    '*': ['style'],
}
ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']
try:
    from bleach.css_sanitizer import CSSSanitizer
    _CSS = CSSSanitizer(allowed_css_properties=['text-align'])
except Exception:  # older bleach
    _CSS = None


def sanitize_html(html):
    if not html:
        return ''
    kwargs = dict(tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES,
                  protocols=ALLOWED_PROTOCOLS, strip=True)
    if _CSS is not None:
        kwargs['css_sanitizer'] = _CSS
    return bleach.clean(html, **kwargs)
```

- [ ] **Step 5: Implement the merge renderer**

Create `backend/app/services/contract_merge.py`:
```python
"""Build merge context from domain data and substitute {{placeholders}}."""
import re
from datetime import datetime


def _money(v):
    try:
        return f"{float(v):,.2f} MAD".replace(',', ' ')
    except (TypeError, ValueError):
        return ''


def build_context(agency, *, transaction=None, property=None, client=None):
    prop = property
    cli = client
    agent_name = ''
    tx_ref = ''
    asking = ''
    comm_rate = ''
    comm_amount = ''
    if transaction is not None:
        prop = prop or getattr(transaction, 'property', None)
        cli = cli or getattr(transaction, 'client', None)
        agent = getattr(transaction, 'agent', None)
        agent_name = agent.full_name if agent else ''
        tx_ref = transaction.reference or ''
        asking = _money(transaction.asking_price)
        comm_rate = f"{float(transaction.commission_rate)}%" if transaction.commission_rate else ''
        comm_amount = _money(transaction.commission_amount)

    ctx = {
        'date': datetime.utcnow().strftime('%d/%m/%Y'),
        'agency_name': getattr(agency, 'name', '') or '',
        'agency_address': getattr(agency, 'address', '') or '',
        'agency_license': getattr(agency, 'license_number', '') or '',
        'agent_name': agent_name,
        'property_address': getattr(prop, 'address', '') or '' if prop else '',
        'property_city': getattr(prop, 'city', '') or '' if prop else '',
        'property_type': getattr(prop, 'property_type', '') or '' if prop else '',
        'property_price': _money(getattr(prop, 'price', None)) if prop else '',
        'property_surface': (f"{prop.surface} m²" if prop and prop.surface else ''),
        'property_rooms': str(getattr(prop, 'rooms', '') or '') if prop else '',
        'property_reference': getattr(prop, 'reference', '') or '' if prop else '',
        'client_name': (f"{cli.first_name} {cli.last_name}" if cli else ''),
        'client_email': getattr(cli, 'email', '') or '' if cli else '',
        'client_phone': getattr(cli, 'phone', '') or '' if cli else '',
        'transaction_reference': tx_ref,
        'asking_price': asking,
        'commission_rate': comm_rate,
        'commission_amount': comm_amount,
    }
    return ctx


_PLACEHOLDER = re.compile(r'\{\{\s*([a-zA-Z0-9_]+)\s*\}\}')


def render(body_html, context):
    if not body_html:
        return ''
    return _PLACEHOLDER.sub(lambda m: str(context.get(m.group(1), '')), body_html)
```

- [ ] **Step 6: Run — verify it passes**

Run: `python3 scripts/verify_contract_services.py`
Expected: all PASS.

- [ ] **Step 7: Commit**
```bash
git add backend/app/services/html_sanitize.py backend/app/services/contract_merge.py backend/requirements.txt backend/scripts/verify_contract_services.py
git commit -m "feat(contrats): services d'assainissement HTML (bleach) et de fusion des champs"
```

---

### Task 3: Seed built-in templates + plan flag

**Files:**
- Modify: `backend/seed_backoffice.py`
- Test: `backend/scripts/verify_contract_seed.py`

**Interfaces (Produces):** after seeding — 4 global `ContractTemplate` (`agency_id=None, is_builtin=True`) for `mandate_sale`, `mandate_rental`, `compromise`, `lease`; `pro` and `enterprise` plans have `has_contracts=True`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_contract_seed.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import ContractTemplate, SubscriptionPlan

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    for dt in ('mandate_sale', 'mandate_rental', 'compromise', 'lease'):
        t = ContractTemplate.query.filter_by(document_type=dt, agency_id=None, is_builtin=True).first()
        check(t is not None, f"builtin template {dt} seeded")
        check(t and '{{' in t.body_html, f"{dt} has merge placeholders")
    for slug in ('pro', 'enterprise'):
        p = SubscriptionPlan.query.filter_by(slug=slug).first()
        check(p and p.has_contracts is True, f"{slug} has_contracts")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_contract_seed.py`
Expected: FAIL.

- [ ] **Step 3: Seed in seed_backoffice.py**

In `backend/seed_backoffice.py`, add a function that upserts the 4 built-in templates and sets the plan flag, and call it (read the file to see where the seeding entrypoint runs, e.g. inside the main seed function after roles/permissions):
```python
def seed_contract_templates():
    from app.models import ContractTemplate, SubscriptionPlan
    BUILTINS = {
        'mandate_sale': ('Mandat de vente', """<h2>MANDAT DE VENTE</h2>
<p>Entre l'agence <strong>{{agency_name}}</strong>, sise {{agency_address}} (n° d'agrément {{agency_license}}),
et <strong>{{client_name}}</strong> (le Mandant), demeurant, tél. {{client_phone}}.</p>
<p>Le Mandant confie à l'agence la vente du bien situé <strong>{{property_address}}</strong>, {{property_city}}
(réf. {{property_reference}}), d'une surface de {{property_surface}}, au prix de <strong>{{property_price}}</strong>.</p>
<p>Commission d'agence : {{commission_rate}}.</p>
<p>Fait le {{date}}. Signatures :</p>"""),
        'mandate_rental': ('Mandat de location / gestion', """<h2>MANDAT DE LOCATION / GESTION</h2>
<p>Entre <strong>{{agency_name}}</strong>, {{agency_address}}, et <strong>{{client_name}}</strong> (le Mandant).</p>
<p>Objet : mise en location / gestion du bien {{property_address}}, {{property_city}} ({{property_type}},
{{property_surface}}).</p><p>Fait le {{date}}.</p>"""),
        'compromise': ('Compromis de vente', """<h2>COMPROMIS DE VENTE</h2>
<p>Entre le vendeur et l'acquéreur <strong>{{client_name}}</strong>, concernant le bien
<strong>{{property_address}}</strong>, {{property_city}} (réf. {{property_reference}}).</p>
<p>Prix de vente : <strong>{{property_price}}</strong>. Référence dossier : {{transaction_reference}}.</p>
<p>Fait le {{date}} à {{property_city}}.</p>"""),
        'lease': ('Contrat de bail (habitation)', """<h2>CONTRAT DE BAIL À USAGE D'HABITATION</h2>
<p>Entre le bailleur et le locataire <strong>{{client_name}}</strong> (tél. {{client_phone}}).</p>
<p>Bien loué : <strong>{{property_address}}</strong>, {{property_city}} ({{property_surface}}, {{property_rooms}} pièces).</p>
<p>Fait le {{date}}.</p>"""),
    }
    for dt, (name, body) in BUILTINS.items():
        existing = ContractTemplate.query.filter_by(document_type=dt, agency_id=None, is_builtin=True).first()
        if not existing:
            db.session.add(ContractTemplate(agency_id=None, document_type=dt, name=name,
                                            body_html=body, is_builtin=True))
    for slug in ('pro', 'enterprise'):
        plan = SubscriptionPlan.query.filter_by(slug=slug).first()
        if plan:
            plan.has_contracts = True
    db.session.commit()
    print("  Seeded contract templates + has_contracts flag")
```
Call `seed_contract_templates()` in the seed entrypoint (near where other seed steps run).

- [ ] **Step 4: Re-seed + verify**

Run: `python3 seed_backoffice.py && python3 scripts/verify_contract_seed.py`
Expected: all PASS. (If reseed needs a schema reset due to the known pre-existing `clear_data` bug, reset schema drop/create + `flask db upgrade` + reseed; do NOT modify seed.py.)

- [ ] **Step 5: Commit**
```bash
git add backend/seed_backoffice.py backend/scripts/verify_contract_seed.py
git commit -m "feat(contrats): seed des 4 modèles intégrés + flag has_contracts sur pro/enterprise"
```

---

### Task 4: API — templates (read all; Enterprise CRUD) + guards

**Files:**
- Create: `backend/app/api/v1/backoffice/contracts.py`
- Modify: `backend/app/api/v1/backoffice/__init__.py`
- Test: `backend/scripts/verify_contract_templates_api.py`

**Interfaces (Produces):**
- `require_contracts` decorator, `_agency()`, `_plan_slug(agency)`, `can_manage_templates(agency)`.
- `GET /backoffice/contract-templates` (globals + agency).
- `POST /backoffice/contract-templates` (Enterprise) · `PUT`/`DELETE /:id` (Enterprise, own only).

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_contract_templates_api.py`:
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
    agency.owner_id = admin.id
    # First as PRO: templates readable, but cannot create
    set_plan(agency, 'pro')
    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/contract-templates', headers=h)
    check(r.status_code == 200 and len(r.get_json().get('templates', [])) >= 4, "pro reads global templates")
    r = c.post('/api/v1/backoffice/contract-templates',
               json={'name': 'X', 'document_type': 'other', 'body_html': '<p>{{date}}</p>'}, headers=h)
    check(r.status_code == 403, "pro cannot create template (403)")
    # As ENTERPRISE: can create scoped to agency
    set_plan(agency, 'enterprise')
    r = c.post('/api/v1/backoffice/contract-templates',
               json={'name': 'Custom', 'document_type': 'other', 'body_html': '<p onclick=x>{{date}}</p>'}, headers=h)
    check(r.status_code in (200, 201), "enterprise creates template")
    body = r.get_json().get('template', {})
    check('onclick' not in (body.get('body_html') or ''), "template body sanitized")
    # gating: agency with NO has_contracts plan
    set_plan(agency, 'starter')
    r = c.get('/api/v1/backoffice/contract-templates', headers=h)
    check(r.status_code == 403, "starter (no has_contracts) -> 403")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_contract_templates_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement guards + template routes**

Create `backend/app/api/v1/backoffice/contracts.py`:
```python
from functools import wraps
from flask import jsonify, request, g
from app import db
from app.models import Agency, Subscription, ContractTemplate
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.services.html_sanitize import sanitize_html


def _agency():
    return Agency.query.get(g.agency_id) if g.agency_id else None


def _plan(agency):
    sub = Subscription.query.filter_by(agency_id=agency.id).first() if agency else None
    return sub.plan if sub else None


def require_contracts(f):
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        agency = _agency()
        plan = _plan(agency)
        if not agency or not plan or not plan.has_contracts:
            return jsonify({'error': "Fonction réservée aux plans Pro et Entreprise."}), 403
        return f(*args, **kwargs)
    return decorated


def can_manage_templates(agency):
    plan = _plan(agency)
    return bool(plan and plan.slug == 'enterprise')


@backoffice_bp.route('/contract-templates', methods=['GET'])
@require_contracts
def list_templates():
    agency = _agency()
    q = ContractTemplate.query.filter(
        (ContractTemplate.agency_id.is_(None)) | (ContractTemplate.agency_id == agency.id))
    return jsonify({'templates': [t.to_dict() for t in q.order_by(ContractTemplate.name).all()],
                    'can_manage_templates': can_manage_templates(agency)})


@backoffice_bp.route('/contract-templates', methods=['POST'])
@require_contracts
def create_template():
    agency = _agency()
    if not can_manage_templates(agency):
        return jsonify({'error': "Les modèles personnalisés sont réservés au plan Entreprise."}), 403
    data = request.get_json(silent=True) or {}
    if not data.get('name') or not data.get('document_type') or not data.get('body_html'):
        return jsonify({'error': 'name, document_type et body_html requis'}), 400
    t = ContractTemplate(agency_id=agency.id, document_type=data['document_type'],
                         name=data['name'], body_html=sanitize_html(data['body_html']),
                         is_builtin=False, created_by=g.current_user.id)
    db.session.add(t)
    db.session.commit()
    return jsonify({'template': t.to_dict()}), 201


@backoffice_bp.route('/contract-templates/<int:tid>', methods=['PUT'])
@require_contracts
def update_template(tid):
    agency = _agency()
    if not can_manage_templates(agency):
        return jsonify({'error': "Réservé au plan Entreprise."}), 403
    t = ContractTemplate.query.filter_by(id=tid, agency_id=agency.id).first()
    if not t:
        return jsonify({'error': 'Modèle introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'name' in data:
        t.name = data['name']
    if 'body_html' in data:
        t.body_html = sanitize_html(data['body_html'])
    if 'document_type' in data:
        t.document_type = data['document_type']
    db.session.commit()
    return jsonify({'template': t.to_dict()})


@backoffice_bp.route('/contract-templates/<int:tid>', methods=['DELETE'])
@require_contracts
def delete_template(tid):
    agency = _agency()
    if not can_manage_templates(agency):
        return jsonify({'error': "Réservé au plan Entreprise."}), 403
    t = ContractTemplate.query.filter_by(id=tid, agency_id=agency.id).first()
    if not t:
        return jsonify({'error': 'Modèle introuvable'}), 404
    db.session.delete(t)
    db.session.commit()
    return jsonify({'message': 'Modèle supprimé'})
```

In `backend/app/api/v1/backoffice/__init__.py`, add `from app.api.v1.backoffice import contracts`.

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_contract_templates_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/contracts.py backend/app/api/v1/backoffice/__init__.py backend/scripts/verify_contract_templates_api.py
git commit -m "feat(contrats): API modèles (lecture globale + CRUD Entreprise) + gardes has_contracts"
```

---

### Task 5: API — contracts core (list, instantiate, get, edit, delete)

**Files:**
- Modify: `backend/app/api/v1/backoffice/contracts.py`
- Test: `backend/scripts/verify_contracts_api.py`

**Interfaces (Produces):**
- `GET /backoffice/contracts?status=&transaction_id=`
- `POST /backoffice/contracts {template_id, title?, transaction_id?, property_id?, client_id?}` → instantiate (build context, render, sanitize) → draft
- `GET /backoffice/contracts/:id` · `PUT /:id {title?, body_html?}` (draft only, sanitized) · `DELETE /:id` (draft only)

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_contracts_api.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Property, Client, ContractTemplate

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
    prop = Property.query.filter_by(agency_id=agency.id).first() or Property.query.first()
    tpl = ContractTemplate.query.filter_by(document_type='mandate_sale', agency_id=None).first()

    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.post('/api/v1/backoffice/contracts',
               json={'template_id': tpl.id, 'title': 'Mandat test', 'property_id': prop.id}, headers=h)
    check(r.status_code in (200, 201), "create contract from template")
    ct = r.get_json().get('contract', {})
    cid = ct.get('id')
    check('{{' not in (ct.get('body_html') or ''), "placeholders rendered (no {{ left)")
    check(ct.get('status') == 'draft', "new contract is draft")
    # edit with malicious html
    r = c.put(f'/api/v1/backoffice/contracts/{cid}',
              json={'body_html': '<p>ok</p><script>alert(1)</script>'}, headers=h)
    check(r.status_code == 200 and '<script>' not in (r.get_json()['contract']['body_html'].lower()), "edit sanitized")
    # list
    r = c.get('/api/v1/backoffice/contracts', headers=h)
    check(r.status_code == 200 and any(x['id'] == cid for x in r.get_json().get('contracts', [])), "list contains contract")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_contracts_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement contract routes**

Append to `backend/app/api/v1/backoffice/contracts.py`:
```python
from app.models import Contract, Transaction, Property, Client
from app.services.contract_merge import build_context, render


def _get_contract(cid):
    return Contract.query.filter_by(id=cid, agency_id=g.agency_id).first()


@backoffice_bp.route('/contracts', methods=['GET'])
@require_contracts
def list_contracts():
    q = Contract.query.filter_by(agency_id=g.agency_id)
    if request.args.get('status'):
        q = q.filter(Contract.status == request.args.get('status'))
    if request.args.get('transaction_id', type=int):
        q = q.filter(Contract.transaction_id == request.args.get('transaction_id', type=int))
    rows = q.order_by(Contract.created_at.desc()).all()
    return jsonify({'contracts': [c.to_dict(include_body=False) for c in rows]})


@backoffice_bp.route('/contracts', methods=['POST'])
@require_contracts
def create_contract():
    agency = _agency()
    data = request.get_json(silent=True) or {}
    tpl = ContractTemplate.query.filter(
        ContractTemplate.id == data.get('template_id'),
        (ContractTemplate.agency_id.is_(None)) | (ContractTemplate.agency_id == agency.id)).first()
    if not tpl:
        return jsonify({'error': 'Modèle invalide'}), 400

    txn = prop = cli = None
    if data.get('transaction_id'):
        txn = Transaction.query.filter_by(id=data['transaction_id'], agency_id=agency.id).first()
    if data.get('property_id'):
        prop = Property.query.filter_by(id=data['property_id'], agency_id=agency.id).first()
    if data.get('client_id'):
        cli = Client.query.filter_by(id=data['client_id'], agency_id=agency.id).first()

    context = build_context(agency, transaction=txn, property=prop, client=cli)
    body = sanitize_html(render(tpl.body_html, context))
    contract = Contract(
        agency_id=agency.id, title=data.get('title') or tpl.name, document_type=tpl.document_type,
        template_id=tpl.id, transaction_id=(txn.id if txn else None),
        property_id=(prop.id if prop else None), client_id=(cli.id if cli else None),
        body_html=body, merge_context=context, status='draft', created_by=g.current_user.id)
    db.session.add(contract)
    db.session.commit()
    return jsonify({'contract': contract.to_dict()}), 201


@backoffice_bp.route('/contracts/<int:cid>', methods=['GET'])
@require_contracts
def get_contract(cid):
    c = _get_contract(cid)
    if not c:
        return jsonify({'error': 'Contrat introuvable'}), 404
    return jsonify({'contract': c.to_dict()})


@backoffice_bp.route('/contracts/<int:cid>', methods=['PUT'])
@require_contracts
def update_contract(cid):
    c = _get_contract(cid)
    if not c:
        return jsonify({'error': 'Contrat introuvable'}), 404
    if c.status != 'draft':
        return jsonify({'error': 'Un contrat finalisé ne peut plus être édité.'}), 409
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        c.title = data['title']
    if 'body_html' in data:
        c.body_html = sanitize_html(data['body_html'])
    db.session.commit()
    return jsonify({'contract': c.to_dict()})


@backoffice_bp.route('/contracts/<int:cid>', methods=['DELETE'])
@require_contracts
def delete_contract(cid):
    c = _get_contract(cid)
    if not c:
        return jsonify({'error': 'Contrat introuvable'}), 404
    if c.status != 'draft':
        return jsonify({'error': 'Seul un brouillon peut être supprimé.'}), 409
    db.session.delete(c)
    db.session.commit()
    return jsonify({'message': 'Contrat supprimé'})
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_contracts_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/contracts.py backend/scripts/verify_contracts_api.py
git commit -m "feat(contrats): API contrats (liste, instanciation, lecture, édition assainie, suppression)"
```

---

### Task 6: API — finalize (PDF) + TransactionDocument copy + mark-signed + download

**Files:**
- Modify: `backend/app/api/v1/backoffice/contracts.py`
- Test: `backend/scripts/verify_contract_finalize.py`

**Interfaces (Produces):**
- `POST /backoffice/contracts/:id/finalize` → renders PDF (xhtml2pdf), stores under `uploads/documents/`, sets `pdf_url`+`status='finalized'`+`finalized_at`; if `transaction_id`, creates a `TransactionDocument`.
- `POST /backoffice/contracts/:id/mark-signed` → `status='signed'`, `signed_at` (+ propagate to linked doc).
- `GET /backoffice/contracts/:id/pdf` → serves the stored PDF (agency ownership check).

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_contract_finalize.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, SubscriptionPlan, Subscription, Property, ContractTemplate

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
    prop = Property.query.filter_by(agency_id=agency.id).first() or Property.query.first()
    tpl = ContractTemplate.query.filter_by(document_type='mandate_sale', agency_id=None).first()

    c = app.test_client()
    tok = login(c, admin.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.post('/api/v1/backoffice/contracts', json={'template_id': tpl.id, 'property_id': prop.id}, headers=h)
    cid = r.get_json()['contract']['id']
    r = c.post(f'/api/v1/backoffice/contracts/{cid}/finalize', headers=h)
    check(r.status_code == 200, "finalize 200")
    ct = r.get_json()['contract']
    check(ct['status'] == 'finalized' and ct['pdf_url'], "status finalized + pdf_url")
    # cannot edit after finalize
    r = c.put(f'/api/v1/backoffice/contracts/{cid}', json={'body_html': '<p>x</p>'}, headers=h)
    check(r.status_code == 409, "edit after finalize -> 409")
    # download pdf
    r = c.get(f'/api/v1/backoffice/contracts/{cid}/pdf', headers=h)
    check(r.status_code == 200 and r.data[:4] == b'%PDF', "pdf download starts with %PDF")
    # mark signed
    r = c.post(f'/api/v1/backoffice/contracts/{cid}/mark-signed', headers=h)
    check(r.status_code == 200 and r.get_json()['contract']['status'] == 'signed', "mark signed")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_contract_finalize.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement finalize/pdf/mark-signed**

First read `backend/app/api/v1/selling.py` to reuse its `uploads_dir(...)` helper (or replicate the `UPLOAD_FOLDER`/documents path logic). Append to `backend/app/api/v1/backoffice/contracts.py`:
```python
import os
from datetime import datetime
from io import BytesIO
from flask import Response, current_app, send_from_directory
from app.models import TransactionDocument


def _documents_dir():
    uploads = current_app.config.get('UPLOAD_FOLDER',
                                     os.path.join(current_app.root_path, '..', 'uploads'))
    path = os.path.abspath(os.path.join(uploads, 'documents'))
    os.makedirs(path, exist_ok=True)
    return path


def _render_pdf_bytes(contract):
    from xhtml2pdf import pisa
    html = f"""<html><head><meta charset="utf-8"><style>
      body {{ font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #111; }}
      h1,h2,h3 {{ color: #1e3a5f; }} table {{ border-collapse: collapse; width: 100%; }}
      td,th {{ border: 1px solid #ccc; padding: 4px; }}
    </style></head><body>{contract.body_html}</body></html>"""
    buf = BytesIO()
    pisa.CreatePDF(src=html, dest=buf, encoding='utf-8')
    return buf.getvalue()


@backoffice_bp.route('/contracts/<int:cid>/finalize', methods=['POST'])
@require_contracts
def finalize_contract(cid):
    c = _get_contract(cid)
    if not c:
        return jsonify({'error': 'Contrat introuvable'}), 404
    if c.status == 'signed':
        return jsonify({'error': 'Contrat déjà signé.'}), 409
    pdf = _render_pdf_bytes(c)
    filename = f'contract_{c.id}_{int(c.created_at.timestamp()) if c.created_at else c.id}.pdf'
    with open(os.path.join(_documents_dir(), filename), 'wb') as fh:
        fh.write(pdf)
    c.pdf_url = filename
    c.status = 'finalized'
    c.finalized_at = datetime.utcnow()
    # Copy into the linked transaction's documents
    if c.transaction_id:
        db.session.add(TransactionDocument(
            transaction_id=c.transaction_id, document_type=c.document_type,
            name=c.title, file_url=filename, mime_type='application/pdf',
            requires_signature=True, signature_status='pending',
            uploaded_by_id=g.current_user.id))
    db.session.commit()
    return jsonify({'contract': c.to_dict()})


@backoffice_bp.route('/contracts/<int:cid>/mark-signed', methods=['POST'])
@require_contracts
def mark_signed(cid):
    c = _get_contract(cid)
    if not c:
        return jsonify({'error': 'Contrat introuvable'}), 404
    if c.status != 'finalized':
        return jsonify({'error': 'Le contrat doit être finalisé avant signature.'}), 409
    c.status = 'signed'
    c.signed_at = datetime.utcnow()
    if c.transaction_id and c.pdf_url:
        doc = TransactionDocument.query.filter_by(transaction_id=c.transaction_id, file_url=c.pdf_url).first()
        if doc:
            doc.signature_status = 'signed'
            doc.signed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'contract': c.to_dict()})


@backoffice_bp.route('/contracts/<int:cid>/pdf', methods=['GET'])
@require_contracts
def download_contract_pdf(cid):
    c = _get_contract(cid)
    if not c or not c.pdf_url:
        return jsonify({'error': 'PDF indisponible'}), 404
    return send_from_directory(_documents_dir(), c.pdf_url, mimetype='application/pdf',
                               as_attachment=False, download_name=f'{c.title}.pdf')
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_contract_finalize.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/contracts.py backend/scripts/verify_contract_finalize.py
git commit -m "feat(contrats): finalisation PDF (xhtml2pdf) + copie TransactionDocument + signature + téléchargement"
```

---

### Task 7: Frontend — deps, service, Contracts list (gated) + route + menu

**Files:**
- Modify: `frontend/package.json` (`react-quill-new`)
- Create: `frontend/src/services/contractService.js`, `frontend/src/pages/backoffice/contracts/ContractsList.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/pages/backoffice/components/BackofficeLayout.jsx`
- Test: `cd frontend && npm install && npm run build`

**Interfaces (Produces):** `contractService` (`listTemplates, createTemplate, updateTemplate, deleteTemplate, list, create, get, update, remove, finalize, markSigned, pdfUrl(id)`); a gated Contracts list page + `/backoffice/contrats` route + menu entry.

- [ ] **Step 1: Install the editor**

Run: `cd frontend && npm install react-quill-new`
Confirm it's in `package.json`.

- [ ] **Step 2: Service**

Create `frontend/src/services/contractService.js`:
```javascript
import api from './api'

export const contractService = {
  listTemplates: async () => (await api.get('/backoffice/contract-templates')).data,
  createTemplate: async (data) => (await api.post('/backoffice/contract-templates', data)).data,
  updateTemplate: async (id, data) => (await api.put(`/backoffice/contract-templates/${id}`, data)).data,
  deleteTemplate: async (id) => (await api.delete(`/backoffice/contract-templates/${id}`)).data,
  list: async (params = {}) => (await api.get('/backoffice/contracts', { params })).data,
  create: async (data) => (await api.post('/backoffice/contracts', data)).data,
  get: async (id) => (await api.get(`/backoffice/contracts/${id}`)).data,
  update: async (id, data) => (await api.put(`/backoffice/contracts/${id}`, data)).data,
  remove: async (id) => (await api.delete(`/backoffice/contracts/${id}`)).data,
  finalize: async (id) => (await api.post(`/backoffice/contracts/${id}/finalize`)).data,
  markSigned: async (id) => (await api.post(`/backoffice/contracts/${id}/mark-signed`)).data,
}
```

- [ ] **Step 3: Contracts list (with gating)**

Create `frontend/src/pages/backoffice/contracts/ContractsList.jsx`:
```javascript
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { FiFilePlus, FiLock } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'

const STATUS = { draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  finalized: ['Finalisé', 'bg-blue-100 text-blue-700'], signed: ['Signé', 'bg-green-100 text-green-700'] }

function ContractsList() {
  const { data, isLoading, error } = useQuery('contracts', () => contractService.list())
  const gated = error?.response?.status === 403
  if (gated) {
    return (
      <div className="p-8 text-center">
        <FiLock className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Contrats</h1>
        <p className="text-gray-500 mt-2">L'édition de contrats est réservée aux plans Pro et Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-block mt-4">Voir les offres</Link>
      </div>
    )
  }
  if (isLoading) return <div className="p-8">Chargement…</div>
  const rows = data?.contracts || []
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Contrats</h1>
        <Link to="/backoffice/contrats/nouveau" className="btn-primary inline-flex items-center gap-2">
          <FiFilePlus /> Nouveau contrat
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr><th className="px-4 py-3">Titre</th><th>Type</th><th>Statut</th><th>Créé le</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-3"><Link className="text-primary-600 font-medium" to={`/backoffice/contrats/${c.id}`}>{c.title}</Link></td>
                <td>{c.document_type}</td>
                <td><span className={`text-xs px-2 py-1 rounded-full ${STATUS[c.status]?.[1]}`}>{STATUS[c.status]?.[0] || c.status}</span></td>
                <td>{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : ''}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">Aucun contrat.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default ContractsList
```

- [ ] **Step 4: Route + menu (placeholders for create/editor added next task)**

In `frontend/src/App.jsx`, import `ContractsList` and add inside the `/backoffice` `BackofficeLayout` group:
```javascript
          <Route path="contrats" element={<ContractsList />} />
```
In `BackofficeLayout.jsx`, add a "Contrats" nav item (icon `FiFileText`, path `/backoffice/contrats`).

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 6: Commit**
```bash
git add frontend/package.json frontend/package-lock.json frontend/src/services/contractService.js frontend/src/pages/backoffice/contracts/ContractsList.jsx frontend/src/App.jsx frontend/src/pages/backoffice/components/BackofficeLayout.jsx
git commit -m "feat(contrats): service + liste des contrats (gardée par le plan) + route/menu"
```

---

### Task 8: Frontend — ContractCreate + ContractEditor (WYSIWYG)

**Files:**
- Create: `frontend/src/pages/backoffice/contracts/ContractCreate.jsx`, `frontend/src/pages/backoffice/contracts/ContractEditor.jsx`
- Modify: `frontend/src/App.jsx` (routes)
- Test: `cd frontend && npm run build`

- [ ] **Step 1: Create page (choose template + link)**

Create `frontend/src/pages/backoffice/contracts/ContractCreate.jsx`:
```javascript
import { useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { contractService } from '../../../services/contractService'
import api from '../../../services/api'

function ContractCreate() {
  const navigate = useNavigate()
  const { data: tplData } = useQuery('contract-templates', () => contractService.listTemplates())
  const { data: propsData } = useQuery('bo-properties-min', async () => (await api.get('/backoffice/biens?per_page=100')).data)
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [clientId, setClientId] = useState('')

  const create = useMutation(() => contractService.create({
    template_id: Number(templateId), title: title || undefined,
    property_id: propertyId ? Number(propertyId) : undefined,
    client_id: clientId ? Number(clientId) : undefined,
  }), {
    onSuccess: (res) => navigate(`/backoffice/contrats/${res.contract.id}`),
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const templates = tplData?.templates || []
  const properties = propsData?.properties || propsData?.items || []
  const clients = clientsData?.clients || clientsData?.items || []

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Nouveau contrat</h1>
      <div className="space-y-4 bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm">Modèle
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
            <option value="">Choisir un modèle…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_global ? '' : ' (custom)'}</option>)}
          </select>
        </label>
        <label className="block text-sm">Titre (optionnel)
          <input value={title} onChange={(e) => setTitle(e.target.value)}
                 className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900" />
        </label>
        <label className="block text-sm">Bien (optionnel)
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
            <option value="">—</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title || p.reference}</option>)}
          </select>
        </label>
        <label className="block text-sm">Client (optionnel)
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
        </label>
        <button disabled={!templateId} onClick={() => create.mutate()} className="btn-primary disabled:opacity-50">Créer</button>
      </div>
    </div>
  )
}
export default ContractCreate
```
Note: confirm the backoffice properties/clients list routes + response shapes (read `backend/app/api/v1/backoffice/properties.py`/`clients.py`); adjust the `properties`/`clients` extraction and query URLs to match the real endpoints.

- [ ] **Step 2: Editor page (react-quill-new)**

Create `frontend/src/pages/backoffice/contracts/ContractEditor.jsx`:
```javascript
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { contractService } from '../../../services/contractService'

const STATUS = { draft: 'Brouillon', finalized: 'Finalisé', signed: 'Signé' }

function ContractEditor() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery(['contract', id], () => contractService.get(id))
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (data?.contract) { setHtml(data.contract.body_html || ''); setTitle(data.contract.title || '') }
  }, [data])

  const contract = data?.contract
  const readOnly = contract && contract.status !== 'draft'
  const refresh = () => qc.invalidateQueries(['contract', id])
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')

  const save = useMutation(() => contractService.update(id, { title, body_html: html }),
    { onSuccess: () => { toast.success('Enregistré'); refresh() }, onError: onErr })
  const finalize = useMutation(() => contractService.finalize(id),
    { onSuccess: () => { toast.success('Contrat finalisé'); refresh() }, onError: onErr })
  const sign = useMutation(() => contractService.markSigned(id),
    { onSuccess: () => { toast.success('Marqué signé'); refresh() }, onError: onErr })

  if (isLoading) return <div className="p-8">Chargement…</div>

  const downloadPdf = async () => {
    const res = await fetch(`/api/v1/backoffice/contracts/${id}/pdf`, {
      headers: { Authorization: `Bearer ${JSON.parse(localStorage.getItem('auth-storage'))?.state?.accessToken}` },
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${title}.pdf`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly}
                 className="text-xl font-bold text-gray-900 border-b border-transparent focus:border-gray-300 outline-none" />
          <span className="ml-3 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{STATUS[contract.status]}</span>
        </div>
        <div className="flex gap-2">
          {!readOnly && <button onClick={() => save.mutate()} className="btn-secondary text-sm">Enregistrer</button>}
          {contract.status === 'draft' && <button onClick={() => finalize.mutate()} className="btn-primary text-sm">Finaliser</button>}
          {contract.status !== 'draft' && <button onClick={downloadPdf} className="btn-secondary text-sm">Télécharger PDF</button>}
          {contract.status === 'finalized' && <button onClick={() => sign.mutate()} className="btn-primary text-sm">Marquer signé</button>}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200">
        <ReactQuill theme="snow" value={html} onChange={setHtml} readOnly={readOnly} />
      </div>
      {readOnly && <p className="text-xs text-gray-400 mt-2">Contrat {STATUS[contract.status].toLowerCase()} — édition verrouillée.</p>}
    </div>
  )
}
export default ContractEditor
```

- [ ] **Step 3: Routes**

In `frontend/src/App.jsx`, import both and add inside the `/backoffice` group (before the `contrats` index route or after it):
```javascript
          <Route path="contrats/nouveau" element={<ContractCreate />} />
          <Route path="contrats/:id" element={<ContractEditor />} />
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/backoffice/contracts/ContractCreate.jsx frontend/src/pages/backoffice/contracts/ContractEditor.jsx frontend/src/App.jsx
git commit -m "feat(contrats): création + éditeur WYSIWYG (sauver/finaliser/PDF/signer)"
```

---

### Task 9: Frontend — TemplatesManager (Enterprise)

**Files:**
- Create: `frontend/src/pages/backoffice/contracts/TemplatesManager.jsx`
- Modify: `frontend/src/App.jsx` (route), `frontend/src/pages/backoffice/contracts/ContractsList.jsx` (link to templates when allowed)
- Test: `cd frontend && npm run build`

- [ ] **Step 1: Templates manager**

Create `frontend/src/pages/backoffice/contracts/TemplatesManager.jsx`:
```javascript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { contractService } from '../../../services/contractService'

const TYPES = [['mandate_sale', 'Mandat de vente'], ['mandate_rental', 'Mandat location/gestion'],
  ['compromise', 'Compromis'], ['lease', 'Bail'], ['other', 'Autre']]
const FIELDS = ['agency_name', 'agent_name', 'client_name', 'property_address', 'property_price',
  'property_surface', 'commission_rate', 'date']

function TemplatesManager() {
  const qc = useQueryClient()
  const { data } = useQuery('contract-templates', () => contractService.listTemplates())
  const canManage = data?.can_manage_templates
  const [name, setName] = useState('')
  const [docType, setDocType] = useState('other')
  const [body, setBody] = useState('')

  const create = useMutation(() => contractService.createTemplate({ name, document_type: docType, body_html: body }), {
    onSuccess: () => { toast.success('Modèle créé'); setName(''); setBody(''); qc.invalidateQueries('contract-templates') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const del = useMutation((id) => contractService.deleteTemplate(id), {
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries('contract-templates') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (data && !canManage) {
    return <div className="p-8 text-center text-gray-500">Les modèles personnalisés sont réservés au plan Entreprise.</div>
  }
  const custom = (data?.templates || []).filter((t) => !t.is_global)

  return (
    <div className="p-6 grid lg:grid-cols-2 gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Modèles personnalisés</h1>
        <ul className="space-y-2">
          {custom.map((t) => (
            <li key={t.id} className="flex justify-between items-center bg-white border border-gray-200 rounded-lg px-4 py-2">
              <span>{t.name} <span className="text-xs text-gray-400">({t.document_type})</span></span>
              <button onClick={() => del.mutate(t.id)} className="text-red-600 text-sm">Supprimer</button>
            </li>
          ))}
          {custom.length === 0 && <li className="text-gray-400 text-sm">Aucun modèle personnalisé.</li>}
        </ul>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Nouveau modèle</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du modèle"
               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 text-gray-900" />
        <select value={docType} onChange={(e) => setDocType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 text-gray-900">
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="text-xs text-gray-500 mb-2">Champs : {FIELDS.map((f) => `{{${f}}}`).join(' · ')}</div>
        <ReactQuill theme="snow" value={body} onChange={setBody} />
        <button disabled={!name || !body} onClick={() => create.mutate()} className="btn-primary mt-3 disabled:opacity-50">Créer le modèle</button>
      </div>
    </div>
  )
}
export default TemplatesManager
```

- [ ] **Step 2: Route + conditional link**

In `frontend/src/App.jsx`, import + add route inside `/backoffice`:
```javascript
          <Route path="contrats/modeles" element={<TemplatesManager />} />
```
In `ContractsList.jsx`, add (next to "Nouveau contrat") a link to `/backoffice/contrats/modeles` shown only when `data?.can_manage_templates` (the list endpoint doesn't return that; instead fetch it via `contractService.listTemplates()` in the list, or just always show the link and let the page gate itself). Simplest: always render a small "Modèles" link; the TemplatesManager page self-gates for non-Enterprise. Add:
```javascript
<Link to="/backoffice/contrats/modeles" className="btn-secondary inline-flex items-center gap-2 ml-2">Modèles</Link>
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/backoffice/contracts/TemplatesManager.jsx frontend/src/App.jsx frontend/src/pages/backoffice/contracts/ContractsList.jsx
git commit -m "feat(contrats): gestionnaire de modèles personnalisés (Entreprise)"
```

---

### Task 10: Integration verification + build

**Files:**
- Create: `backend/scripts/verify_contracts_all.py`
- Test: this task is the gate.

- [ ] **Step 1: Aggregate runner**

Create `backend/scripts/verify_contracts_all.py`:
```python
"""python3 scripts/verify_contracts_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_contract_models.py', 'verify_contract_services.py', 'verify_contract_seed.py',
           'verify_contract_templates_api.py', 'verify_contracts_api.py', 'verify_contract_finalize.py']
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

Run: `cd backend && source venv/bin/activate && python3 seed.py && python3 seed_backoffice.py && python3 scripts/verify_contracts_all.py`
Expected: `ALL PASS`. (If `seed.py` errors on a non-empty DB from the known pre-existing `clear_data` bug, reset schema drop/create + `flask db upgrade` + reseed — do NOT modify seed.py. If a script reveals a real bug, fix it; don't paper over.)

- [ ] **Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, no errors.

- [ ] **Step 4: Manual UI smoke test (deferred to user)**

As a Pro agency admin: `/backoffice/contrats` → New contract → choose "Mandat de vente" + a property → editor shows filled text → edit → Finalize → Download PDF (opens a real PDF) → Mark signed. As Enterprise: `/backoffice/contrats/modeles` → create a custom template. As a starter/free agency: `/backoffice/contrats` shows the upgrade CTA (403-gated).

- [ ] **Step 5: Commit**
```bash
git add backend/scripts/verify_contracts_all.py
git commit -m "test(contrats): runner de vérification agrégé contrats"
```

---

## Self-Review notes (coverage vs spec)

- §3 sanitize → Task 2 (`html_sanitize`), applied on every save (Tasks 4/5). §4 models + migration → Task 1. §5 merge → Task 2. §6 gating (`require_contracts`, `can_manage_templates`, agency isolation) → Task 4, reused in 5/6. §7.1 templates API → Task 4; §7.2 contracts API → Tasks 5 (core) + 6 (finalize/pdf/mark-signed). §8 front → Tasks 7 (list+service+gating), 8 (create+editor), 9 (templates manager). §9 seed → Task 3. §10 tests → each task + Task 10.
- Type consistency: `contractService` methods ↔ backend routes; `{contract}`/`{template}`/`{templates}`/`{contracts}` response envelopes consumed by the pages; `status` values `draft/finalized/signed` consistent front↔back; `document_type` enum consistent.
- Security: bleach sanitize on template create/update (Task 4) AND contract instantiate/edit (Task 5). PDF served through an agency-ownership-checked endpoint (Task 6). Gating enforced by `require_contracts` on every route.
- Known MVP simplifications: merge-field insertion in the contract editor is manual text (the body is already rendered); `xhtml2pdf` renders a HTML/CSS subset (fine for text contracts); the ContractCreate property/client selectors depend on the real backoffice list endpoints (Task 8 note says verify + adapt).
- Verify scripts assume agency-member seed password `password123` and that a Property/Client exist for the agency; Task 3 seeds templates + flag.
```
