# Plan P1-2 — Moteur de commission (`services/commission`) + wiring billing/payment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer le service `commission` (compteur d'affaires par compte, règle « 1re offerte / forfait dès la 2e », gate synchrone, facturation gatée) et câbler `billing` (facture de type commission) + `payment` (intent de type commission) pour l'encaissement CMI.

**Architecture:** Nouveau service FastAPI `services/commission` (port **8519**, schéma/rôle Postgres `commission`), outbox → RabbitMQ. Il possède `DealCounter` (1/compte), `Conclusion` (1/affaire), `CommissionRule` (config forfait). Le **gate synchrone** `GET /internal/commission/gate` décide OPEN/BLOCKED/NOT_APPLICABLE ; sur BLOCKED il crée un intent de paiement CMI (via `payment`) et émet `commission.due` (→ `billing` crée l'Invoice). Un worker consomme `rental.lease.signed` / `sale.compromis.signed` (finalise la conclusion, incrémente le compteur) et `payment.completed` (purpose=commission → marque payé).

**Tech Stack:** FastAPI, SQLAlchemy 2.0, `psycopg[binary]`, `semsar_common`/`semsar_auth`/`semsar_events`, pytest + `fastapi.testclient` + SQLite en mémoire pour les tests domaine.

## Global Constraints

- Port `commission` = **8519** ; schéma/rôle Postgres dédiés `commission` (ADR-0002).
- Devise **MAD** ; forfait par défaut **4999** ; règle configurable par `deal_type` (`rental` | `sale`).
- Erreurs au format legacy `{"error": ...}` (`install_legacy_error_handlers` + `util.err`, comme `buyer`).
- Idempotence des consumers via `ProcessedMessage` (PK `message_id`) ; émission via `enqueue(db, ...)` dans la même transaction que la mutation.
- Gate **fail-closed** côté appelants (traité aux Plans 4/5) ; ce plan garantit un gate lisible et idempotent.
- Conventional Commits ; pas d'attribution IA ; gate qualité (lint+format+typecheck+tests+build) vert avant « done ».

---

### Task 1 : Scaffold du service `commission` + fixture de test DB

**Files:**
- Create: `services/commission/app/__init__.py` (vide)
- Create: `services/commission/app/config.py`
- Create: `services/commission/app/db.py`
- Create: `services/commission/app/util.py`
- Create: `services/commission/app/models.py`
- Create: `services/commission/app/events.py`
- Create: `services/commission/app/main.py`
- Create: `services/commission/app/relay.py`
- Create: `services/commission/pyproject.toml`
- Create: `services/commission/.env.example`
- Create: `services/commission/db/schema.sql`
- Create: `services/commission/tests/conftest.py`
- Create: `services/commission/tests/test_health.py`

**Interfaces:**
- Produces: app FastAPI `app.main:app` exposant `GET /health` ; `Base`, `SessionLocal`, `get_db`, `init_db` (db.py) ; `err`, `iso`, `json_body` (util.py) ; fixtures `db_session`, `client` (conftest).

- [ ] **Step 1 : Écrire le test qui échoue** (`tests/test_health.py`)

```python
def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd services/commission && python -m pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 3 : `app/db.py`** (calqué sur `buyer/app/db.py` + outbox comme `billing/app/db.py`) :

```python
"""Accès données du service commission — schéma + rôle dédiés (ADR-0002)."""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from semsar_common import get_settings
from semsar_events import OutboxBase

_settings = get_settings()
_engine = create_engine(
    _settings.database_url or "postgresql+psycopg://commission:commission@localhost:5432/semsar",
    future=True, pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def init_db() -> None:
    Base.metadata.create_all(_engine)
    OutboxBase.metadata.create_all(_engine)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4 : `app/util.py`** (copie de `buyer/app/util.py`) :

```python
from fastapi import Request
from fastapi.responses import JSONResponse


def err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


async def json_body(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def iso(v):
    return v.isoformat() if v else None
```

- [ ] **Step 5 : `app/config.py`** :

```python
"""Config du service commission — socle commun."""
from semsar_common import get_settings

__all__ = ["get_settings"]
```

- [ ] **Step 6 : `app/models.py`** (les 4 modèles + ProcessedMessage) :

```python
"""Modèles du service commission (schéma `commission`)."""
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Integer, Numeric, String, UniqueConstraint,
)

from .db import Base


class DealCounter(Base):
    """Un compteur d'affaires conclues par compte (particulier / promoteur en direct)."""
    __tablename__ = "deal_counter"

    account_id = Column(Integer, primary_key=True)
    concluded_count = Column(Integer, nullable=False, default=0)
    first_deal_free_used = Column(Boolean, nullable=False, default=False)
    free_conclusion_id = Column(Integer)  # conclusion ayant réservé la 1re affaire offerte
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Conclusion(Base):
    """Une affaire (bail / compromis) : décision de facturabilité + cycle de vie."""
    __tablename__ = "conclusion"
    __table_args__ = (UniqueConstraint("deal_type", "source_ref", name="uq_conclusion_deal"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, nullable=False, index=True)
    deal_type = Column(String(10), nullable=False)          # rental | sale
    source_ref = Column(Integer, nullable=False)            # lease_id / compromis_id
    source_event = Column(String(60))                       # rempli à la conclusion réelle
    billable = Column(Boolean, nullable=False, default=False)
    commission_amount = Column(Numeric(10, 2), default=0)
    invoice_ref = Column(String(60))
    pay_url = Column(String(255))
    paid = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default="pending")  # pending|concluded|voided|reused
    concluded_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommissionRule(Base):
    """Forfait configurable par type d'affaire (versionné dans le temps)."""
    __tablename__ = "commission_rule"

    id = Column(Integer, primary_key=True, autoincrement=True)
    deal_type = Column(String(10), nullable=False, index=True)  # rental | sale
    flat_amount = Column(Numeric(10, 2), nullable=False, default=4999)
    currency = Column(String(3), nullable=False, default="MAD")
    active_from = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 7 : `app/events.py`** :

```python
"""Événements publiés par commission."""
COMMISSION_DUE = "commission.due"          # → billing crée une Invoice(type=commission)
COMMISSION_SETTLED = "commission.settled"  # affaire conclue et commission réglée
COMMISSION_WAIVED = "commission.waived"    # 1re affaire offerte
```

- [ ] **Step 8 : `app/main.py`** (structure minimale, health) — calqué sur `buyer/app/main.py` :

```python
"""Service commission — moteur de compteur d'affaires + gate de facturation."""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .db import get_db, init_db
from .util import err, iso, json_body

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}
```

- [ ] **Step 9 : `app/relay.py`** (copie du relay billing, cf. `services/billing/app/relay.py`) — identique au pattern, seul le service_name diffère (injecté par env).

```python
"""Relais outbox → RabbitMQ du service commission."""
from semsar_common import get_settings, setup_logging
from semsar_events import run_relay

from .db import SessionLocal


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    run_relay(SessionLocal, settings.rabbitmq_url, settings.events_exchange)


if __name__ == "__main__":
    main()
```

- [ ] **Step 10 : `pyproject.toml`** (calqué sur `buyer/pyproject.toml`) :

```toml
[project]
name = "semsar-service-commission"
version = "0.1.0"
description = "Moteur de commission SemsarOut (compteur d'affaires + gate de facturation)."
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110", "uvicorn[standard]>=0.29",
    "prometheus-fastapi-instrumentator>=7.0", "SQLAlchemy>=2.0", "psycopg[binary]>=3.1",
    "httpx>=0.27", "semsar-common", "semsar-auth", "semsar-events",
]

[project.optional-dependencies]
test = ["pytest>=8.0", "httpx>=0.27"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["app"]
```

- [ ] **Step 11 : `.env.example`** :

```
SERVICE_NAME=commission
DATABASE_URL=postgresql+psycopg://commission:commission@localhost:5432/semsar
RABBITMQ_URL=amqp://semsar:semsar@localhost:5672/
EVENTS_EXCHANGE=semsar.events
TRUST_GATEWAY_HEADERS=true
PAYMENT_URL=http://localhost:8507
INTERNAL_TOKEN=change-me-internal
OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=INFO
```

- [ ] **Step 12 : `db/schema.sql`** (rôle + schéma, cf. `buyer/db/schema.sql`) :

```sql
-- Service commission — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE commission LOGIN PASSWORD 'commission';
CREATE SCHEMA IF NOT EXISTS commission AUTHORIZATION commission;
ALTER ROLE commission SET search_path = commission;
GRANT ALL ON SCHEMA commission TO commission;
```

- [ ] **Step 13 : `tests/conftest.py`** (fixture DB SQLite + principal superadmin, réutilisée par tout ce plan) :

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal
from semsar_events import OutboxBase

from app import models  # noqa: F401 — enregistre les tables
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def principal():
    return Principal(sub="1", roles=["buyer"], agency_id=None,
                     is_superadmin=True, features=[], claims={})


@pytest.fixture
def client(db_session, principal):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: principal
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 14 : Lancer les tests**

Run: `cd services/commission && python -m pytest tests/ -v`
Expected: `test_health_ok` PASS.

- [ ] **Step 15 : Commit**

```bash
git add services/commission
git commit -m "feat(commission): scaffold du service (health, modèles, outbox, tests)"
```

---

### Task 2 : Règle de commission configurable + seed par défaut

**Files:**
- Modify: `services/commission/app/main.py` (endpoints rules + helper `active_rule`)
- Test: `services/commission/tests/test_rules.py`

**Interfaces:**
- Produces:
  - `active_rule(db, deal_type: str) -> CommissionRule` (helper interne ; crée le défaut 4999 MAD si absent).
  - `GET /backoffice/commission/rules` → `{"rules": [{id, deal_type, flat_amount, currency, active_from}]}` (superadmin).
  - `POST /backoffice/commission/rules` `{deal_type, flat_amount}` → crée une nouvelle version, status 201 (superadmin).

- [ ] **Step 1 : Test qui échoue** (`tests/test_rules.py`)

```python
from app import models


def test_default_rule_created_on_demand(client, db_session):
    resp = client.get("/backoffice/commission/rules")
    assert resp.status_code == 200
    # aucune règle seedée manuellement : l'appel gate en créera au besoin (voir active_rule)
    assert "rules" in resp.json()


def test_admin_can_override_amount(client, db_session):
    resp = client.post("/backoffice/commission/rules",
                       json={"deal_type": "rental", "flat_amount": 3500})
    assert resp.status_code == 201
    rules = db_session.query(models.CommissionRule).filter_by(deal_type="rental").all()
    assert any(float(r.flat_amount) == 3500 for r in rules)
```

- [ ] **Step 2 : Lancer, échec attendu** (`404`/routes absentes).

Run: `cd services/commission && python -m pytest tests/test_rules.py -v`

- [ ] **Step 3 : Implémenter dans `main.py`** (ajouter après `health`) :

```python
from sqlalchemy import desc

from .models import CommissionRule

_DEAL_TYPES = {"rental", "sale"}
_DEFAULT_AMOUNT = 4999


def active_rule(db: Session, deal_type: str) -> CommissionRule:
    rule = (db.query(CommissionRule).filter(CommissionRule.deal_type == deal_type)
            .order_by(desc(CommissionRule.active_from)).first())
    if rule is None:
        rule = CommissionRule(deal_type=deal_type, flat_amount=_DEFAULT_AMOUNT, currency="MAD")
        db.add(rule)
        db.flush()
    return rule


def _rule_dict(r: CommissionRule) -> dict:
    return {"id": r.id, "deal_type": r.deal_type, "flat_amount": float(r.flat_amount),
            "currency": r.currency, "active_from": iso(r.active_from)}


@app.get("/backoffice/commission/rules")
def list_rules(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return err("Réservé à l'administration.", 403)
    rows = db.query(CommissionRule).order_by(desc(CommissionRule.active_from)).all()
    return {"rules": [_rule_dict(r) for r in rows]}


@app.post("/backoffice/commission/rules", status_code=201)
async def create_rule(request: Request, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return err("Réservé à l'administration.", 403)
    data = await json_body(request)
    if data.get("deal_type") not in _DEAL_TYPES:
        return err("deal_type invalide.", 400)
    try:
        amount = float(data["flat_amount"])
    except (KeyError, TypeError, ValueError):
        return err("flat_amount requis.", 400)
    r = CommissionRule(deal_type=data["deal_type"], flat_amount=amount, currency=data.get("currency", "MAD"))
    db.add(r)
    db.commit()
    return {"rule": _rule_dict(r)}
```

- [ ] **Step 4 : Lancer les tests** → 2 PASS.

Run: `cd services/commission && python -m pytest tests/test_rules.py -v`

- [ ] **Step 5 : Commit**

```bash
git add services/commission
git commit -m "feat(commission): règle de forfait configurable par type (défaut 4999 MAD)"
```

---

### Task 3 : Cœur du gate — décision OPEN / BLOCKED (compteur + 1re affaire offerte)

**Files:**
- Modify: `services/commission/app/main.py` (helper `decide_gate` + endpoint gate)
- Test: `services/commission/tests/test_gate.py`

**Interfaces:**
- Produces:
  - `decide_gate(db, account_id: int, deal_type: str, source_ref: int) -> Conclusion` — récupère/crée la `Conclusion` de l'affaire, réserve la 1re offerte OU marque billable ; **idempotent** (2e appel renvoie la même conclusion, pas de doublon).
  - `GET /internal/commission/gate?account_id=&deal_type=&source_ref=` → `{"state": "OPEN"|"BLOCKED", "billable": bool, "invoice_ref": str|None, "pay_url": str|None}`. (Le paiement/`commission.due` est branché en Task 4 ; ici BLOCKED sans pay_url.)

- [ ] **Step 1 : Test qui échoue** (`tests/test_gate.py`)

```python
def _gate(client, account_id, deal_type, source_ref):
    return client.get("/internal/commission/gate",
                      params={"account_id": account_id, "deal_type": deal_type, "source_ref": source_ref})


def test_first_deal_is_open_and_waived(client, db_session):
    r = _gate(client, 100, "rental", 1)
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "OPEN"
    assert body["billable"] is False


def test_second_deal_is_blocked(client, db_session):
    from app import models
    # 1re affaire réservée puis effectivement conclue (compteur avancé)
    _gate(client, 100, "rental", 1)
    c = db_session.query(models.DealCounter).get(100)
    c.first_deal_free_used = True
    db_session.commit()
    r = _gate(client, 100, "rental", 2)
    assert r.json()["state"] == "BLOCKED"
    assert r.json()["billable"] is True


def test_gate_is_idempotent(client, db_session):
    from app import models
    _gate(client, 200, "rental", 5)
    _gate(client, 200, "rental", 5)
    n = db_session.query(models.Conclusion).filter_by(deal_type="rental", source_ref=5).count()
    assert n == 1
```

- [ ] **Step 2 : Lancer, échec attendu** (route absente).

- [ ] **Step 3 : Implémenter** dans `main.py` :

```python
from .models import Conclusion, DealCounter


def _counter(db: Session, account_id: int) -> DealCounter:
    c = db.get(DealCounter, account_id)
    if c is None:
        c = DealCounter(account_id=account_id, concluded_count=0, first_deal_free_used=False)
        db.add(c)
        db.flush()
    return c


def decide_gate(db: Session, account_id: int, deal_type: str, source_ref: int) -> Conclusion:
    concl = (db.query(Conclusion)
             .filter(Conclusion.deal_type == deal_type, Conclusion.source_ref == source_ref).first())
    if concl is not None:
        return concl
    counter = _counter(db, account_id)
    if not counter.first_deal_free_used:
        # réserve la 1re affaire offerte pour cette conclusion
        concl = Conclusion(account_id=account_id, deal_type=deal_type, source_ref=source_ref,
                           billable=False, commission_amount=0, paid=True, status="pending")
        db.add(concl)
        db.flush()
        counter.first_deal_free_used = True
        counter.free_conclusion_id = concl.id
    else:
        rule = active_rule(db, deal_type)
        concl = Conclusion(account_id=account_id, deal_type=deal_type, source_ref=source_ref,
                           billable=True, commission_amount=rule.flat_amount, paid=False, status="pending")
        db.add(concl)
        db.flush()
    return concl


def _gate_response(concl: Conclusion) -> dict:
    if not concl.billable or concl.paid:
        return {"state": "OPEN", "billable": concl.billable,
                "invoice_ref": concl.invoice_ref, "pay_url": None}
    return {"state": "BLOCKED", "billable": True,
            "invoice_ref": concl.invoice_ref, "pay_url": concl.pay_url}


@app.get("/internal/commission/gate")
def gate(account_id: int, deal_type: str, source_ref: int, db: Session = Depends(get_db)):
    if deal_type not in _DEAL_TYPES:
        return err("deal_type invalide.", 400)
    concl = decide_gate(db, account_id, deal_type, source_ref)
    db.commit()
    return _gate_response(concl)
```

- [ ] **Step 4 : Lancer les tests** → 3 PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/commission
git commit -m "feat(commission): gate synchrone — 1re affaire offerte, 2e+ bloquée (idempotent)"
```

---

### Task 4 : Sur BLOCKED — créer l'intent CMI + émettre `commission.due`

**Files:**
- Modify: `services/commission/app/main.py` (`decide_gate` : appel payment + `enqueue(commission.due)`)
- Create: `services/commission/app/payment_client.py`
- Test: `services/commission/tests/test_gate_billing.py`

**Interfaces:**
- Consumes: endpoint payment `POST /payments/create-intent` (Task 9 de ce plan étend le branchement `commission`). Signature attendue de la réponse : `{"reference": str, "payment_url": str}`.
- Produces: `payment_client.create_commission_intent(account_id, amount, deal_type, source_ref) -> tuple[str, str]` (reference, pay_url). Émission `commission.due` avec payload `{conclusion_id, account_id, deal_type, source_ref, amount, invoice_ref, purpose: "commission"}`.

- [ ] **Step 1 : Test qui échoue** (`tests/test_gate_billing.py`) — on stubbe le client payment :

```python
import app.main as main
from app import models


def test_blocked_creates_intent_and_emits_due(client, db_session, monkeypatch):
    monkeypatch.setattr(main.payment_client, "create_commission_intent",
                        lambda **k: ("PAY-TEST", "/payment-gateway?ref=PAY-TEST"))
    # forcer 2e affaire
    c = models.DealCounter(account_id=300, concluded_count=1, first_deal_free_used=True)
    db_session.add(c)
    db_session.commit()
    r = client.get("/internal/commission/gate",
                   params={"account_id": 300, "deal_type": "sale", "source_ref": 9})
    body = r.json()
    assert body["state"] == "BLOCKED"
    assert body["pay_url"] == "/payment-gateway?ref=PAY-TEST"
    assert body["invoice_ref"] == "PAY-TEST"
    # commission.due émis dans l'outbox
    from semsar_events import OutboxEvent
    evts = db_session.query(OutboxEvent).filter_by(event_type="commission.due").all()
    assert len(evts) == 1
    assert evts[0].payload["amount"] == 4999.0
```

- [ ] **Step 2 : Lancer, échec attendu** (`payment_client` inexistant / pas d'émission).

- [ ] **Step 3 : Créer `app/payment_client.py`** :

```python
"""Appel interne vers le service payment pour créer un intent de commission (lien CMI)."""
import os

import httpx

_PAYMENT_URL = os.environ.get("PAYMENT_URL", "http://localhost:8507")


def create_commission_intent(account_id: int, amount: float, deal_type: str, source_ref: int) -> tuple[str, str]:
    resp = httpx.post(
        f"{_PAYMENT_URL}/payments/create-intent",
        json={"purpose": "commission", "amount": amount, "payment_method": "card",
              "commission_ref": f"{deal_type}:{source_ref}", "account_id": account_id},
        headers={"x-semsar-user-id": str(account_id)}, timeout=8.0,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"payment create-intent {resp.status_code}")
    body = resp.json()
    return body["reference"], body["payment_url"]
```

- [ ] **Step 4 : Étendre `decide_gate`** (branche billable) — après `db.add(concl); db.flush()` dans le `else` :

```python
        from . import events
        from . import payment_client
        ref, pay_url = payment_client.create_commission_intent(
            account_id=account_id, amount=float(rule.flat_amount),
            deal_type=deal_type, source_ref=source_ref)
        concl.invoice_ref = ref
        concl.pay_url = pay_url
        enqueue(db, "conclusion", concl.id, events.COMMISSION_DUE, {
            "conclusion_id": concl.id, "account_id": account_id, "deal_type": deal_type,
            "source_ref": source_ref, "amount": float(rule.flat_amount),
            "invoice_ref": ref, "purpose": "commission"})
```
Ajouter en tête de `main.py` : `from semsar_events import enqueue` et `from . import events, payment_client`.

- [ ] **Step 5 : Lancer les tests** → PASS.

- [ ] **Step 6 : Commit**

```bash
git add services/commission
git commit -m "feat(commission): sur BLOCKED, créer l'intent CMI et émettre commission.due"
```

---

### Task 5 : Worker — finaliser la conclusion sur `rental.lease.signed` / `sale.compromis.signed`

**Files:**
- Create: `services/commission/app/worker.py`
- Test: `services/commission/tests/test_worker_conclusion.py`

**Interfaces:**
- Consumes (RabbitMQ) : `rental.lease.signed` payload `{id: lease_id, account_id?}` ; `sale.compromis.signed` payload `{id: compromis_id, account_id}`. (Le mapping `account_id` = propriétaire est garanti par les Plans 4/5 qui enrichissent ces payloads.)
- Produces: incrémente `DealCounter.concluded_count`, passe `Conclusion.status="concluded"` + `concluded_at`, émet `commission.settled` (billable) ou `commission.waived` (offerte).

- [ ] **Step 1 : Test qui échoue** (`tests/test_worker_conclusion.py`)

```python
from app import models
from app.worker import _handle


def test_lease_signed_concludes_and_increments(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    # une conclusion "pending" offerte existe (gate déjà passé)
    concl = models.Conclusion(account_id=500, deal_type="rental", source_ref=7,
                              billable=False, paid=True, status="pending")
    db_session.add(concl)
    db_session.add(models.DealCounter(account_id=500, concluded_count=0, first_deal_free_used=True))
    db_session.commit()
    _handle("rental.lease.signed", {"id": 7, "account_id": 500}, "rental:7")
    db_session.expire_all()
    assert db_session.query(models.DealCounter).get(500).concluded_count == 1
    assert db_session.query(models.Conclusion).filter_by(source_ref=7).first().status == "concluded"


def test_worker_idempotent(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    db_session.add(models.Conclusion(account_id=501, deal_type="rental", source_ref=8,
                                     billable=False, paid=True, status="pending"))
    db_session.add(models.DealCounter(account_id=501, concluded_count=0, first_deal_free_used=True))
    db_session.commit()
    _handle("rental.lease.signed", {"id": 8, "account_id": 501}, "rental:8")
    _handle("rental.lease.signed", {"id": 8, "account_id": 501}, "rental:8")
    db_session.expire_all()
    assert db_session.query(models.DealCounter).get(501).concluded_count == 1
```

- [ ] **Step 2 : Lancer, échec attendu** (`app.worker` inexistant).

- [ ] **Step 3 : Créer `app/worker.py`** (pattern billing/worker.py) :

```python
"""Worker commission — finalise les conclusions et applique les paiements.

    python -m app.worker
"""
from datetime import datetime

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer, enqueue

from . import events
from .db import SessionLocal, init_db
from .models import Conclusion, DealCounter, ProcessedMessage

_DEAL_BY_KEY = {"rental.lease.signed": ("rental", "id"),
                "sale.compromis.signed": ("sale", "id")}


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key in _DEAL_BY_KEY:
            _conclude(db, routing_key, payload)
        elif routing_key == "payment.completed" and payload.get("purpose") == "commission":
            _apply_payment(db, payload)
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _conclude(db, routing_key: str, payload: dict) -> None:
    deal_type, ref_key = _DEAL_BY_KEY[routing_key]
    source_ref = payload.get(ref_key)
    concl = (db.query(Conclusion)
             .filter(Conclusion.deal_type == deal_type, Conclusion.source_ref == source_ref).first())
    if concl is None or concl.status == "concluded":
        return
    concl.status = "concluded"
    concl.source_event = routing_key
    concl.concluded_at = datetime.utcnow()
    counter = db.get(DealCounter, concl.account_id)
    if counter is None:
        counter = DealCounter(account_id=concl.account_id, concluded_count=0, first_deal_free_used=True)
        db.add(counter)
    counter.concluded_count = (counter.concluded_count or 0) + 1
    evt = events.COMMISSION_SETTLED if concl.billable else events.COMMISSION_WAIVED
    enqueue(db, "conclusion", concl.id, evt, {
        "conclusion_id": concl.id, "account_id": concl.account_id, "deal_type": deal_type,
        "source_ref": source_ref, "amount": float(concl.commission_amount or 0)})


def _apply_payment(db, payload: dict) -> None:
    ref = payload.get("invoice_ref") or payload.get("commission_ref")
    concl = db.query(Conclusion).filter(Conclusion.invoice_ref == ref).first()
    if concl is not None:
        concl.paid = True


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url, service_name=settings.service_name,
        bindings=["rental.lease.signed", "sale.compromis.signed", "payment.completed"],
        exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4 : Lancer les tests** → 2 PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/commission
git commit -m "feat(commission): worker — conclusion (compteur +1) + settled/waived"
```

---

### Task 6 : Paiement de commission → déblocage du gate

**Files:**
- Test: `services/commission/tests/test_payment_unblocks.py`

(Le handler `_apply_payment` est déjà écrit en Task 5 ; ici on prouve la boucle de déblocage de bout en bout côté commission.)

- [ ] **Step 1 : Test qui échoue** (`tests/test_payment_unblocks.py`)

```python
import app.main as main
from app import models
from app.worker import _handle


def test_payment_completed_flips_gate_to_open(client, db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(main.payment_client, "create_commission_intent",
                        lambda **k: ("PAY-Z", "/payment-gateway?ref=PAY-Z"))
    db_session.add(models.DealCounter(account_id=700, concluded_count=1, first_deal_free_used=True))
    db_session.commit()
    # 1er gate → BLOCKED + invoice_ref PAY-Z
    assert client.get("/internal/commission/gate",
                      params={"account_id": 700, "deal_type": "sale", "source_ref": 3}
                      ).json()["state"] == "BLOCKED"
    # paiement confirmé
    _handle("payment.completed", {"purpose": "commission", "invoice_ref": "PAY-Z"}, "pay:z")
    db_session.expire_all()
    # 2e gate → OPEN (payé)
    assert client.get("/internal/commission/gate",
                      params={"account_id": 700, "deal_type": "sale", "source_ref": 3}
                      ).json()["state"] == "OPEN"
```

- [ ] **Step 2 : Lancer** → doit PASS directement (logique déjà en place). Si échec, corriger `_apply_payment`/`_gate_response`.

Run: `cd services/commission && python -m pytest tests/test_payment_unblocks.py -v`

- [ ] **Step 3 : Commit**

```bash
git add services/commission
git commit -m "test(commission): boucle paiement→gate OPEN vérifiée"
```

---

### Task 7 : Annulation / avoir réutilisable + endpoint `void`

**Files:**
- Modify: `services/commission/app/main.py` (endpoint `POST /internal/commission/void` + réutilisation d'avoir dans `decide_gate`)
- Test: `services/commission/tests/test_void_credit.py`

**Interfaces:**
- Produces: `POST /internal/commission/void` `{deal_type, source_ref}` → passe la conclusion `status="voided"` ; si elle avait réservé la 1re offerte, **libère** le slot (`first_deal_free_used=False`) ; si elle était payée (billable), elle reste un **avoir** réutilisable. Dans `decide_gate`, une nouvelle affaire billable **réutilise** un avoir payé existant du même compte (pas de nouvelle facture).

- [ ] **Step 1 : Test qui échoue** (`tests/test_void_credit.py`)

```python
import app.main as main
from app import models


def test_void_releases_free_slot(client, db_session):
    client.get("/internal/commission/gate",
               params={"account_id": 800, "deal_type": "rental", "source_ref": 1})
    assert db_session.query(models.DealCounter).get(800).first_deal_free_used is True
    r = client.post("/internal/commission/void", json={"deal_type": "rental", "source_ref": 1})
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.query(models.DealCounter).get(800).first_deal_free_used is False


def test_paid_void_becomes_reusable_credit(client, db_session, monkeypatch):
    monkeypatch.setattr(main.payment_client, "create_commission_intent",
                        lambda **k: ("PAY-CR", "/payment-gateway?ref=PAY-CR"))
    db_session.add(models.DealCounter(account_id=801, concluded_count=1, first_deal_free_used=True))
    db_session.commit()
    client.get("/internal/commission/gate",
               params={"account_id": 801, "deal_type": "sale", "source_ref": 2})
    # marque payé puis void → avoir
    c = db_session.query(models.Conclusion).filter_by(source_ref=2).first()
    c.paid = True
    db_session.commit()
    client.post("/internal/commission/void", json={"deal_type": "sale", "source_ref": 2})
    # nouvelle affaire billable → réutilise l'avoir, pas de nouvelle facture (state OPEN direct)
    r = client.get("/internal/commission/gate",
                   params={"account_id": 801, "deal_type": "sale", "source_ref": 3})
    assert r.json()["state"] == "OPEN"
    assert db_session.query(models.Conclusion).filter_by(source_ref=2).first().status == "reused"
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Implémenter** — dans `decide_gate`, dans la branche `else` (billable), AVANT de créer l'intent, chercher un avoir :

```python
        credit = (db.query(Conclusion)
                  .filter(Conclusion.account_id == account_id, Conclusion.paid.is_(True),
                          Conclusion.status == "voided").order_by(Conclusion.id).first())
        if credit is not None:
            credit.status = "reused"
            concl = Conclusion(account_id=account_id, deal_type=deal_type, source_ref=source_ref,
                               billable=True, commission_amount=credit.commission_amount,
                               invoice_ref=credit.invoice_ref, paid=True, status="pending")
            db.add(concl)
            db.flush()
            return concl
```
(placer ce bloc juste après `rule = active_rule(...)` et avant la création facturable normale.)

Puis l'endpoint void :

```python
@app.post("/internal/commission/void")
async def void_conclusion(request: Request, db: Session = Depends(get_db)):
    data = await json_body(request)
    concl = (db.query(Conclusion)
             .filter(Conclusion.deal_type == data.get("deal_type"),
                     Conclusion.source_ref == data.get("source_ref")).first())
    if concl is None:
        return err("Conclusion introuvable.", 404)
    concl.status = "voided"
    counter = db.get(DealCounter, concl.account_id)
    if counter is not None and counter.free_conclusion_id == concl.id:
        counter.first_deal_free_used = False
        counter.free_conclusion_id = None
    db.commit()
    return {"status": "voided", "conclusion_id": concl.id}
```

- [ ] **Step 4 : Lancer les tests** → 2 PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/commission
git commit -m "feat(commission): void — libère la 1re offerte / avoir payé réutilisable"
```

---

### Task 8 : `billing` — facture de type commission

**Files:**
- Modify: `services/billing/app/models.py` (Invoice : `invoice_type`, `account_id`, `subscription_id` nullable)
- Modify: `services/billing/app/worker.py` (binding `commission.due` + `payment.completed` purpose=commission)
- Create: `services/billing/db/migrate_commission_invoice.sql`
- Test: `services/billing/tests/test_commission_invoice.py`

**Interfaces:**
- Consumes: `commission.due` `{invoice_ref, account_id, deal_type, amount, purpose:"commission"}` ; `payment.completed` `{purpose:"commission", invoice_ref}`.
- Produces: `Invoice(invoice_type="commission", account_id=..., subscription_id=NULL, reference=invoice_ref, amount, status)` ; passage `paid` au paiement ; émet `billing.invoice.created`.

- [ ] **Step 1 : Test qui échoue** (`services/billing/tests/test_commission_invoice.py`)

```python
from app import models
from app.worker import _handle


def _session(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from semsar_events import OutboxBase
    engine = create_engine("sqlite:///:memory:", future=True)
    models.Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: s)
    return s


def test_commission_due_creates_invoice(monkeypatch):
    s = _session(monkeypatch)
    _handle("commission.due", {"purpose": "commission", "invoice_ref": "PAY-1",
                               "account_id": 42, "deal_type": "rental", "amount": 4999}, "c:1")
    inv = s.query(models.Invoice).filter_by(reference="PAY-1").first()
    assert inv is not None
    assert inv.invoice_type == "commission"
    assert inv.account_id == 42
    assert inv.status == "unpaid"


def test_commission_payment_marks_paid(monkeypatch):
    s = _session(monkeypatch)
    _handle("commission.due", {"purpose": "commission", "invoice_ref": "PAY-2",
                               "account_id": 42, "deal_type": "rental", "amount": 4999}, "c:2")
    _handle("payment.completed", {"purpose": "commission", "invoice_ref": "PAY-2"}, "c:3")
    inv = s.query(models.Invoice).filter_by(reference="PAY-2").first()
    assert inv.status == "paid"
```

- [ ] **Step 2 : Lancer, échec attendu** (colonnes/handler absents).

Run: `cd services/billing && python -m pytest tests/test_commission_invoice.py -v`

- [ ] **Step 3 : Modifier `Invoice`** (`services/billing/app/models.py`) — rendre `subscription_id` nullable et ajouter deux colonnes :

```python
    subscription_id = Column(Integer, ForeignKey("subscription.id"), nullable=True)
    invoice_type = Column(String(20), nullable=False, default="subscription")  # subscription | commission
    account_id = Column(Integer, index=True)  # compte facturé pour une commission (particulier/promoteur)
```

- [ ] **Step 4 : Étendre `services/billing/app/worker.py`** — retirer le `return` prématuré sur `purpose != "subscription"` et router par purpose :

Remplacer le début de `_handle` :
```python
def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    purpose = payload.get("purpose")
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "commission.due" and purpose == "commission":
            _create_commission_invoice(db, payload)
        elif routing_key == "payment.completed" and purpose == "commission":
            _mark_commission_paid(db, payload)
        elif purpose == "subscription":
            agency_id = payload.get("agency_id")
            if routing_key == "payment.released":
                _activate_pending(db, agency_id)
            elif routing_key == "payment.completed":
                _create_or_extend(db, payload, agency_id)
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```

Ajouter les deux handlers + l'import events/enqueue déjà présents :
```python
from .models import Invoice  # déjà importé

def _create_commission_invoice(db, payload) -> None:
    ref = payload.get("invoice_ref")
    if db.query(Invoice).filter(Invoice.reference == ref).first() is not None:
        return
    inv = Invoice(reference=ref, invoice_type="commission", account_id=payload.get("account_id"),
                  amount=payload.get("amount"), status="unpaid",
                  period_label=f"commission {payload.get('deal_type')}")
    db.add(inv)
    db.flush()
    enqueue(db, "invoice", inv.id, events.INVOICE_CREATED, {
        "invoice_id": inv.id, "account_id": payload.get("account_id"),
        "amount": float(payload.get("amount") or 0), "purpose": "commission"})


def _mark_commission_paid(db, payload) -> None:
    inv = db.query(Invoice).filter(Invoice.reference == payload.get("invoice_ref")).first()
    if inv is not None and inv.status != "paid":
        inv.status = "paid"
        inv.paid_at = datetime.utcnow()
```
Ajouter le binding worker : `bindings=["payment.released", "payment.completed", "commission.due"]`.

- [ ] **Step 5 : Migration SQL** (`services/billing/db/migrate_commission_invoice.sql`) :

```sql
-- Facture de commission : subscription_id devient nullable, ajout type + compte facturé.
ALTER TABLE billing.invoice ALTER COLUMN subscription_id DROP NOT NULL;
ALTER TABLE billing.invoice ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) NOT NULL DEFAULT 'subscription';
ALTER TABLE billing.invoice ADD COLUMN IF NOT EXISTS account_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_invoice_account ON billing.invoice (account_id);
```

- [ ] **Step 6 : Lancer les tests** → 2 PASS.

- [ ] **Step 7 : Commit**

```bash
git add services/billing
git commit -m "feat(billing): facture de type commission (commission.due → invoice → paid)"
```

---

### Task 9 : `payment` — intent de type commission + émission `payment.completed`

**Files:**
- Modify: `services/payment/app/main.py` (`create-intent` branche commission + webhook émet purpose=commission)
- Test: `services/payment/tests/test_commission_payment.py`

**Interfaces:**
- Consumes (HTTP entrant) : `POST /payments/create-intent` `{purpose:"commission", amount, commission_ref, account_id, payment_method:"card"}` → `{reference, payment_url, status}`.
- Produces (event) : au webhook `status=="success"` d'un paiement `payment_type=="commission"` → `payment.completed` `{payment_id, invoice_ref: reference, commission_ref, account_id, purpose:"commission"}`.

- [ ] **Step 1 : Test qui échoue** (`services/payment/tests/test_commission_payment.py`)

```python
from fastapi.testclient import TestClient

from app.main import app


def test_create_commission_intent():
    with TestClient(app) as c:
        r = c.post("/payments/create-intent",
                   json={"purpose": "commission", "amount": 4999, "commission_ref": "rental:7",
                         "account_id": 42, "payment_method": "card"},
                   headers={"x-semsar-user-id": "42"})
        assert r.status_code == 200
        body = r.json()
        assert body["reference"].startswith("PAY-")
        assert "payment_url" in body
```
(Ce test suppose `DATABASE_URL` sqlite ou une DB dispo ; si les tests payment tournent sans DB, adapter en overridant `get_db` comme dans le conftest commission. Voir note en fin de tâche.)

- [ ] **Step 2 : Lancer, échec attendu** (branche commission absente → `amount<=0` → 400).

- [ ] **Step 3 : Étendre `create_payment_intent`** (`services/payment/app/main.py`) — ajouter une branche AVANT le contrôle `amount <= 0`, dans la détermination du montant :

```python
    purpose = data.get("purpose")
    commission_ref = data.get("commission_ref")
    ...
    if purpose == "commission":
        try:
            amount = float(data.get("amount"))
        except (TypeError, ValueError):
            amount = 0
        payment_type = "commission"
    elif service_id in SERVICE_PRICES:
        ...  # inchangé
```
Et à la création du `Payment`, stocker `service_id=commission_ref` (réutilise la colonne existante) pour le retrouver au webhook. Le `payment_type` de commission doit être accepté (colonne `String(20)`, aucune contrainte).

- [ ] **Step 4 : Étendre le webhook** — dans `payment_webhook`, dans la branche `status == "success"`, ajouter après le bloc subscription :

```python
        if p.payment_type == "commission":
            enqueue(db, "payment", p.id, events.PAYMENT_COMPLETED, {
                "payment_id": p.id, "invoice_ref": p.reference, "commission_ref": p.service_id,
                "account_id": p.user_id, "purpose": "commission"})
```

- [ ] **Step 5 : Lancer les tests** → PASS.

> **Note DB tests payment** : si le service payment n'a pas de conftest avec DB, ajouter `services/payment/tests/conftest.py` sur le modèle de `services/commission/tests/conftest.py` (SQLite + override `get_db`) — le webhook et create-intent écrivent en base.

- [ ] **Step 6 : Commit**

```bash
git add services/payment
git commit -m "feat(payment): intent + webhook de type commission (payment.completed purpose=commission)"
```

---

### Task 10 : Enregistrement mesh + gateway pour `commission`

**Files:**
- Modify: `scripts/dev-mesh-up.sh` (SVCS, BFF URL, relay+worker, santé)
- Modify: `gateway/app/config.py` (`commission_url`)
- Modify: `gateway/app/main.py` (client + routage `/api/v1/commission` + interne)

**Interfaces:** opérationnel. Le gate `/internal/commission/gate` est **interne** (appelé service→service, pas via BFF) ; seules les routes back-office `/backoffice/commission/*` transitent par le BFF.

- [ ] **Step 1 : `scripts/dev-mesh-up.sh`** — ajouter `commission:8519` à `SVCS` ; ajouter `commission` aux boucles `relay` et `worker` ; ajouter `COMMISSION_URL=http://localhost:8519` au bloc BFF ; ajouter `commission:8519` à la boucle santé. Pour le service payment (appelé par commission), rien à changer (déjà dans le mesh) ; ajouter `PAYMENT_URL=http://localhost:8507` au `case "$svc"` de `commission`.

- [ ] **Step 2 : `gateway/app/config.py`** — ajouter `commission_url: str | None = None` dans `GatewaySettings`.

- [ ] **Step 3 : `gateway/app/main.py`** — (a) lifespan : `app.state.commission = _client_or_none(settings.commission_url)` + l'inclure dans les `aclose`. (b) `_resolve_upstream` : ajouter la règle (namespacé) :

```python
    if settings.commission_url and path.startswith("/api/v1/backoffice/commission"):
        return app.state.commission, path.replace("/api/v1", "", 1)
```

- [ ] **Step 4 : Vérifier bring-up + gate**

Run:
```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -f services/commission/db/schema.sql
bash scripts/dev-mesh-up.sh
curl -s "localhost:8519/internal/commission/gate?account_id=1&deal_type=rental&source_ref=1"
```
Expected: `{"state":"OPEN","billable":false,...}` (1re affaire offerte).

- [ ] **Step 5 : Commit**

```bash
git add scripts/dev-mesh-up.sh gateway
git commit -m "chore(mesh): enregistrer le service commission (mesh + gateway)"
```

---

## Self-Review

- **Couverture spec** : §6 (DealCounter/Conclusion/CommissionRule, gate, règle 1re-offerte, idempotence, endpoints, consumers, events) → Tasks 1-7 ; §7 (billing Invoice commission + payment CMI + boucle déblocage) → Tasks 4,6,8,9 ; §8 (avoir/void, idempotence) → Tasks 5,6,7. Segmentation « qui paie » (NOT_APPLICABLE agence) : **déléguée aux appelants** (Plans 4/5 n'appellent le gate que pour particulier/promoteur-direct) — documenté §3.3 spec.
- **Placeholders** : aucun ; code complet à chaque étape.
- **Cohérence des types** : `decide_gate`/`_gate_response`/`Conclusion.status ∈ {pending,concluded,voided,reused}` cohérents Task 3↔5↔7 ; `commission.due` payload (`invoice_ref`,`account_id`,`amount`,`purpose`) identique entre commission (Task 4) et billing (Task 8) ; `payment.completed` payload (`purpose:"commission"`,`invoice_ref`) identique entre payment (Task 9), commission worker (Task 5) et billing (Task 8).
