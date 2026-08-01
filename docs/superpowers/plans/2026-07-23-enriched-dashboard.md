# Dashboard enrichi (tour de contrôle + hub Analyses) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a configurable `/dashboard` control tower (summary widgets from everywhere, one call) and a deep `/backoffice/analyses` hub (Finance / Market / Pipeline / Team) powered by Recharts, with role-scoped visibility.

**Architecture:** One backend `analytics` module (agency-scoped) exposes per-module endpoints each returning `{summary, detail}`; an `overview` endpoint aggregates the `summary` blocks + listings/leads/seats/alerts for the tower. A shared `analytics_scope` service enforces agent-vs-agency visibility. Frontend adds Recharts + a small chart kit; the hub renders `detail`, the tower renders `overview` with a per-user widget layout persisted in `User.dashboard_config`.

**Tech Stack:** Flask + SQLAlchemy + flask-jwt-extended (backend); React + react-router + react-query + Recharts + Tailwind (frontend). Spec: `docs/superpowers/specs/2026-07-23-enriched-dashboard-design.md`.

## Global Constraints

- **JWT identity always `str(user.id)`**; agency scope from `require_auth` (`g.agency_id`, `g.current_user`) in `backend/app/api/v1/backoffice/dashboard.py`.
- **No pytest infra.** Verification = standalone scripts in `backend/scripts/`, `from seed import app`, `app.test_client()`. Print PASS/FAIL, non-zero exit on failure.
- **Frontend API via the shared `api` axios instance**; when building any chart, FIRST load the **dataviz** skill for palette/altitude/accessibility (light+dark).
- **Role visibility:** `analytics_scope(user, agency) -> {'all': bool, 'agent_id': int|None}`. `all=True` if `user.id == agency.owner_id` OR a user role has permission `analytics.view_all`. Else `all=False, agent_id=user.id`. Every endpoint applies it.
- **Transaction facts:** `status ∈ {active, won, lost, on_hold}`; realized revenue = Σ `commission_amount` where `status='won'`. `stage` uses SALE_STAGES ids `[contact, visit, offer, negotiation, compromise, final_act]` / RENT_STAGES `[contact, visit, application, verification, lease, move_in]`. Date funnel columns: `contact_date, visit_date, offer_date, acceptance_date, compromise_date, closing_date, expected_closing_date, closed_at`.
- **Pipeline probability by stage** (single constant, backend): `{contact:0.10, visit:0.40, offer:0.60, negotiation:0.70, application:0.40, verification:0.55, compromise:0.85, lease:0.85, final_act:0.95, move_in:0.95}`; `status=='won'→1.0`, `status=='lost'→0.0`. Weighted pipeline = Σ over `status='active'` deals of `commission_estimate × prob(stage)`, where `commission_estimate = commission_amount or (asking_price × commission_rate/100)`.
- **`range` param:** `30d|90d|12m|ytd` (default `12m`) → a start datetime; helper `_range_start(range)`.
- **Empty data:** every endpoint returns zeros/empty arrays cleanly on an empty DB (never 500).
- **French UI copy.** Money is MAD. Backend venv: `cd backend && source venv/bin/activate`. Migration head chain ends at the current head (find via `flask db heads`).
- TDD each task; Conventional Commits in French; NEVER AI attribution; commit ONLY the task's listed files (unrelated tree changes — e.g. PropertyDetail.jsx — never staged).

---

### Task 1: Backend foundations — `dashboard_config`, scope service, analytics blueprint, permission

**Files:**
- Modify: `backend/app/models/user.py` (+ `dashboard_config`)
- Create: `backend/migrations/versions/c3d4e5f6a7b8_add_user_dashboard_config.py`
- Create: `backend/app/services/analytics_scope.py`
- Create: `backend/app/api/v1/backoffice/analytics.py` (blueprint module + `_range_start`, `STAGE_PROBABILITY`, a `/analytics/ping` health route to prove mounting)
- Modify: `backend/app/api/v1/backoffice/__init__.py` (import `analytics`)
- Modify: `backend/seed_backoffice.py` (seed `analytics.view_all` on admin+manager)
- Test: `backend/scripts/verify_analytics_foundation.py`

**Interfaces (Produces):**
- `User.dashboard_config: dict|None` (+ in `to_dict()` as `dashboard_config`)
- `analytics_scope.analytics_scope(user, agency) -> {'all': bool, 'agent_id': int|None}`
- `analytics.py`: `_range_start(range_str) -> datetime`, `STAGE_PROBABILITY: dict`, `stage_probability(txn) -> float`, and `GET /backoffice/analytics/ping`
- Permission `analytics.view_all` held by `admin` and `manager` roles.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_analytics_foundation.py`:
```python
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
```
(Verify the agency-member seed password by reading `seed_backoffice.py`; earlier bricks found `password123`.)

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_analytics_foundation.py`
Expected: FAIL (no `dashboard_config` / no module).

- [ ] **Step 3: Add `dashboard_config` to User**

In `backend/app/models/user.py`, add column (near other columns):
```python
    dashboard_config = db.Column(db.JSON, nullable=True)
```
In `to_dict()` append: `'dashboard_config': self.dashboard_config,`.

- [ ] **Step 4: Migration**

Find head (`flask db heads`). Create `backend/migrations/versions/c3d4e5f6a7b8_add_user_dashboard_config.py`:
```python
"""Add dashboard_config JSON to users."""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'REPLACE_WITH_CURRENT_HEAD'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('users', schema=None) as b:
        b.add_column(sa.Column('dashboard_config', sa.JSON(), nullable=True))

def downgrade():
    with op.batch_alter_table('users', schema=None) as b:
        b.drop_column('dashboard_config')
```
Apply: `flask db upgrade`.

- [ ] **Step 5: Scope service**

Create `backend/app/services/analytics_scope.py`:
```python
"""Agent-vs-agency visibility for analytics."""

def analytics_scope(user, agency):
    """Return {'all': bool, 'agent_id': int|None}. Agency-wide if owner or analytics.view_all."""
    if agency is not None and agency.owner_id and user.id == agency.owner_id:
        return {'all': True, 'agent_id': None}
    if any(r.has_permission('analytics.view_all') for r in user.roles):
        return {'all': True, 'agent_id': None}
    return {'all': False, 'agent_id': user.id}
```

- [ ] **Step 6: Analytics blueprint skeleton**

Create `backend/app/api/v1/backoffice/analytics.py`:
```python
from datetime import datetime, timedelta
from flask import jsonify, request, g
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Agency
from app.services.analytics_scope import analytics_scope

STAGE_PROBABILITY = {
    'contact': 0.10, 'visit': 0.40, 'offer': 0.60, 'negotiation': 0.70,
    'application': 0.40, 'verification': 0.55, 'compromise': 0.85,
    'lease': 0.85, 'final_act': 0.95, 'move_in': 0.95,
}


def _range_start(range_str):
    now = datetime.utcnow()
    if range_str == '30d':
        return now - timedelta(days=30)
    if range_str == '90d':
        return now - timedelta(days=90)
    if range_str == 'ytd':
        return datetime(now.year, 1, 1)
    return now - timedelta(days=365)  # 12m default


def stage_probability(txn):
    if txn.status == 'won':
        return 1.0
    if txn.status == 'lost':
        return 0.0
    return STAGE_PROBABILITY.get(txn.stage, 0.2)


def current_scope():
    """(agency, scope) for the authed user, or (None, None)."""
    agency = Agency.query.get(g.agency_id) if g.agency_id else None
    if not agency:
        return None, None
    return agency, analytics_scope(g.current_user, agency)


@backoffice_bp.route('/analytics/ping', methods=['GET'])
@require_auth
def analytics_ping():
    agency, scope = current_scope()
    return jsonify({'ok': True, 'scope': scope})
```

In `backend/app/api/v1/backoffice/__init__.py`, add `from app.api.v1.backoffice import analytics` to the imports.

- [ ] **Step 7: Seed the permission**

In `backend/seed_backoffice.py`, ensure a `Permission(slug='analytics.view_all', module='analytics', name='Voir toutes les analyses')` is created and included in the permission set assigned to `admin` and `manager` roles (mirror how `team.manage` was added in brick 2). Read the file to match the structure.

- [ ] **Step 8: Re-seed + run verification**

Run: `python3 seed_backoffice.py && python3 scripts/verify_analytics_foundation.py`
Expected: all PASS. (If `seed.py`/reseed is needed and hits the known pre-existing `clear_data` bug, reset schema drop/create + `flask db upgrade` + reseed; do NOT modify seed.py.)

- [ ] **Step 9: Commit**
```bash
git add backend/app/models/user.py backend/migrations/versions/c3d4e5f6a7b8_add_user_dashboard_config.py backend/app/services/analytics_scope.py backend/app/api/v1/backoffice/analytics.py backend/app/api/v1/backoffice/__init__.py backend/seed_backoffice.py backend/scripts/verify_analytics_foundation.py
git commit -m "feat(dashboard): fondations analytics (scope rôle, blueprint, dashboard_config, permission)"
```

---

### Task 2: Financial analytics endpoint

**Files:**
- Modify: `backend/app/api/v1/backoffice/analytics.py`
- Test: `backend/scripts/verify_analytics_financial.py`

**Interfaces (Produces):** `GET /backoffice/analytics/financial?range=` → `{summary:{revenue_realized, revenue_pipeline_weighted, deals_won, deals_lost, avg_deal_size, avg_sales_cycle_days}, detail:{revenue_trend[], commission_by_agent[], commission_by_month[], win_loss_by_month[], deals_by_type[]}}`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_analytics_financial.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User, Agency

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    ag = Agency.query.get(u.agency_id)
    if not ag.owner_id:
        ag.owner_id = u.id
    from app import db; db.session.commit()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/financial?range=12m', headers=h)
    check(r.status_code == 200, "financial 200")
    b = r.get_json()
    for k in ('revenue_realized','revenue_pipeline_weighted','deals_won','deals_lost','avg_deal_size','avg_sales_cycle_days'):
        check(k in b.get('summary', {}), f"summary has {k}")
    for k in ('revenue_trend','commission_by_agent','commission_by_month','win_loss_by_month','deals_by_type'):
        check(k in b.get('detail', {}), f"detail has {k}")
    check(b['summary']['revenue_realized'] >= 0, "revenue_realized non-negative")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_analytics_financial.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement the endpoint**

Append to `backend/app/api/v1/backoffice/analytics.py`:
```python
from sqlalchemy import func
from app import db
from app.models import Transaction, User


def _txn_base(agency, scope, start):
    q = Transaction.query.filter(Transaction.agency_id == agency.id)
    if not scope['all']:
        q = q.filter(Transaction.agent_id == scope['agent_id'])
    return q


def _commission_estimate(t):
    if t.commission_amount:
        return float(t.commission_amount)
    if t.asking_price and t.commission_rate:
        return float(t.asking_price) * float(t.commission_rate) / 100.0
    return 0.0


@backoffice_bp.route('/analytics/financial', methods=['GET'])
@require_auth
def analytics_financial():
    agency, scope = current_scope()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    rng = request.args.get('range', '12m')
    start = _range_start(rng)

    base = _txn_base(agency, scope, start)
    won = base.filter(Transaction.status == 'won', Transaction.closing_date >= start).all()
    lost = base.filter(Transaction.status == 'lost').all()
    open_deals = base.filter(Transaction.status == 'active').all()

    revenue_realized = sum(float(t.commission_amount or 0) for t in won)
    revenue_weighted = sum(_commission_estimate(t) * stage_probability(t) for t in open_deals)
    final_prices = [float(t.final_price) for t in won if t.final_price]
    avg_deal = round(sum(final_prices) / len(final_prices), 2) if final_prices else 0
    cycles = [(t.closing_date - t.contact_date).days for t in won if t.closing_date and t.contact_date]
    avg_cycle = round(sum(cycles) / len(cycles), 1) if cycles else 0

    # Monthly series (last 12 months)
    def month_key(dt):
        return dt.strftime('%Y-%m')
    months = {}
    for t in won:
        if t.closing_date:
            months.setdefault(month_key(t.closing_date), 0.0)
            months[month_key(t.closing_date)] += float(t.commission_amount or 0)
    revenue_trend = [{'month': k, 'realized': round(v, 2)} for k, v in sorted(months.items())]

    # Commission by agent (agency view) — join agent names
    comm_by_agent = {}
    for t in won:
        comm_by_agent.setdefault(t.agent_id, 0.0)
        comm_by_agent[t.agent_id] += float(t.commission_amount or 0)
    agent_rows = []
    for aid, amount in comm_by_agent.items():
        agent = User.query.get(aid)
        agent_rows.append({'agent_id': aid, 'agent': agent.full_name if agent else '—', 'commission': round(amount, 2)})
    agent_rows.sort(key=lambda r: r['commission'], reverse=True)

    win_loss = {}
    for t in won:
        if t.closing_date:
            win_loss.setdefault(month_key(t.closing_date), {'won': 0, 'lost': 0})
            win_loss[month_key(t.closing_date)]['won'] += 1
    for t in lost:
        d = t.closed_at or t.updated_at
        if d:
            win_loss.setdefault(month_key(d), {'won': 0, 'lost': 0})
            win_loss[month_key(d)]['lost'] += 1
    win_loss_by_month = [{'month': k, **v} for k, v in sorted(win_loss.items())]

    by_type = {}
    for t in won:
        by_type.setdefault(t.transaction_type or 'autre', 0.0)
        by_type[t.transaction_type or 'autre'] += float(t.commission_amount or 0)
    deals_by_type = [{'type': k, 'commission': round(v, 2)} for k, v in by_type.items()]

    return jsonify({
        'summary': {
            'revenue_realized': round(revenue_realized, 2),
            'revenue_pipeline_weighted': round(revenue_weighted, 2),
            'deals_won': len(won), 'deals_lost': len(lost),
            'avg_deal_size': avg_deal, 'avg_sales_cycle_days': avg_cycle,
        },
        'detail': {
            'revenue_trend': revenue_trend,
            'commission_by_agent': agent_rows,
            'commission_by_month': revenue_trend,
            'win_loss_by_month': win_loss_by_month,
            'deals_by_type': deals_by_type,
        },
    })
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_analytics_financial.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/analytics.py backend/scripts/verify_analytics_financial.py
git commit -m "feat(dashboard): endpoint analyse financière (CA, commissions, pipeline pondéré)"
```

---

### Task 3: Market analytics endpoint

**Files:**
- Modify: `backend/app/api/v1/backoffice/analytics.py`
- Test: `backend/scripts/verify_analytics_market.py`

**Interfaces (Produces):** `GET /backoffice/analytics/market?range=` → `{summary:{portfolio_avg_price_sqm, market_avg_price_sqm, price_gap_pct, avg_days_on_market, absorption_rate}, detail:{price_sqm_by_neighborhood[], days_on_market_distribution[], portfolio_valuation_by_city[], inventory_by_status[]}}`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_analytics_market.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User, Agency

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/market?range=12m', headers=h)
    check(r.status_code == 200, "market 200")
    b = r.get_json()
    for k in ('portfolio_avg_price_sqm','market_avg_price_sqm','price_gap_pct','avg_days_on_market','absorption_rate'):
        check(k in b.get('summary', {}), f"summary has {k}")
    for k in ('price_sqm_by_neighborhood','days_on_market_distribution','portfolio_valuation_by_city','inventory_by_status'):
        check(k in b.get('detail', {}), f"detail has {k}")
    ab = b['summary']['absorption_rate']
    check(0 <= ab <= 1, "absorption_rate in [0,1]")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_analytics_market.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement the endpoint**

Append to `backend/app/api/v1/backoffice/analytics.py`:
```python
from app.models import Property, NeighborhoodPriceRef


def _prop_base(agency, scope):
    q = Property.query.filter(Property.agency_id == agency.id)
    if not scope['all']:
        q = q.filter(Property.owner_id == scope['agent_id'])
    return q


@backoffice_bp.route('/analytics/market', methods=['GET'])
@require_auth
def analytics_market():
    agency, scope = current_scope()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    start = _range_start(request.args.get('range', '12m'))

    active = _prop_base(agency, scope).filter(Property.status == 'active').all()
    # Absorbed = terminal states (sale closed OR rental signed)
    sold = _prop_base(agency, scope).filter(Property.status.in_(['sold', 'rented'])).all()

    ppsqm = [float(p.price_per_sqm) for p in active if p.price_per_sqm]
    portfolio_avg = round(sum(ppsqm) / len(ppsqm), 2) if ppsqm else 0

    # Market reference weighted by the portfolio's neighborhoods
    market_vals = []
    for p in active:
        ref = NeighborhoodPriceRef.query.filter_by(city=p.city, neighborhood=p.neighborhood).first()
        if ref and ref.avg_price_sqm:
            market_vals.append(float(ref.avg_price_sqm))
    market_avg = round(sum(market_vals) / len(market_vals), 2) if market_vals else 0
    price_gap = round((portfolio_avg - market_avg) / market_avg * 100, 1) if market_avg else 0

    now = datetime.utcnow()
    doms = [(now - (p.published_at or p.created_at)).days for p in active if (p.published_at or p.created_at)]
    avg_dom = round(sum(doms) / len(doms), 1) if doms else 0
    absorption = round(len(sold) / (len(sold) + len(active)), 3) if (len(sold) + len(active)) else 0

    by_nb = {}
    for p in active:
        key = f"{p.city} · {p.neighborhood or '—'}"
        by_nb.setdefault(key, {'portfolio': [], 'market': None})
        if p.price_per_sqm:
            by_nb[key]['portfolio'].append(float(p.price_per_sqm))
        ref = NeighborhoodPriceRef.query.filter_by(city=p.city, neighborhood=p.neighborhood).first()
        if ref:
            by_nb[key]['market'] = float(ref.avg_price_sqm)
    price_sqm_by_neighborhood = [
        {'area': k, 'portfolio': round(sum(v['portfolio']) / len(v['portfolio']), 2) if v['portfolio'] else 0,
         'market': v['market'] or 0}
        for k, v in by_nb.items()
    ]

    buckets = {'0-30j': 0, '31-60j': 0, '61-90j': 0, '90j+': 0}
    for d in doms:
        if d <= 30: buckets['0-30j'] += 1
        elif d <= 60: buckets['31-60j'] += 1
        elif d <= 90: buckets['61-90j'] += 1
        else: buckets['90j+'] += 1
    days_on_market_distribution = [{'bucket': k, 'count': v} for k, v in buckets.items()]

    val_by_city = {}
    for p in active:
        val_by_city.setdefault(p.city, 0.0)
        val_by_city[p.city] += float(p.price or 0)
    portfolio_valuation_by_city = [{'city': k, 'value': round(v, 2)} for k, v in val_by_city.items()]

    status_counts = {}
    for p in _prop_base(agency, scope).all():
        status_counts.setdefault(p.status, 0)
        status_counts[p.status] += 1
    inventory_by_status = [{'status': k, 'count': v} for k, v in status_counts.items()]

    return jsonify({
        'summary': {
            'portfolio_avg_price_sqm': portfolio_avg, 'market_avg_price_sqm': market_avg,
            'price_gap_pct': price_gap, 'avg_days_on_market': avg_dom, 'absorption_rate': absorption,
        },
        'detail': {
            'price_sqm_by_neighborhood': price_sqm_by_neighborhood,
            'days_on_market_distribution': days_on_market_distribution,
            'portfolio_valuation_by_city': portfolio_valuation_by_city,
            'inventory_by_status': inventory_by_status,
        },
    })
```
Note: `Property.status ∈ {draft, active, pending, sold, rented, archived}` (confirmed) — `sold`+`rented` are the terminal/absorbed states used above.

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_analytics_market.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/analytics.py backend/scripts/verify_analytics_market.py
git commit -m "feat(dashboard): endpoint analyse de marché (prix/m² vs réf, DOM, absorption)"
```

---

### Task 4: Pipeline analytics endpoint

**Files:**
- Modify: `backend/app/api/v1/backoffice/analytics.py`
- Test: `backend/scripts/verify_analytics_pipeline.py`

**Interfaces (Produces):** `GET /backoffice/analytics/pipeline?range=` → `{summary:{funnel:{leads,qualified,visits,offers,closed}, conversion_overall_pct, expected_closings_30d:{count,value}, pipeline_value_open}, detail:{funnel_stages[], conversion_by_stage[], stage_velocity_days[], expected_closings_timeline[]}}`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_analytics_pipeline.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/pipeline?range=12m', headers=h)
    check(r.status_code == 200, "pipeline 200")
    b = r.get_json()
    s = b.get('summary', {})
    check('funnel' in s and 'closed' in s['funnel'], "summary funnel")
    f = s['funnel']
    check(f['leads'] >= f['closed'], "funnel decreasing (leads >= closed)")
    check(0 <= s['conversion_overall_pct'] <= 100, "conversion in [0,100]")
    for k in ('funnel_stages','conversion_by_stage','stage_velocity_days','expected_closings_timeline'):
        check(k in b.get('detail', {}), f"detail has {k}")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_analytics_pipeline.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement the endpoint**

Append to `backend/app/api/v1/backoffice/analytics.py`:
```python
from app.models import Lead


@backoffice_bp.route('/analytics/pipeline', methods=['GET'])
@require_auth
def analytics_pipeline():
    agency, scope = current_scope()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    start = _range_start(request.args.get('range', '12m'))

    lead_q = Lead.query.filter(Lead.agency_id == agency.id, Lead.created_at >= start)
    if not scope['all']:
        lead_q = lead_q.filter(Lead.assigned_to_id == scope['agent_id'])
    leads = lead_q.all()
    n_leads = len(leads)
    n_qualified = sum(1 for l in leads if l.qualified_at)
    n_converted = sum(1 for l in leads if l.converted_at)

    txn_q = _txn_base(agency, scope, start)
    open_txn = txn_q.filter(Transaction.status == 'active').all()
    won_txn = txn_q.filter(Transaction.status == 'won').all()
    n_visits = sum(1 for t in (open_txn + won_txn) if t.visit_date)
    n_offers = sum(1 for t in (open_txn + won_txn) if t.offer_date)
    n_closed = len(won_txn)

    conversion = round(n_closed / n_leads * 100, 1) if n_leads else 0
    pipeline_value_open = round(sum(_commission_estimate(t) for t in open_txn), 2)

    now = datetime.utcnow()
    soon = now + timedelta(days=30)
    exp = [t for t in open_txn if t.expected_closing_date and now <= t.expected_closing_date <= soon]
    expected_30d = {'count': len(exp), 'value': round(sum(_commission_estimate(t) for t in exp), 2)}

    funnel = {'leads': n_leads, 'qualified': n_qualified, 'visits': n_visits, 'offers': n_offers, 'closed': n_closed}
    funnel_stages = [{'stage': k, 'count': v} for k, v in
                     [('Leads', n_leads), ('Qualifiés', n_qualified), ('Visites', n_visits),
                      ('Offres', n_offers), ('Clôturés', n_closed)]]

    def conv(a, b):
        return round(b / a * 100, 1) if a else 0
    conversion_by_stage = [
        {'from': 'Leads→Qualifiés', 'pct': conv(n_leads, n_qualified)},
        {'from': 'Qualifiés→Visites', 'pct': conv(n_qualified, n_visits)},
        {'from': 'Visites→Offres', 'pct': conv(n_visits, n_offers)},
        {'from': 'Offres→Clôturés', 'pct': conv(n_offers, n_closed)},
    ]

    # Stage velocity: avg days between consecutive funnel dates on won deals
    def avg_days(pairs):
        vals = [(b - a).days for a, b in pairs if a and b and (b - a).days >= 0]
        return round(sum(vals) / len(vals), 1) if vals else 0
    stage_velocity_days = [
        {'stage': 'Contact→Visite', 'days': avg_days([(t.contact_date, t.visit_date) for t in won_txn])},
        {'stage': 'Visite→Offre', 'days': avg_days([(t.visit_date, t.offer_date) for t in won_txn])},
        {'stage': 'Offre→Clôture', 'days': avg_days([(t.offer_date, t.closing_date) for t in won_txn])},
    ]

    tl = {}
    for t in exp:
        k = t.expected_closing_date.strftime('%Y-%m-%d')
        tl.setdefault(k, 0.0)
        tl[k] += _commission_estimate(t)
    expected_closings_timeline = [{'date': k, 'value': round(v, 2)} for k, v in sorted(tl.items())]

    return jsonify({
        'summary': {'funnel': funnel, 'conversion_overall_pct': conversion,
                    'expected_closings_30d': expected_30d, 'pipeline_value_open': pipeline_value_open},
        'detail': {'funnel_stages': funnel_stages, 'conversion_by_stage': conversion_by_stage,
                   'stage_velocity_days': stage_velocity_days,
                   'expected_closings_timeline': expected_closings_timeline},
    })
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_analytics_pipeline.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/analytics.py backend/scripts/verify_analytics_pipeline.py
git commit -m "feat(dashboard): endpoint pipeline & conversion (funnel, vélocité, prévisions)"
```

---

### Task 5: Team & leads analytics endpoint

**Files:**
- Modify: `backend/app/api/v1/backoffice/analytics.py`
- Test: `backend/scripts/verify_analytics_team.py`

**Interfaces (Produces):** `GET /backoffice/analytics/team?range=` → `{summary:{top_agents[], lead_sources[], cost_per_lead, best_source}, detail:{agent_performance[], lead_roi_by_source[], conversion_by_source[], conversion_by_service[]}}`. Agency view; a plain agent sees only their own row.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_analytics_team.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/team?range=12m', headers=h)
    check(r.status_code == 200, "team 200")
    b = r.get_json()
    for k in ('top_agents','lead_sources','cost_per_lead','best_source'):
        check(k in b.get('summary', {}), f"summary has {k}")
    for k in ('agent_performance','lead_roi_by_source','conversion_by_source','conversion_by_service'):
        check(k in b.get('detail', {}), f"detail has {k}")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_analytics_team.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement the endpoint**

Append to `backend/app/api/v1/backoffice/analytics.py`:
```python
@backoffice_bp.route('/analytics/team', methods=['GET'])
@require_auth
def analytics_team():
    agency, scope = current_scope()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    start = _range_start(request.args.get('range', '12m'))

    txns = _txn_base(agency, scope, start).filter(Transaction.created_at >= start).all()
    lead_q = Lead.query.filter(Lead.agency_id == agency.id, Lead.created_at >= start)
    if not scope['all']:
        lead_q = lead_q.filter(Lead.assigned_to_id == scope['agent_id'])
    leads = lead_q.all()

    # Agent performance
    agents = {}
    for t in txns:
        a = agents.setdefault(t.agent_id, {'deals': 0, 'won': 0, 'commission': 0.0})
        a['deals'] += 1
        if t.status == 'won':
            a['won'] += 1
            a['commission'] += float(t.commission_amount or 0)
    agent_performance = []
    for aid, d in agents.items():
        user = User.query.get(aid)
        agent_performance.append({
            'agent_id': aid, 'agent': user.full_name if user else '—',
            'deals': d['deals'], 'won': d['won'], 'commission': round(d['commission'], 2),
            'conversion_pct': round(d['won'] / d['deals'] * 100, 1) if d['deals'] else 0,
        })
    agent_performance.sort(key=lambda r: r['commission'], reverse=True)
    top_agents = agent_performance[:5]

    # Lead ROI by source
    sources = {}
    for l in leads:
        s = sources.setdefault(l.source or 'inconnu', {'leads': 0, 'converted': 0, 'cost': 0.0})
        s['leads'] += 1
        if l.converted_at:
            s['converted'] += 1
        if l.is_charged and l.charge_amount:
            s['cost'] += float(l.charge_amount)
    lead_roi_by_source = [
        {'source': k, 'leads': v['leads'], 'converted': v['converted'], 'cost': round(v['cost'], 2),
         'conversion_pct': round(v['converted'] / v['leads'] * 100, 1) if v['leads'] else 0}
        for k, v in sources.items()
    ]
    total_leads = len(leads)
    total_cost = sum(v['cost'] for v in sources.values())
    cost_per_lead = round(total_cost / total_leads, 2) if total_leads else 0
    best_source = max(lead_roi_by_source, key=lambda r: r['conversion_pct'], default={}).get('source')

    conversion_by_source = [{'source': r['source'], 'pct': r['conversion_pct']} for r in lead_roi_by_source]
    svc = {}
    for l in leads:
        s = svc.setdefault(l.service or 'autre', {'leads': 0, 'converted': 0})
        s['leads'] += 1
        if l.converted_at:
            s['converted'] += 1
    conversion_by_service = [
        {'service': k, 'pct': round(v['converted'] / v['leads'] * 100, 1) if v['leads'] else 0}
        for k, v in svc.items()
    ]

    return jsonify({
        'summary': {'top_agents': top_agents,
                    'lead_sources': [{'source': r['source'], 'leads': r['leads']} for r in lead_roi_by_source],
                    'cost_per_lead': cost_per_lead, 'best_source': best_source},
        'detail': {'agent_performance': agent_performance, 'lead_roi_by_source': lead_roi_by_source,
                   'conversion_by_source': conversion_by_source, 'conversion_by_service': conversion_by_service},
    })
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_analytics_team.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/analytics.py backend/scripts/verify_analytics_team.py
git commit -m "feat(dashboard): endpoint performance équipe & ROI leads"
```

---

### Task 6: Overview (control tower) + config endpoints

**Files:**
- Modify: `backend/app/api/v1/backoffice/analytics.py`
- Test: `backend/scripts/verify_analytics_overview.py`

**Interfaces (Produces):**
- `GET /backoffice/analytics/overview` → `{financial, market, pipeline, team, listings, hot_leads, seats, subscription, alerts, config}` (each of financial/market/pipeline/team is the corresponding `summary`).
- `GET /backoffice/dashboard/config` → `{widgets:[...]}` (stored or default).
- `PUT /backoffice/dashboard/config {widgets:[{id,order,hidden}]}` → validates ids against `WIDGET_IDS`, persists to `User.dashboard_config`; 400 on unknown id.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_analytics_overview.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    r = c.get('/api/v1/backoffice/analytics/overview', headers=h)
    check(r.status_code == 200, "overview 200")
    b = r.get_json()
    for k in ('financial','market','pipeline','team','listings','hot_leads','seats','subscription','alerts','config'):
        check(k in b, f"overview has {k}")
    # config round-trip
    r = c.put('/api/v1/backoffice/dashboard/config',
              json={'widgets': [{'id': 'financial', 'order': 0, 'hidden': False}]}, headers=h)
    check(r.status_code == 200, "PUT config ok")
    r = c.put('/api/v1/backoffice/dashboard/config',
              json={'widgets': [{'id': 'bogus', 'order': 0, 'hidden': False}]}, headers=h)
    check(r.status_code == 400, "PUT config unknown id -> 400")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_analytics_overview.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement overview + config**

Append to `backend/app/api/v1/backoffice/analytics.py`:
```python
from app.services import seats as seats_service

WIDGET_IDS = ['financial', 'pipeline', 'hot_leads', 'listings', 'market', 'team_seats', 'subscription', 'alerts']
DEFAULT_WIDGETS = [{'id': wid, 'order': i, 'hidden': False} for i, wid in enumerate(WIDGET_IDS)]

# Reuse the module functions by calling them and reading `.json`. Simpler: refactor each endpoint's
# body into a helper returning the dict. For brevity here, call the view functions via test-free direct
# computation is avoided; instead compute compact summaries inline using the same helpers.


def _financial_summary(agency, scope):
    from flask import current_app  # no-op import guard
    start = _range_start('12m')
    base = _txn_base(agency, scope, start)
    won = base.filter(Transaction.status == 'won', Transaction.closing_date >= start).all()
    open_deals = base.filter(Transaction.status == 'active').all()
    return {
        'revenue_realized': round(sum(float(t.commission_amount or 0) for t in won), 2),
        'revenue_pipeline_weighted': round(sum(_commission_estimate(t) * stage_probability(t) for t in open_deals), 2),
        'deals_won': len(won),
    }


@backoffice_bp.route('/analytics/overview', methods=['GET'])
@require_auth
def analytics_overview():
    agency, scope = current_scope()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400

    # Financial / pipeline compact
    fin = _financial_summary(agency, scope)

    open_txn = _txn_base(agency, scope, _range_start('12m')).filter(Transaction.status == 'active').all()
    pipeline = {'open_deals': len(open_txn),
                'pipeline_value_open': round(sum(_commission_estimate(t) for t in open_txn), 2)}

    # Listings
    prop_q = _prop_base(agency, scope)
    active_props = prop_q.filter(Property.status == 'active').all()
    listings = {'active': len(active_props), 'views': sum(int(p.views_count or 0) for p in active_props)}

    # Hot leads (unread + overdue) — reuse the overdue threshold
    from app.api.v1.leads import LEAD_OVERDUE_DAYS
    lead_q = Lead.query.filter(Lead.agency_id == agency.id)
    if not scope['all']:
        lead_q = lead_q.filter(Lead.assigned_to_id == scope['agent_id'])
    unread = lead_q.filter(Lead.is_read.is_(False)).count()
    overdue_cutoff = datetime.utcnow() - timedelta(days=LEAD_OVERDUE_DAYS)
    overdue = lead_q.filter(Lead.is_read.is_(False), Lead.created_at < overdue_cutoff).count()
    hot_leads = {'unread': unread, 'overdue': overdue}

    # Market compact
    ppsqm = [float(p.price_per_sqm) for p in active_props if p.price_per_sqm]
    now = datetime.utcnow()
    doms = [(now - (p.published_at or p.created_at)).days for p in active_props if (p.published_at or p.created_at)]
    market = {'portfolio_avg_price_sqm': round(sum(ppsqm) / len(ppsqm), 2) if ppsqm else 0,
              'avg_days_on_market': round(sum(doms) / len(doms), 1) if doms else 0}

    # Team compact
    team = {'members': seats_service.member_count(agency)}

    # Seats + subscription (brick 2)
    seats = {'used': seats_service.seats_used(agency), 'limit': seats_service.seats_limit(agency)}
    sub = None
    if agency.subscription:
        sub = {'plan': agency.subscription.plan.name if agency.subscription.plan else None,
               'status': agency.subscription.status}

    # Alerts
    alerts = []
    if overdue:
        alerts.append({'level': 'warning', 'text': f'{overdue} lead(s) en retard'})
    soon = now + timedelta(days=7)
    closing_soon = [t for t in open_txn if t.expected_closing_date and now <= t.expected_closing_date <= soon]
    if closing_soon:
        alerts.append({'level': 'info', 'text': f'{len(closing_soon)} deal(s) à clôturer cette semaine'})
    if seats['limit'] not in (-1, 0) and seats['used'] >= seats['limit']:
        alerts.append({'level': 'warning', 'text': 'Sièges épuisés — pensez à upgrader'})

    config = g.current_user.dashboard_config or {'widgets': DEFAULT_WIDGETS}

    return jsonify({
        'financial': fin, 'market': market, 'pipeline': pipeline, 'team': team,
        'listings': listings, 'hot_leads': hot_leads, 'seats': seats,
        'subscription': sub, 'alerts': alerts, 'config': config,
    })


@backoffice_bp.route('/dashboard/config', methods=['GET'])
@require_auth
def get_dashboard_config():
    return jsonify(g.current_user.dashboard_config or {'widgets': DEFAULT_WIDGETS})


@backoffice_bp.route('/dashboard/config', methods=['PUT'])
@require_auth
def put_dashboard_config():
    data = request.get_json(silent=True) or {}
    widgets = data.get('widgets', [])
    if not isinstance(widgets, list):
        return jsonify({'error': 'widgets doit être une liste'}), 400
    for w in widgets:
        if w.get('id') not in WIDGET_IDS:
            return jsonify({'error': f"Widget inconnu : {w.get('id')}"}), 400
    g.current_user.dashboard_config = {'widgets': widgets}
    db.session.commit()
    return jsonify(g.current_user.dashboard_config)
```
Note: `member_count`/`seats_used`/`seats_limit` come from `app/services/seats.py` (brick 2). Confirm `agency.subscription` is scalar (brick 2 review confirmed it is).

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_analytics_overview.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/analytics.py backend/scripts/verify_analytics_overview.py
git commit -m "feat(dashboard): endpoint overview (tour de contrôle) + config widgets"
```

---

### Task 7: Frontend foundations — Recharts, chart kit, analyticsService

**Files:**
- Modify: `frontend/package.json` (+ `recharts`)
- Create: `frontend/src/components/analytics/ChartCard.jsx`, `KpiTile.jsx`, `TrendLine.jsx`, `BarsChart.jsx`, `DonutChart.jsx`, `FunnelBars.jsx`, `palette.js`
- Create: `frontend/src/services/analyticsService.js`
- Test: `cd frontend && npm install && npm run build`

**Interfaces (Produces):** the chart-kit components + `analyticsService` (`getFinancial/getMarket/getPipeline/getTeam(range)`, `getOverview()`, `getConfig()`, `saveConfig(widgets)`).

- [ ] **Step 1: Load the dataviz skill**

Invoke the **dataviz** skill and adopt its palette/contrast rules for `palette.js` and all chart components (theme-aware light+dark). Do this before writing chart code.

- [ ] **Step 2: Add Recharts**

Run: `cd frontend && npm install recharts`
Confirm `recharts` appears in `package.json` dependencies.

- [ ] **Step 3: Palette + KPI tile + ChartCard**

Create `frontend/src/components/analytics/palette.js`:
```javascript
// Categorical palette (swap for brand tokens later; validated for light+dark contrast).
export const SERIES = ['#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#dc2626', '#0891b2']
export const GRID = 'rgba(148,163,184,0.25)'
export const AXIS = 'currentColor'
export const fmtMAD = (n) => `${Number(n || 0).toLocaleString('fr-FR')} MAD`
export const fmtNum = (n) => Number(n || 0).toLocaleString('fr-FR')
export const fmtPct = (n) => `${Number(n || 0).toLocaleString('fr-FR')} %`
```

Create `frontend/src/components/analytics/KpiTile.jsx`:
```javascript
function KpiTile({ label, value, sub, tone = 'default' }) {
  const toneCls = { default: 'text-gray-900', up: 'text-green-600', down: 'text-red-600' }[tone] || 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}
export default KpiTile
```

Create `frontend/src/components/analytics/ChartCard.jsx`:
```javascript
function ChartCard({ title, children, empty }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {title && <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>}
      {empty ? <p className="text-sm text-gray-400 py-8 text-center">Aucune donnée</p>
             : <div className="w-full overflow-x-auto">{children}</div>}
    </div>
  )
}
export default ChartCard
```

- [ ] **Step 4: Recharts wrappers**

Create `frontend/src/components/analytics/TrendLine.jsx`:
```javascript
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { SERIES, GRID } from './palette'

function TrendLine({ data, xKey, lines, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} stroke="currentColor" fontSize={12} />
        <YAxis stroke="currentColor" fontSize={12} width={60} />
        <Tooltip />
        <Legend />
        {lines.map((l, i) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name}
                stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
export default TrendLine
```

Create `frontend/src/components/analytics/BarsChart.jsx`:
```javascript
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { SERIES, GRID } from './palette'

function BarsChart({ data, xKey, bars, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} stroke="currentColor" fontSize={12} />
        <YAxis stroke="currentColor" fontSize={12} width={60} />
        <Tooltip />
        <Legend />
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={SERIES[i % SERIES.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
export default BarsChart
```

Create `frontend/src/components/analytics/DonutChart.jsx`:
```javascript
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { SERIES } from './palette'

function DonutChart({ data, nameKey, valueKey, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
        </Pie>
        <Tooltip /><Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
export default DonutChart
```

Create `frontend/src/components/analytics/FunnelBars.jsx`:
```javascript
import { SERIES } from './palette'

function FunnelBars({ stages }) {
  const max = Math.max(1, ...stages.map((s) => s.count))
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.stage}>
          <div className="flex justify-between text-sm mb-1"><span>{s.stage}</span><span className="font-medium">{s.count}</span></div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: SERIES[i % SERIES.length] }} />
          </div>
        </div>
      ))}
    </div>
  )
}
export default FunnelBars
```

- [ ] **Step 5: analyticsService**

Create `frontend/src/services/analyticsService.js`:
```javascript
import api from './api'

export const analyticsService = {
  getFinancial: async (range = '12m') => (await api.get('/backoffice/analytics/financial', { params: { range } })).data,
  getMarket: async (range = '12m') => (await api.get('/backoffice/analytics/market', { params: { range } })).data,
  getPipeline: async (range = '12m') => (await api.get('/backoffice/analytics/pipeline', { params: { range } })).data,
  getTeam: async (range = '12m') => (await api.get('/backoffice/analytics/team', { params: { range } })).data,
  getOverview: async () => (await api.get('/backoffice/analytics/overview')).data,
  getConfig: async () => (await api.get('/backoffice/dashboard/config')).data,
  saveConfig: async (widgets) => (await api.put('/backoffice/dashboard/config', { widgets })).data,
}
```

- [ ] **Step 6: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built` (recharts bundled).

- [ ] **Step 7: Commit**
```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/analytics frontend/src/services/analyticsService.js
git commit -m "feat(dashboard): Recharts + kit de graphiques analytics + analyticsService"
```

---

### Task 8: Hub Analyses — layout + 4 pages + route + menu

**Files:**
- Create: `frontend/src/pages/backoffice/analytics/AnalyticsLayout.jsx`, `FinancialAnalytics.jsx`, `MarketAnalytics.jsx`, `PipelineAnalytics.jsx`, `TeamAnalytics.jsx`
- Modify: `frontend/src/App.jsx` (routes under `/backoffice`)
- Modify: the backoffice menu component (`frontend/src/pages/backoffice/components/BackofficeLayout.jsx` — locate the nav list; add an "Analyses" entry)
- Test: `cd frontend && npm run build`

**Interfaces:** consumes `analyticsService` + chart kit.

- [ ] **Step 1: Layout with tabs + range selector**

Create `frontend/src/pages/backoffice/analytics/AnalyticsLayout.jsx`:
```javascript
import { useState } from 'react'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'

const TABS = [
  { to: '', label: 'Finance', end: true },
  { to: 'marche', label: 'Marché' },
  { to: 'pipeline', label: 'Pipeline' },
  { to: 'equipe', label: 'Équipe' },
]
const RANGES = [['30d', '30 j'], ['90d', '90 j'], ['12m', '12 mois'], ['ytd', 'Année']]

function AnalyticsLayout() {
  const [range, setRange] = useState('12m')
  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Analyses</h1>
        <select value={range} onChange={(e) => setRange(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <NavLink key={t.label} to={t.to} end={t.end}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ range }} />
    </div>
  )
}
export const useRange = () => useOutletContext().range
export default AnalyticsLayout
```

- [ ] **Step 2: Financial page**

Create `frontend/src/pages/backoffice/analytics/FinancialAnalytics.jsx`:
```javascript
import { useQuery } from 'react-query'
import { analyticsService } from '../../../services/analyticsService'
import { useRange } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import TrendLine from '../../../components/analytics/TrendLine'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtNum } from '../../../components/analytics/palette'

function FinancialAnalytics() {
  const range = useRange()
  const { data, isLoading } = useQuery(['analytics', 'financial', range], () => analyticsService.getFinancial(range))
  if (isLoading) return <p>Chargement…</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="CA réalisé" value={fmtMAD(s.revenue_realized)} />
        <KpiTile label="Pipeline pondéré" value={fmtMAD(s.revenue_pipeline_weighted)} />
        <KpiTile label="Deals gagnés" value={fmtNum(s.deals_won)} />
        <KpiTile label="Cycle moyen (j)" value={fmtNum(s.avg_sales_cycle_days)} />
      </div>
      <ChartCard title="Tendance du CA réalisé" empty={!d.revenue_trend?.length}>
        <TrendLine data={d.revenue_trend} xKey="month" lines={[{ key: 'realized', name: 'CA réalisé' }]} />
      </ChartCard>
      <ChartCard title="Commission par agent" empty={!d.commission_by_agent?.length}>
        <BarsChart data={d.commission_by_agent} xKey="agent" bars={[{ key: 'commission', name: 'Commission' }]} />
      </ChartCard>
    </div>
  )
}
export default FinancialAnalytics
```

- [ ] **Step 3: Market page**

Create `frontend/src/pages/backoffice/analytics/MarketAnalytics.jsx`:
```javascript
import { useQuery } from 'react-query'
import { analyticsService } from '../../../services/analyticsService'
import { useRange } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import BarsChart from '../../../components/analytics/BarsChart'
import DonutChart from '../../../components/analytics/DonutChart'
import { fmtMAD, fmtNum, fmtPct } from '../../../components/analytics/palette'

function MarketAnalytics() {
  const range = useRange()
  const { data, isLoading } = useQuery(['analytics', 'market', range], () => analyticsService.getMarket(range))
  if (isLoading) return <p>Chargement…</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Prix/m² portefeuille" value={fmtMAD(s.portfolio_avg_price_sqm)} />
        <KpiTile label="Prix/m² marché" value={fmtMAD(s.market_avg_price_sqm)} />
        <KpiTile label="Écart vs marché" value={fmtPct(s.price_gap_pct)} tone={s.price_gap_pct > 0 ? 'up' : 'down'} />
        <KpiTile label="Jours sur le marché" value={fmtNum(s.avg_days_on_market)} />
      </div>
      <ChartCard title="Prix/m² par quartier (portefeuille vs marché)" empty={!d.price_sqm_by_neighborhood?.length}>
        <BarsChart data={d.price_sqm_by_neighborhood} xKey="area"
                   bars={[{ key: 'portfolio', name: 'Portefeuille' }, { key: 'market', name: 'Marché' }]} />
      </ChartCard>
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title="Jours sur le marché" empty={!d.days_on_market_distribution?.length}>
          <BarsChart data={d.days_on_market_distribution} xKey="bucket" bars={[{ key: 'count', name: 'Annonces' }]} />
        </ChartCard>
        <ChartCard title="Valorisation par ville" empty={!d.portfolio_valuation_by_city?.length}>
          <DonutChart data={d.portfolio_valuation_by_city} nameKey="city" valueKey="value" />
        </ChartCard>
      </div>
    </div>
  )
}
export default MarketAnalytics
```

- [ ] **Step 4: Pipeline page**

Create `frontend/src/pages/backoffice/analytics/PipelineAnalytics.jsx`:
```javascript
import { useQuery } from 'react-query'
import { analyticsService } from '../../../services/analyticsService'
import { useRange } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import FunnelBars from '../../../components/analytics/FunnelBars'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtPct } from '../../../components/analytics/palette'

function PipelineAnalytics() {
  const range = useRange()
  const { data, isLoading } = useQuery(['analytics', 'pipeline', range], () => analyticsService.getPipeline(range))
  if (isLoading) return <p>Chargement…</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Conversion globale" value={fmtPct(s.conversion_overall_pct)} />
        <KpiTile label="Pipeline ouvert" value={fmtMAD(s.pipeline_value_open)} />
        <KpiTile label="Clôtures 30j" value={s.expected_closings_30d.count} sub={fmtMAD(s.expected_closings_30d.value)} />
        <KpiTile label="Clôturés" value={s.funnel.closed} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title="Entonnoir" empty={!d.funnel_stages?.length}><FunnelBars stages={d.funnel_stages} /></ChartCard>
        <ChartCard title="Vélocité par étape (j)" empty={!d.stage_velocity_days?.length}>
          <BarsChart data={d.stage_velocity_days} xKey="stage" bars={[{ key: 'days', name: 'Jours' }]} />
        </ChartCard>
      </div>
    </div>
  )
}
export default PipelineAnalytics
```

- [ ] **Step 5: Team page**

Create `frontend/src/pages/backoffice/analytics/TeamAnalytics.jsx`:
```javascript
import { useQuery } from 'react-query'
import { analyticsService } from '../../../services/analyticsService'
import { useRange } from './AnalyticsLayout'
import KpiTile from '../../../components/analytics/KpiTile'
import ChartCard from '../../../components/analytics/ChartCard'
import BarsChart from '../../../components/analytics/BarsChart'
import { fmtMAD, fmtNum } from '../../../components/analytics/palette'

function TeamAnalytics() {
  const range = useRange()
  const { data, isLoading } = useQuery(['analytics', 'team', range], () => analyticsService.getTeam(range))
  if (isLoading) return <p>Chargement…</p>
  const s = data.summary, d = data.detail
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Coût par lead" value={fmtMAD(s.cost_per_lead)} />
        <KpiTile label="Meilleure source" value={s.best_source || '—'} />
        <KpiTile label="Agents" value={fmtNum(d.agent_performance?.length || 0)} />
        <KpiTile label="Sources" value={fmtNum(s.lead_sources?.length || 0)} />
      </div>
      <ChartCard title="Commission par agent" empty={!d.agent_performance?.length}>
        <BarsChart data={d.agent_performance} xKey="agent" bars={[{ key: 'commission', name: 'Commission' }]} />
      </ChartCard>
      <ChartCard title="Conversion par source" empty={!d.conversion_by_source?.length}>
        <BarsChart data={d.conversion_by_source} xKey="source" bars={[{ key: 'pct', name: 'Conversion %' }]} />
      </ChartCard>
      <ChartCard title="ROI par source" empty={!d.lead_roi_by_source?.length}>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-left text-gray-500"><tr><th className="py-2">Source</th><th>Leads</th><th>Convertis</th><th>Coût</th><th>Conv.</th></tr></thead>
          <tbody>{d.lead_roi_by_source.map((r) => (
            <tr key={r.source} className="border-t border-gray-100">
              <td className="py-2">{r.source}</td><td>{r.leads}</td><td>{r.converted}</td><td>{fmtMAD(r.cost)}</td><td>{r.conversion_pct} %</td>
            </tr>))}</tbody>
        </table></div>
      </ChartCard>
    </div>
  )
}
export default TeamAnalytics
```

- [ ] **Step 6: Routes + menu**

In `frontend/src/App.jsx`, import the pages and add nested routes inside the existing `/backoffice` `BackofficeLayout` route group:
```javascript
          <Route path="analyses" element={<AnalyticsLayout />}>
            <Route index element={<FinancialAnalytics />} />
            <Route path="marche" element={<MarketAnalytics />} />
            <Route path="pipeline" element={<PipelineAnalytics />} />
            <Route path="equipe" element={<TeamAnalytics />} />
          </Route>
```
(imports: `AnalyticsLayout, FinancialAnalytics, MarketAnalytics, PipelineAnalytics, TeamAnalytics` from `./pages/backoffice/analytics/...`.)

In `frontend/src/pages/backoffice/components/BackofficeLayout.jsx`, read the nav-items list and add an "Analyses" link (path `/backoffice/analyses`, an icon like `FiTrendingUp`) matching the existing item shape.

- [ ] **Step 7: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 8: Commit**
```bash
git add frontend/src/pages/backoffice/analytics frontend/src/App.jsx frontend/src/pages/backoffice/components/BackofficeLayout.jsx
git commit -m "feat(dashboard): hub Analyses (Finance/Marché/Pipeline/Équipe) avec Recharts"
```

---

### Task 9: Control tower — configurable widget grid on `/dashboard`

**Files:**
- Create: `frontend/src/components/dashboard/widgets/index.jsx` (widget registry + widget components)
- Rewrite: `frontend/src/pages/dashboard/Dashboard.jsx`
- Test: `cd frontend && npm run build`

**Interfaces:** consumes `analyticsService.getOverview/saveConfig`.

- [ ] **Step 1: Widget registry**

Create `frontend/src/components/dashboard/widgets/index.jsx`:
```javascript
import { Link } from 'react-router-dom'
import { fmtMAD, fmtNum, fmtPct } from '../../analytics/palette'

function Widget({ title, to, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        {to && <Link to={to} className="text-xs text-primary-600">voir plus →</Link>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// registry: id -> { title, render(overview) }
export const WIDGETS = {
  financial: { title: 'Finance', to: '/backoffice/analyses', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.financial?.revenue_realized)}</div>
      <div className="text-xs text-gray-400">Pipeline pondéré {fmtMAD(o.financial?.revenue_pipeline_weighted)}</div></div>) },
  pipeline: { title: 'Pipeline', to: '/backoffice/analyses/pipeline', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.pipeline?.pipeline_value_open)}</div>
      <div className="text-xs text-gray-400">{fmtNum(o.pipeline?.open_deals)} deals ouverts</div></div>) },
  hot_leads: { title: 'Leads', to: '/backoffice/leads', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.hot_leads?.unread)}</div>
      <div className="text-xs text-red-500">{fmtNum(o.hot_leads?.overdue)} en retard</div></div>) },
  listings: { title: 'Annonces', to: '/dashboard/annonces', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.listings?.active)}</div>
      <div className="text-xs text-gray-400">{fmtNum(o.listings?.views)} vues</div></div>) },
  market: { title: 'Marché', to: '/backoffice/analyses/marche', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.market?.portfolio_avg_price_sqm)}/m²</div>
      <div className="text-xs text-gray-400">{fmtNum(o.market?.avg_days_on_market)} j sur le marché</div></div>) },
  team_seats: { title: 'Équipe', to: '/backoffice/equipe', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.team?.members)}</div>
      <div className="text-xs text-gray-400">Sièges {o.seats?.used}/{o.seats?.limit === -1 ? '∞' : o.seats?.limit}</div></div>) },
  subscription: { title: 'Abonnement', to: '/dashboard/compte/abonnement', render: (o) => (
    <div><div className="text-lg font-bold text-gray-900">{o.subscription?.plan || '—'}</div>
      <div className="text-xs text-gray-400">{o.subscription?.status || ''}</div></div>) },
  alerts: { title: 'Alertes', to: null, render: (o) => (
    <ul className="space-y-1">{(o.alerts || []).length === 0 ? <li className="text-xs text-gray-400">Rien à signaler</li>
      : o.alerts.map((a, i) => <li key={i} className={`text-xs ${a.level === 'warning' ? 'text-amber-600' : 'text-gray-600'}`}>• {a.text}</li>)}</ul>) },
}

export { Widget }
```

- [ ] **Step 2: Rewrite Dashboard.jsx as the control tower**

Replace `frontend/src/pages/dashboard/Dashboard.jsx` with:
```javascript
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'react-query'
import { toast } from 'react-toastify'
import { analyticsService } from '../../services/analyticsService'
import { WIDGETS, Widget } from '../../components/dashboard/widgets'

const DEFAULT = Object.keys(WIDGETS).map((id, i) => ({ id, order: i, hidden: false }))

function Dashboard() {
  const { data: overview, isLoading } = useQuery('dashboard-overview', analyticsService.getOverview)
  const [editing, setEditing] = useState(false)
  const [widgets, setWidgets] = useState(DEFAULT)
  const [dragId, setDragId] = useState(null)

  useEffect(() => {
    const cfg = overview?.config?.widgets
    if (cfg && cfg.length) setWidgets(cfg.filter((w) => WIDGETS[w.id]).sort((a, b) => a.order - b.order))
  }, [overview])

  const save = useMutation(() => analyticsService.saveConfig(widgets.map((w, i) => ({ ...w, order: i }))), {
    onSuccess: () => { toast.success('Tableau de bord enregistré'); setEditing(false) },
    onError: () => toast.error('Erreur'),
  })

  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) return
    const arr = [...widgets]
    const from = arr.findIndex((w) => w.id === dragId)
    const to = arr.findIndex((w) => w.id === targetId)
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    setWidgets(arr)
    setDragId(null)
  }
  const toggleHide = (id) => setWidgets(widgets.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w)))

  if (isLoading) return <div className="p-8">Chargement…</div>
  const visible = widgets.filter((w) => editing || !w.hidden)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Tour de contrôle</h1>
        {editing
          ? <div className="flex gap-2">
              <button onClick={() => save.mutate()} className="btn-primary text-sm">Enregistrer</button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">Annuler</button>
            </div>
          : <button onClick={() => setEditing(true)} className="btn-secondary text-sm">Personnaliser</button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visible.map((w) => {
          const def = WIDGETS[w.id]
          if (!def) return null
          return (
            <div key={w.id}
                 draggable={editing}
                 onDragStart={() => setDragId(w.id)}
                 onDragOver={(e) => editing && e.preventDefault()}
                 onDrop={() => onDrop(w.id)}
                 className={`${editing ? 'cursor-move ring-1 ring-dashed ring-gray-300 rounded-xl' : ''} ${w.hidden ? 'opacity-40' : ''}`}>
              {editing && (
                <div className="flex justify-end mb-1">
                  <button onClick={() => toggleHide(w.id)} className="text-xs text-gray-500">
                    {w.hidden ? 'Afficher' : 'Masquer'}
                  </button>
                </div>
              )}
              <Widget title={def.title} to={editing ? null : def.to}>{def.render(overview)}</Widget>
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default Dashboard
```
Note: the old `Dashboard.jsx` had service CTA cards; if the product wants to keep them, append them below the grid — but the spec's control tower supersedes the old counters. Grep for other imports of `dashboard/Dashboard` (there should be none beyond the route).

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/dashboard/widgets frontend/src/pages/dashboard/Dashboard.jsx
git commit -m "feat(dashboard): tour de contrôle configurable (widgets, réordonner/masquer, persistance)"
```

---

### Task 10: Integration verification + build

**Files:**
- Create: `backend/scripts/verify_analytics_all.py`
- Test: this task is the gate.

- [ ] **Step 1: Aggregate runner**

Create `backend/scripts/verify_analytics_all.py`:
```python
"""python3 scripts/verify_analytics_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_analytics_foundation.py', 'verify_analytics_financial.py', 'verify_analytics_market.py',
           'verify_analytics_pipeline.py', 'verify_analytics_team.py', 'verify_analytics_overview.py']
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

Run: `cd backend && source venv/bin/activate && python3 seed.py && python3 seed_backoffice.py && python3 scripts/verify_analytics_all.py`
Expected: `ALL PASS`. (If `seed.py` errors on a non-empty DB from the known pre-existing `clear_data` bug, reset schema drop/create + `flask db upgrade` + reseed — do NOT modify seed.py. If a script reveals a real bug, fix it; don't paper over.)

- [ ] **Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, no errors.

- [ ] **Step 4: Manual UI smoke test (deferred to user)**

As owner (agency view) and as a plain agent (personal view): `/backoffice/analyses` — 4 tabs render charts, range selector changes data; agent sees only own numbers. `/dashboard` — control tower widgets render; "Personnaliser" → drag to reorder + hide a widget + Enregistrer → reload persists.

- [ ] **Step 5: Commit**
```bash
git add backend/scripts/verify_analytics_all.py
git commit -m "test(dashboard): runner de vérification agrégé analytics"
```

---

## Self-Review notes (coverage vs spec)

- §3 scope → Task 1 (`analytics_scope`) applied in Tasks 2-6. §4 `dashboard_config` → Task 1. §5.1-5.4 module endpoints → Tasks 2-5. §5.5 overview → Task 6. §5.6 config → Task 6. §6 stage probabilities → Task 1 constant, used in 2/4/6. §7.1 Recharts+kit → Task 7. §7.2 hub → Task 8. §7.3 control tower → Task 9. §7.4 service → Task 7. §8 seed permission → Task 1. §9 tests → each task + Task 10.
- Type consistency: endpoints return `{summary, detail}`; overview keys (`financial/market/pipeline/team/listings/hot_leads/seats/subscription/alerts/config`) consumed by the widget registry (Task 9); `range` param consistent service↔backend; `WIDGET_IDS` (backend) ⊇ registry ids (frontend) — keep them in sync (financial, pipeline, hot_leads, listings, market, team_seats, subscription, alerts).
- Known MVP simplifications: control-tower reorder uses native HTML5 drag (no dep); `commission_by_month` reuses `revenue_trend`; absorption counts `sold`+`rented` as terminal (confirmed statuses); the overview's `_financial_summary` duplicates a little of Task 2's logic (acceptable — compact vs full); charts follow the dataviz skill palette (Task 7 step 1).
- Verify scripts assume agency-member seed password `password123` and that seeded transactions/leads exist; Task 1 seed step ensures demo transactions if missing.
