# Gestion locative — Phase 1 (socle `rental`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer le service souverain `rental` avec les entités Mandat + Bail, leur CRUD back-office, le gating d'abonnement `has_rental`, le câblage BFF, les événements `rental.mandate.*`/`rental.lease.*`, et les deux emails « mandat signé » / « bail signé ».

**Architecture:** Nouveau microservice FastAPI (schéma + rôle PostgreSQL `rental`, port 8518), patrons standard du mesh : outbox+relay+worker (`semsar_events`), auth déléguée au BFF (`semsar_auth`), endpoints internes à jeton. Les personnes (locataire/propriétaire) sont des `crm.Client` référencés par `client_id` ; l'email est résolu par le service notification via `crm /internal/client/{id}`. Les emails suivent le worker+templates existants.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, psycopg3, RabbitMQ (topic `semsar.events`), Jinja2 (emails), Brevo SMTP.

## Global Constraints

- 1 schéma + 1 rôle PostgreSQL par service (ADR-0002). Rôle/schéma `rental`, mdp `rental` (dev).
- Erreurs legacy : `{"error": "..."}` via `util.err()`.
- Événements via **outbox** uniquement (`enqueue(db, aggregate_type, aggregate_id, event_type, payload)`), jamais de publication directe.
- Idempotence consumer via table `processed_message` (dédup par `message_id`).
- Cloisonnement agence : toute requête back-office filtrée par `principal.agency_id`.
- Gating : `require_feature("rental")` (feature projetée dans `identity.agency_ro.features`).
- Devise d'affichage emails : `Đh`. Design SemsarOut (base.html + `_components` + icônes PNG hébergées).
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. `git commit` = commande bash SEULE.
- Secrets : jamais commités. `services/rental/.env` gitignoré ; `.env.example` committé.
- Ne pas démarrer le monolithe (décommissionné).

---

### Task 1: Scaffolder le service `rental` (santé + DB)

**Files:**
- Create: `services/rental/pyproject.toml`
- Create: `services/rental/.env.example`
- Create: `services/rental/README.md`
- Create: `services/rental/db/schema.sql`
- Create: `services/rental/app/__init__.py` (vide)
- Create: `services/rental/app/db.py`
- Create: `services/rental/app/util.py`

**Interfaces:**
- Produces: `db.Base`, `db.SessionLocal`, `db.get_db()`, `db.init_db()`; `util.err(msg, code)`, `util.json_body(request)`, `util.iso(v)`, `util.num(v)`.

- [ ] **Step 1: Créer le rôle + schéma PostgreSQL**

`services/rental/db/schema.sql` :
```sql
-- Service rental (gestion locative) — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE rental LOGIN PASSWORD 'rental';
CREATE SCHEMA IF NOT EXISTS rental AUTHORIZATION rental;
ALTER ROLE rental SET search_path = rental;
GRANT ALL ON SCHEMA rental TO rental;
```

Appliquer :
```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -f services/rental/db/schema.sql
```
Expected: `CREATE ROLE` / `CREATE SCHEMA` (ou `already exists`, idempotent acceptable).

- [ ] **Step 2: `pyproject.toml`** (copie de `services/transactions/pyproject.toml`, en remplaçant le nom/description)
```toml
[project]
name = "semsar-rental"
version = "0.1.0"
description = "SemsarOut — service gestion locative (mandats, baux, quittancement, charges)."
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "prometheus-fastapi-instrumentator>=7.0",
    "SQLAlchemy>=2.0",
    "psycopg[binary]>=3.1",
    "httpx>=0.27",
    "reportlab>=4.0",
    "semsar-common",
    "semsar-auth",
    "semsar-events",
]

[project.optional-dependencies]
test = ["pytest>=8.0"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["app"]
```

- [ ] **Step 3: `.env.example`**
```
SERVICE_NAME=rental
DATABASE_URL=postgresql+psycopg://rental:rental@localhost:5432/semsar
RABBITMQ_URL=amqp://semsar:semsar@localhost:5672/
EVENTS_EXCHANGE=semsar.events
TRUST_GATEWAY_HEADERS=true
INTERNAL_TOKEN=change-me-internal
IDENTITY_URL=http://localhost:8501
CRM_URL=http://localhost:8013
LISTING_URL=http://localhost:8012
OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=INFO
```

- [ ] **Step 4: `app/db.py`** (calque exact de `services/transactions/app/db.py`, défaut d'URL `rental`)
```python
"""Accès données du service rental — schéma + rôle dédiés (ADR-0002)."""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from semsar_common import get_settings
from semsar_events import OutboxBase

_settings = get_settings()
_engine = create_engine(
    _settings.database_url or "postgresql+psycopg://rental:rental@localhost:5432/semsar",
    future=True,
    pool_pre_ping=True,
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

- [ ] **Step 5: `app/util.py`** (calque exact de `services/transactions/app/util.py`)
```python
"""Helpers partagés du service rental (erreurs legacy, JSON, dates, nombres)."""
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


def num(v):
    return float(v) if v is not None else None
```

- [ ] **Step 6: `app/__init__.py`** vide, et `README.md` (2-3 lignes décrivant le service + `python -m uvicorn app.main:app`).

- [ ] **Step 7: Vérifier que `services/rental/.env` sera ignoré** (ne pas créer de `.env` réel ici)
```bash
git check-ignore services/rental/.env || echo "ATTENTION: .env non ignoré — vérifier .gitignore"
```
Expected: chemin affiché (ignoré). Si non ignoré, ajouter `services/*/.env` au `.gitignore` racine.

- [ ] **Step 8: Commit**
```bash
git add services/rental/pyproject.toml services/rental/.env.example services/rental/README.md services/rental/db/schema.sql services/rental/app/__init__.py services/rental/app/db.py services/rental/app/util.py
git commit -m "feat(rental): scaffolder le service gestion locative (rôle/schéma, db, util)"
```

---

### Task 2: Modèles Mandat + Bail + projections + événements

**Files:**
- Create: `services/rental/app/events.py`
- Create: `services/rental/app/models.py`

**Interfaces:**
- Produces: `models.Mandate`, `models.Lease`, `models.PropertyRO`, `models.ClientRO`, `models.ProcessedMessage`; `events.MANDATE_CREATED`, `events.MANDATE_SIGNED`, `events.LEASE_CREATED`, `events.LEASE_SIGNED`.

- [ ] **Step 1: `app/events.py`**
```python
"""Événements publiés par rental (consommés par notification pour les emails)."""
MANDATE_CREATED = "rental.mandate.created"
MANDATE_SIGNED = "rental.mandate.signed"
LEASE_CREATED = "rental.lease.created"
LEASE_SIGNED = "rental.lease.signed"
```

- [ ] **Step 2: `app/models.py`**
```python
"""Modèles du service rental (schéma `rental`) — gestion locative.

Personnes (locataire/propriétaire) = crm.Client, référencés par client_id ; l'email est résolu
par le service notification via crm /internal/client/{id}. PropertyRO (titre/ville) est une
projection locale maintenue par listing.* ; ClientRO (nom) sert l'affichage back-office.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text

from .db import Base


class Mandate(Base):
    __tablename__ = "mandate"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, nullable=False, index=True)
    agency_id = Column(Integer, index=True, nullable=False)
    property_id = Column(Integer, index=True, nullable=False)
    landlord_client_id = Column(Integer, index=True, nullable=False)
    mandate_type = Column(String(20), default="gestion")     # gestion | location
    fee_percent = Column(Numeric(5, 2))
    landlord_iban = Column(String(34))                        # chiffré au repos en cible (pgcrypto)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    status = Column(String(20), default="draft")             # draft|active|expired|terminated
    signed_at = Column(DateTime)
    expiry_notice_sent_at = Column(DateTime)                 # avis d'échéance (anti-doublon)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Lease(Base):
    __tablename__ = "lease"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(30), unique=True, nullable=False, index=True)
    mandate_id = Column(Integer, index=True, nullable=False)
    property_id = Column(Integer, index=True, nullable=False)
    tenant_client_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    rent_amount = Column(Numeric(12, 2), nullable=False)
    charges_amount = Column(Numeric(12, 2), default=0)
    deposit_amount = Column(Numeric(12, 2), default=0)
    deposit_returned_at = Column(DateTime)
    deposit_return_amount = Column(Numeric(12, 2))
    payment_day = Column(Integer, default=1)                 # jour d'échéance (1-28)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    irl_index_ref = Column(String(40))                       # indice de référence (révision)
    last_revision_at = Column(DateTime)
    revision_notice_sent_at = Column(DateTime)               # avis de révision (anti-doublon)
    status = Column(String(20), default="draft")             # draft|active|ended|terminated
    signed_at = Column(DateTime)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PropertyRO(Base):
    """Projection locale du bien (via listing.*) : property_title / property_city."""
    __tablename__ = "property_ro"

    id = Column(Integer, primary_key=True)
    title = Column(String(200))
    city = Column(String(100))


class ClientRO(Base):
    """Projection locale du client (nom) pour l'affichage back-office."""
    __tablename__ = "client_ro"

    id = Column(Integer, primary_key=True)
    first_name = Column(String(50))
    last_name = Column(String(50))
    email = Column(String(120))
    client_type = Column(String(20))


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3: Vérifier la création des tables**
```bash
cd /home/younes/Documents/work/0semsar
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" \
  PYTHONPATH=services/rental python3 -c "from app.db import init_db; init_db(); print('tables ok')"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "\dt rental.*"
```
Expected: `tables ok` puis liste incluant `mandate`, `lease`, `property_ro`, `client_ro`, `processed_message`, `outbox`.

- [ ] **Step 4: Commit**
```bash
git add services/rental/app/events.py services/rental/app/models.py
git commit -m "feat(rental): modèles Mandat + Bail + projections RO + événements"
```

---

### Task 3: `main.py` — CRUD Mandat + gating + émission d'événements

**Files:**
- Create: `services/rental/app/main.py`

**Interfaces:**
- Consumes: `db`, `util`, `events`, `models.Mandate`; `semsar_auth.get_principal`/`Principal`; `semsar_events.enqueue`; `require_feature` (voir Task 7 — utilisé ici, défini dans `semsar_auth`).
- Produces: routes `GET/POST /backoffice/gestion-locative/mandates`, `GET/PATCH /backoffice/gestion-locative/mandates/{id}`, `POST /backoffice/gestion-locative/mandates/{id}/sign`, `GET /health`, `GET /internal/mandates/{id}`. Helpers `_mandate_dict(m)`, `_emit_mandate(db, m, event_type)`, `_reference(prefix)`, `_gate(principal)`.

- [ ] **Step 1: En-tête, app, helpers, gate** (calque `services/transactions/app/main.py` lifespan/tracing/metrics)
```python
"""Service rental — gestion locative (schéma `rental`).

CRUD mandats de gestion + baux (back-office, gating `rental`). Émet rental.mandate.*/lease.*
(outbox) → notification (emails). Personnes = crm.Client (client_id) ; email résolu par notification.
"""
from contextlib import asynccontextmanager
from datetime import datetime
import uuid

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import Lease, Mandate
from .util import err, iso, json_body, num

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


def _gate(principal: Principal) -> JSONResponse | None:
    if principal.agency_id is None or "rental" not in principal.features:
        return err("Fonction réservée aux plans Pro et Entreprise.", 403)
    return None


def _reference(prefix: str) -> str:
    return f"{prefix}-{datetime.utcnow().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"


def _mandate_dict(m: Mandate) -> dict:
    return {
        "id": m.id, "reference": m.reference, "agency_id": m.agency_id,
        "property_id": m.property_id, "landlord_client_id": m.landlord_client_id,
        "mandate_type": m.mandate_type, "fee_percent": num(m.fee_percent),
        "landlord_iban": m.landlord_iban, "start_date": iso(m.start_date),
        "end_date": iso(m.end_date), "status": m.status, "signed_at": iso(m.signed_at),
        "notes": m.notes, "created_at": iso(m.created_at),
    }


def _emit_mandate(db: Session, m: Mandate, event_type: str) -> None:
    enqueue(db, "mandate", m.id, event_type, {
        "id": m.id, "reference": m.reference, "agency_id": m.agency_id,
        "property_id": m.property_id, "landlord_client_id": m.landlord_client_id,
        "mandate_type": m.mandate_type, "fee_percent": num(m.fee_percent),
        "start_date": iso(m.start_date), "end_date": iso(m.end_date),
    })


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok", "service": settings.service_name}
```

- [ ] **Step 2: Routes CRUD mandats**
```python
@app.get("/backoffice/gestion-locative/mandates")
def list_mandates(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    q = db.query(Mandate).filter(Mandate.agency_id == principal.agency_id)
    return {"mandates": [_mandate_dict(m) for m in q.order_by(Mandate.created_at.desc()).all()]}


@app.get("/backoffice/gestion-locative/mandates/{mandate_id}")
def get_mandate(mandate_id: int, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    m = db.get(Mandate, mandate_id)
    if m is None or m.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    return _mandate_dict(m)


@app.post("/backoffice/gestion-locative/mandates", status_code=201)
async def create_mandate(request: Request, principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    data = await json_body(request)
    if not data.get("property_id") or not data.get("landlord_client_id"):
        return err("property_id et landlord_client_id sont requis.", 400)
    m = Mandate(
        reference=_reference("MND"), agency_id=principal.agency_id,
        property_id=data["property_id"], landlord_client_id=data["landlord_client_id"],
        mandate_type=data.get("mandate_type", "gestion"), fee_percent=data.get("fee_percent"),
        landlord_iban=data.get("landlord_iban"),
        start_date=_parse_dt(data.get("start_date")), end_date=_parse_dt(data.get("end_date")),
        notes=data.get("notes"),
    )
    db.add(m)
    db.flush()
    _emit_mandate(db, m, events.MANDATE_CREATED)
    db.commit()
    return _mandate_dict(m)


@app.patch("/backoffice/gestion-locative/mandates/{mandate_id}")
async def update_mandate(mandate_id: int, request: Request,
                         principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    m = db.get(Mandate, mandate_id)
    if m is None or m.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    data = await json_body(request)
    for field in ("mandate_type", "fee_percent", "landlord_iban", "notes"):
        if field in data:
            setattr(m, field, data[field])
    if "start_date" in data:
        m.start_date = _parse_dt(data["start_date"])
    if "end_date" in data:
        m.end_date = _parse_dt(data["end_date"])
    db.commit()
    return _mandate_dict(m)


@app.post("/backoffice/gestion-locative/mandates/{mandate_id}/sign")
def sign_mandate(mandate_id: int, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    m = db.get(Mandate, mandate_id)
    if m is None or m.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    m.status = "active"
    m.signed_at = datetime.utcnow()
    _emit_mandate(db, m, events.MANDATE_SIGNED)
    db.commit()
    return _mandate_dict(m)


@app.get("/internal/mandates/{mandate_id}", include_in_schema=False)
def internal_mandate(mandate_id: int, x_internal_token: str = Header(default=""),
                     db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    m = db.get(Mandate, mandate_id)
    return {"mandate": _mandate_dict(m) if m else None}
```

- [ ] **Step 3: Ajouter le helper `_parse_dt`** (après `_reference`)
```python
def _parse_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
```

- [ ] **Step 4: Lancer le service et vérifier santé + création (avec en-têtes BFF simulés)**

Lancer :
```bash
cd /home/younes/Documents/work/0semsar
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" \
  TRUST_GATEWAY_HEADERS=true INTERNAL_TOKEN=change-me-internal \
  RABBITMQ_URL="amqp://semsar:semsar@localhost:5672/" EVENTS_EXCHANGE=semsar.events \
  python3 -m uvicorn app.main:app --app-dir services/rental --host 127.0.0.1 --port 8518 &
sleep 4
curl -s http://localhost:8518/health
```
Expected: `{"status":"ok","service":"rental"}`.

Créer un mandat (en-têtes BFF : agence 1, feature `rental`) :
```bash
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates \
  -H 'Content-Type: application/json' \
  -H 'x-semsar-user-id: 1' -H 'x-semsar-agency-id: 1' -H 'x-semsar-features: rental' \
  -d '{"property_id":1,"landlord_client_id":1,"fee_percent":8,"mandate_type":"gestion"}'
```
Expected: JSON du mandat avec `reference` `MND-...`, `status":"draft"`.

Vérifier l'événement outbox :
```bash
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "SELECT event_type FROM rental.outbox ORDER BY id DESC LIMIT 2;"
```
Expected: `rental.mandate.created`.

- [ ] **Step 5: Vérifier le gating (403 sans feature)**
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8518/backoffice/gestion-locative/mandates \
  -H 'Content-Type: application/json' -H 'x-semsar-user-id: 1' -H 'x-semsar-agency-id: 1' \
  -d '{"property_id":1,"landlord_client_id":1}'
```
Expected: `403`.

- [ ] **Step 6: Nettoyer le mandat de test + Commit**
```bash
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
git add services/rental/app/main.py
git commit -m "feat(rental): CRUD mandats de gestion + gating + événements mandate.*"
```

---

### Task 4: `main.py` — CRUD Bail + émission `lease.*`

**Files:**
- Modify: `services/rental/app/main.py`

**Interfaces:**
- Consumes: `models.Lease`, `models.Mandate`, `events.LEASE_CREATED`, `events.LEASE_SIGNED`.
- Produces: routes `GET/POST /backoffice/gestion-locative/leases`, `GET/PATCH .../leases/{id}`, `POST .../leases/{id}/sign`, `GET /internal/leases/{id}`. Helpers `_lease_dict(l)`, `_emit_lease(db, l, event_type)`.

- [ ] **Step 1: Helpers bail** (après `_emit_mandate`)
```python
def _lease_dict(l: Lease) -> dict:
    return {
        "id": l.id, "reference": l.reference, "mandate_id": l.mandate_id,
        "property_id": l.property_id, "tenant_client_id": l.tenant_client_id,
        "agency_id": l.agency_id, "rent_amount": num(l.rent_amount),
        "charges_amount": num(l.charges_amount), "deposit_amount": num(l.deposit_amount),
        "payment_day": l.payment_day, "start_date": iso(l.start_date), "end_date": iso(l.end_date),
        "irl_index_ref": l.irl_index_ref, "status": l.status, "signed_at": iso(l.signed_at),
        "notes": l.notes, "created_at": iso(l.created_at),
    }


def _emit_lease(db: Session, l: Lease, event_type: str) -> None:
    enqueue(db, "lease", l.id, event_type, {
        "id": l.id, "reference": l.reference, "mandate_id": l.mandate_id,
        "property_id": l.property_id, "tenant_client_id": l.tenant_client_id,
        "agency_id": l.agency_id, "rent_amount": num(l.rent_amount),
        "charges_amount": num(l.charges_amount), "deposit_amount": num(l.deposit_amount),
        "start_date": iso(l.start_date), "end_date": iso(l.end_date),
    })
```

- [ ] **Step 2: Routes CRUD baux** (même style que les mandats ; création exige un mandat de la même agence)
```python
@app.get("/backoffice/gestion-locative/leases")
def list_leases(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    q = db.query(Lease).filter(Lease.agency_id == principal.agency_id)
    return {"leases": [_lease_dict(l) for l in q.order_by(Lease.created_at.desc()).all()]}


@app.get("/backoffice/gestion-locative/leases/{lease_id}")
def get_lease(lease_id: int, principal: Principal = Depends(get_principal),
              db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    return _lease_dict(l)


@app.post("/backoffice/gestion-locative/leases", status_code=201)
async def create_lease(request: Request, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    data = await json_body(request)
    mandate = db.get(Mandate, data.get("mandate_id"))
    if mandate is None or mandate.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    if not data.get("tenant_client_id") or data.get("rent_amount") is None:
        return err("tenant_client_id et rent_amount sont requis.", 400)
    l = Lease(
        reference=_reference("BAIL"), mandate_id=mandate.id, property_id=mandate.property_id,
        tenant_client_id=data["tenant_client_id"], agency_id=principal.agency_id,
        rent_amount=data["rent_amount"], charges_amount=data.get("charges_amount", 0),
        deposit_amount=data.get("deposit_amount", 0), payment_day=data.get("payment_day", 1),
        start_date=_parse_dt(data.get("start_date")), end_date=_parse_dt(data.get("end_date")),
        irl_index_ref=data.get("irl_index_ref"), notes=data.get("notes"),
    )
    db.add(l)
    db.flush()
    _emit_lease(db, l, events.LEASE_CREATED)
    db.commit()
    return _lease_dict(l)


@app.patch("/backoffice/gestion-locative/leases/{lease_id}")
async def update_lease(lease_id: int, request: Request,
                       principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    data = await json_body(request)
    for field in ("rent_amount", "charges_amount", "deposit_amount", "payment_day",
                  "irl_index_ref", "notes"):
        if field in data:
            setattr(l, field, data[field])
    if "start_date" in data:
        l.start_date = _parse_dt(data["start_date"])
    if "end_date" in data:
        l.end_date = _parse_dt(data["end_date"])
    db.commit()
    return _lease_dict(l)


@app.post("/backoffice/gestion-locative/leases/{lease_id}/sign")
def sign_lease(lease_id: int, principal: Principal = Depends(get_principal),
               db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    l.status = "active"
    l.signed_at = datetime.utcnow()
    _emit_lease(db, l, events.LEASE_SIGNED)
    db.commit()
    return _lease_dict(l)


@app.get("/internal/leases/{lease_id}", include_in_schema=False)
def internal_lease(lease_id: int, x_internal_token: str = Header(default=""),
                   db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    l = db.get(Lease, lease_id)
    return {"lease": _lease_dict(l) if l else None}
```

- [ ] **Step 3: Redémarrer, créer un mandat puis un bail, vérifier events**
```bash
cd /home/younes/Documents/work/0semsar
fuser -k 8518/tcp 2>/dev/null; sleep 1
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" \
  TRUST_GATEWAY_HEADERS=true INTERNAL_TOKEN=change-me-internal \
  RABBITMQ_URL="amqp://semsar:semsar@localhost:5672/" EVENTS_EXCHANGE=semsar.events \
  python3 -m uvicorn app.main:app --app-dir services/rental --host 127.0.0.1 --port 8518 & sleep 4
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
MID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates $H -d '{"property_id":1,"landlord_client_id":1,"fee_percent":8}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases $H -d "{\"mandate_id\":$MID,\"tenant_client_id\":2,\"rent_amount\":4500,\"charges_amount\":300,\"payment_day\":5}"
echo
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases/1/sign $H
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "SELECT event_type FROM rental.outbox ORDER BY id;"
```
Expected: JSON bail (`reference` `BAIL-...`), puis bail signé (`status":"active"`), et outbox = `rental.mandate.created`, `rental.lease.created`, `rental.lease.signed`.

- [ ] **Step 4: Nettoyer + Commit**
```bash
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.lease; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
git add services/rental/app/main.py
git commit -m "feat(rental): CRUD baux + événements lease.*"
```

---

### Task 5: Relais outbox + worker (projection PropertyRO/ClientRO)

**Files:**
- Create: `services/rental/app/relay.py`
- Create: `services/rental/app/worker.py`

**Interfaces:**
- Consumes: `db.SessionLocal`, `db.init_db`, `models.PropertyRO`, `models.ClientRO`, `models.ProcessedMessage`.
- Produces: `python -m app.relay`, `python -m app.worker` (bindings `listing.#`, `crm.client.#`).

- [ ] **Step 1: `app/relay.py`** (calque exact de `services/transactions/app/relay.py`)
```python
"""Relais outbox → RabbitMQ du service rental — boucle résiliente (reconnexion auto).

    python -m app.relay
"""
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

- [ ] **Step 2: `app/worker.py`** (maintient PropertyRO via listing.*, ClientRO via crm.client.* si émis)
```python
"""Consumer rental — maintient property_ro (titre/ville) via listing.* et client_ro (nom/email)
via crm.client.* pour l'affichage back-office.

    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import ClientRO, ProcessedMessage, PropertyRO


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "listing.deleted":
            ro = db.get(PropertyRO, payload.get("id"))
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            pid = payload.get("id")
            ro = db.get(PropertyRO, pid) or PropertyRO(id=pid)
            ro.title = payload.get("title")
            ro.city = payload.get("city")
            db.add(ro)
        elif routing_key in ("crm.client.created", "crm.client.updated"):
            cid = payload.get("id")
            ro = db.get(ClientRO, cid) or ClientRO(id=cid)
            ro.first_name = payload.get("first_name")
            ro.last_name = payload.get("last_name")
            ro.email = payload.get("email")
            ro.client_type = payload.get("client_type")
            db.add(ro)
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url, service_name=settings.service_name,
        bindings=["listing.#", "crm.client.#"], exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
```
> Note : `crm` n'émet pas encore d'événements `crm.client.*` (cf. `transactions` : ClientRO amorcée à la migration). Le binding est prêt ; en attendant, `client_ro` peut rester vide — le chemin **email** ne dépend pas de cette projection (résolu par notification via crm). Pas de tâche de migration ClientRO en Phase 1.

- [ ] **Step 3: Vérifier le relais (publie un événement en attente)**
```bash
cd /home/younes/Documents/work/0semsar
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" \
  RABBITMQ_URL="amqp://semsar:semsar@localhost:5672/" EVENTS_EXCHANGE=semsar.events \
  PYTHONPATH=services/rental timeout 6 python3 -m app.relay &
sleep 6
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "SELECT count(*) FROM rental.outbox WHERE published_at IS NULL;"
```
Expected: `0` (tout publié) — ou pas d'erreur de connexion RabbitMQ dans les logs.

- [ ] **Step 4: Commit**
```bash
git add services/rental/app/relay.py services/rental/app/worker.py
git commit -m "feat(rental): relais outbox + worker (projections property_ro/client_ro)"
```

---

### Task 6: Câblage BFF (config + route)

**Files:**
- Modify: `gateway/app/config.py` (ajouter `rental_url`)
- Modify: `gateway/app/main.py` (état + route)

**Interfaces:**
- Consumes: `settings.rental_url`.
- Produces: route BFF `/api/v1/backoffice/gestion-locative/*` → `rental` (préfixe `/api/v1` retiré).

- [ ] **Step 1: Ajouter `rental_url` à la config** — dans `gateway/app/config.py`, à côté de `transactions_url`
```python
    rental_url: str | None = None
```

- [ ] **Step 2: Enregistrer le client + la route** — dans `gateway/app/main.py`

Près de `app.state.transactions = _client_or_none(settings.transactions_url)` :
```python
    app.state.rental = _client_or_none(settings.rental_url)
```
Ajouter `app.state.rental` à la liste de fermeture des clients (là où `app.state.transactions` est listé).

Dans la fonction de résolution de route (près du bloc `path.startswith("/api/v1/backoffice/transactions")`) :
```python
    if settings.rental_url and path.startswith("/api/v1/backoffice/gestion-locative"):
        return app.state.rental, path.replace("/api/v1", "", 1)
```

- [ ] **Step 3: Lancer le BFF avec `RENTAL_URL` et vérifier le passage**
```bash
cd /home/younes/Documents/work/0semsar
fuser -k 8099/tcp 2>/dev/null; sleep 1
env UPSTREAM_URL=http://localhost:7000 JWT_SECRET_KEY=PURGED-DEV-SECRET \
  INTERNAL_TOKEN=change-me-internal RENTAL_URL=http://localhost:8518 \
  python3 -m uvicorn app.main:app --app-dir gateway --host 127.0.0.1 --port 8099 & sleep 4
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8099/api/v1/backoffice/gestion-locative/mandates \
  -H 'x-semsar-user-id: 1'
```
Expected: `401` ou `403` (le BFF exige un JWT/feature) — **pas** `404` (preuve que la route est mappée vers `rental`).

- [ ] **Step 4: Commit**
```bash
git add gateway/app/config.py gateway/app/main.py
git commit -m "feat(gateway): router /backoffice/gestion-locative vers le service rental"
```

---

### Task 7: Gating d'abonnement `has_rental`

**Files:**
- Modify: `services/billing/app/models.py` (colonne `has_rental`)
- Modify: `services/billing/app/main.py` (exposer `has_rental` dans le dict plan)
- Modify: `services/billing/app/seed.py` (pro/enterprise = True)
- Create: `services/identity/db/add_rental_feature.sql` (projection dev de la feature)

**Interfaces:**
- Consumes: `SubscriptionPlan.has_rental`.
- Produces: la feature `rental` présente dans `identity.agency_ro.features` (claims JWT) → `principal.features`.

- [ ] **Step 1: Colonne modèle** — dans `services/billing/app/models.py`, à côté de `has_artisans`
```python
    has_rental = Column(Boolean, default=False)
```

- [ ] **Step 2: Exposer dans le dict plan** — dans `services/billing/app/main.py`, ligne du dict plan (à côté de `"has_artisans": p.has_artisans,`)
```python
        "has_rental": p.has_rental,
```

- [ ] **Step 3: Seed** — dans `services/billing/app/seed.py`, ajouter `"has_rental"` à chaque plan (starter False, pro/enterprise True)
```python
    {"slug": "starter", "name": "Starter", "price": 0, "max_seats": 1,
     "has_contracts": False, "has_legal": False, "has_artisans": False, "has_rental": False},
    {"slug": "pro", "name": "Pro", "price": 499, "max_seats": 5,
     "has_contracts": True, "has_legal": True, "has_artisans": True, "has_rental": True},
    {"slug": "enterprise", "name": "Entreprise", "price": 1499, "max_seats": -1,
     "has_contracts": True, "has_legal": True, "has_artisans": True, "has_rental": True},
```

- [ ] **Step 4: Migration colonne + backfill plans (dev DB)**
```bash
cd /home/younes/Documents/work/0semsar
PGPASSWORD=billing psql -h localhost -U billing -d semsar_dev -c "
ALTER TABLE billing.subscription_plan ADD COLUMN IF NOT EXISTS has_rental boolean DEFAULT false;
UPDATE billing.subscription_plan SET has_rental = true WHERE slug IN ('pro','enterprise');"
```
Expected: `ALTER TABLE` + `UPDATE 2`.

- [ ] **Step 5: Projection dev de la feature `rental`** — `services/identity/db/add_rental_feature.sql` (patron du bloc idempotent `contract_templates` existant)
```sql
-- Projette la feature `rental` dans identity.agency_ro.features pour les agences dont le plan a
-- has_rental (billing ne pilote pas encore les features en live). Idempotent.
UPDATE identity.agency_ro ar
SET features = (
    SELECT jsonb_agg(DISTINCT f) FROM jsonb_array_elements_text(ar.features || '["rental"]'::jsonb) f
)
WHERE ar.id IN (
    SELECT s.agency_id FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE p.has_rental
);
```
Appliquer :
```bash
PGPASSWORD=identity psql -h localhost -U identity -d semsar_dev -f services/identity/db/add_rental_feature.sql
```
> Note : si `public.subscriptions`/`subscription_plans` (tables monolithe) n'existent plus en dev, projeter directement : `UPDATE identity.agency_ro SET features = (SELECT jsonb_agg(DISTINCT f) FROM jsonb_array_elements_text(features || '["rental"]'::jsonb) f) WHERE id = 1;` (agence de test 1).

- [ ] **Step 6: Vérifier qu'un token d'agence pro porte la feature `rental`**
```bash
PGPASSWORD=identity psql -h localhost -U identity -d semsar_dev -c "SELECT id, features FROM identity.agency_ro WHERE features @> '[\"rental\"]' LIMIT 3;"
```
Expected: au moins l'agence 1 avec `rental` dans `features`.

- [ ] **Step 7: Commit**
```bash
git add services/billing/app/models.py services/billing/app/main.py services/billing/app/seed.py services/identity/db/add_rental_feature.sql
git commit -m "feat(billing): flag de plan has_rental + projection de la feature rental (gating)"
```

---

### Task 8: Intégration `dev-mesh-up.sh`

**Files:**
- Modify: `scripts/dev-mesh-up.sh`

**Interfaces:**
- Produces: `rental` démarré (uvicorn 8518 + relay + worker), santé vérifiée dans le mesh.

- [ ] **Step 1: Ajouter le service à la liste `SVCS`** — dans `scripts/dev-mesh-up.sh`, ajouter `rental:8518` à la variable `SVCS`, et son `extra` (dépendances) dans le `case "$svc"` :
```bash
    rental) extra="IDENTITY_URL=http://localhost:8501 CRM_URL=http://localhost:8013 LISTING_URL=http://localhost:8012";;
```

- [ ] **Step 2: Ajouter relay + worker** — dans les boucles de la section « Mesh événementiel » :
  - ajouter `rental` à la liste des `relay` : `for r in listing catalog identity contract payment billing transactions programs agency crm directory rental; do relay "$r"; done`
  - ajouter `rental` à la liste des `worker` : `for w in search crm marketplace geo agency messaging analytics billing notification identity audit transactions legal contract rental; do worker "$w"; done`

- [ ] **Step 3: Ajouter au bloc santé (§6)** — ajouter `rental:8518` à la liste des endpoints vérifiés.

- [ ] **Step 4: Relancer le mesh et vérifier la santé de `rental`**
```bash
cd /home/younes/Documents/work/0semsar
bash scripts/dev-mesh-up.sh 2>&1 | grep -E "rental|== 6"
```
Expected: ligne `rental -> 200`.

- [ ] **Step 5: Commit**
```bash
git add scripts/dev-mesh-up.sh
git commit -m "chore(mesh): démarrer le service rental (uvicorn + relay + worker)"
```

---

### Task 9: Emails « mandat signé » + « bail signé »

**Files:**
- Modify: `services/notification/app/worker.py` (bindings + routage)
- Modify: `services/notification/app/handlers.py` (handlers)
- Create: `services/notification/app/templates/mandate_signed.html`
- Create: `services/notification/app/templates/lease_signed.html`
- Create: `frontend/public/email-icons/handshake.png` (nouveau) — `file-check.png` existe déjà.

**Interfaces:**
- Consumes: `rental.mandate.signed`, `rental.lease.signed` (payloads de Task 3/4) ; `recipients.client(id)`, `recipients.agency(id)` ; `_try_send`, `_contact`, `_valid_email`.
- Produces: emails `mandate_signed` (propriétaire) et `lease_signed` (locataire + propriétaire).

- [ ] **Step 1: Générer l'icône `handshake.png`** (style 52px stroke #334155, cf. icônes existantes)
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m11 17 2 2a1 1 0 1 0 3-3\"/><path d=\"m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4\"/><path d=\"m21 3 1 11h-2\"/><path d=\"M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3\"/><path d=\"M3 4h8\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/handshake.png', output_width=52, output_height=52)
print('generated handshake.png')
"
ls -la frontend/public/email-icons/handshake.png frontend/public/email-icons/file-check.png
```
Expected: les deux fichiers présents (si `file-check.png` absent, le générer aussi avec le path lucide `file-check`).

- [ ] **Step 2: `mandate_signed.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Votre mandat de gestion est signé{% endblock %}
{% block preheader %}SemsarOut gère désormais votre bien — voici le récapitulatif de votre mandat.{% endblock %}
{% block badge %}{{ lucide("handshake") }}{% endblock %}
{% block hero_title %}Mandat de gestion signé{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, merci de votre confiance.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Votre mandat de gestion est désormais actif. Notre équipe prend en charge la gestion locative de votre bien : recherche de locataire, quittancement, suivi et compte-rendu de gestion.</p>
{{ card(([("Référence", reference)] if reference else [])
  + ([("Type", "Gestion" if mandate_type == "gestion" else "Location")] if mandate_type else [])
  + ([("Honoraires", (fee_percent|string) ~ " %")] if fee_percent else [])) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Une question sur votre mandat&nbsp;? Écrivez-nous à <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 3: `lease_signed.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Votre bail est signé{% endblock %}
{% block preheader %}Bienvenue — voici le récapitulatif de votre bail SemsarOut.{% endblock %}
{% block badge %}{{ lucide("file-check") }}{% endblock %}
{% block hero_title %}Bail signé{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, votre location est confirmée.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Votre bail est désormais actif{% if property_title %} pour <strong>{{ property_title }}</strong>{% endif %}. Voici les principales conditions.</p>
{{ card(([("Bien", property_title)] if property_title else [])
  + [("Loyer", ("{:,.0f}".format(rent_amount|float).replace(",", " ")) ~ " " ~ currency)]
  + ([("Charges", ("{:,.0f}".format(charges_amount|float).replace(",", " ")) ~ " " ~ currency)] if charges_amount else [])
  + ([("Dépôt de garantie", ("{:,.0f}".format(deposit_amount|float).replace(",", " ")) ~ " " ~ currency)] if deposit_amount else [])) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Votre première quittance vous parviendra après le premier règlement. Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 4: Handlers** — dans `services/notification/app/handlers.py`, ajouter (près des autres `_handle_*`)
```python
def _handle_mandate_signed(db, payload):
    """rental.mandate.signed → email récap au propriétaire bailleur."""
    landlord = recipients.client(payload.get("landlord_client_id"))
    to = (landlord.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "mandate_signed.html", "mandate_signed", from_email=_contact(),
              name=landlord.get("name"), reference=payload.get("reference"),
              mandate_type=payload.get("mandate_type"), fee_percent=payload.get("fee_percent"))


def _handle_lease_signed(db, payload):
    """rental.lease.signed → email récap au locataire (et au propriétaire via le mandat)."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    prop = recipients.property_title(payload.get("property_id")) if hasattr(recipients, "property_title") else None
    if _valid_email(to):
        _try_send(db, to, "lease_signed.html", "lease_signed", from_email=_contact(),
                  name=tenant.get("name"), property_title=prop,
                  rent_amount=payload.get("rent_amount"), charges_amount=payload.get("charges_amount"),
                  deposit_amount=payload.get("deposit_amount"))
```
> `recipients.client` renvoie `{id, email, name}` (helper existant). `property_title` n'existe pas encore : passer `property_title=None` (le gabarit gère l'absence). Ne pas appeler `recipients.property_title` — remplacer la ligne `prop = ...` par `prop = None` pour la Phase 1.

Corriger la ligne dans `_handle_lease_signed` :
```python
    prop = None  # titre du bien : projeté en Phase 2 (property_ro) ; absent = géré par le gabarit
```

- [ ] **Step 5: Router les événements** — dans `handlers.py`, la fonction `handle_event` : ajouter
```python
    elif event_type == "rental.mandate.signed":
        _handle_mandate_signed(db, payload)
    elif event_type == "rental.lease.signed":
        _handle_lease_signed(db, payload)
```
Et vérifier que `recipients` est bien importé en tête de `handlers.py` (il l'est déjà via `from . import recipients` ou équivalent ; sinon l'ajouter).

- [ ] **Step 6: Bindings worker** — dans `services/notification/app/worker.py`, ajouter à la liste `bindings` : `"rental.mandate.signed"`, `"rental.lease.signed"`.

- [ ] **Step 7: Test E2E email** — seed un `crm.Client` propriétaire avec email +addressé, signer un mandat, vérifier `notification_log`
```bash
cd /home/younes/Documents/work/0semsar
# 1) seed client propriétaire (id capturé)
CID=$(PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -tAc "INSERT INTO crm.client (first_name,last_name,email,client_type,agency_id,created_at,updated_at) VALUES ('Test','Bailleur','nciriyounes2005+landlord@gmail.com','landlord',1,now(),now()) RETURNING id;")
# 2) redémarrer worker notification + relay rental (via mesh déjà lancé), signer un mandat
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
MID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates $H -d "{\"property_id\":1,\"landlord_client_id\":$CID,\"fee_percent\":8}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates/$MID/sign $H >/dev/null
sleep 8
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "SELECT recipient,template,status FROM notification.notification_log WHERE template='mandate_signed' ORDER BY created_at DESC LIMIT 1;"
```
Expected: `nciriyounes2005+landlord@gmail.com | mandate_signed | sent`.

- [ ] **Step 8: Nettoyer les données de test**
```bash
PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -c "DELETE FROM crm.client WHERE email='nciriyounes2005+landlord@gmail.com';"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "DELETE FROM notification.notification_log WHERE recipient='nciriyounes2005+landlord@gmail.com';"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
```

- [ ] **Step 9: Commit**
```bash
git add services/notification/app/worker.py services/notification/app/handlers.py services/notification/app/templates/mandate_signed.html services/notification/app/templates/lease_signed.html frontend/public/email-icons/handshake.png
git commit -m "feat(notification): emails mandat signé + bail signé (rental.*)"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/emails/catalogue-emails.md` (statuts §1/§3 concernés → ✅ pour bail/mandat signés)
- Modify: `docs/architecture-v2-status.md` (ajouter le service `rental` au tableau des services)

- [ ] **Step 1: Catalogue** — passer « Mandat de gestion signé » et « Bail signé » à ✅ (Phase 1 faite), noter les autres emails gestion locative « Phase 2/3 (planifié) ».

- [ ] **Step 2: Statut archi** — ajouter une ligne au tableau des services :
```
| rental | 8518 | gestion locative (mandats, baux ; quittancement/CRG à venir) |
```

- [ ] **Step 3: Commit**
```bash
git add docs/emails/catalogue-emails.md docs/architecture-v2-status.md
git commit -m "docs(rental): statut Phase 1 (mandats/baux + emails signés)"
```

---

## Self-Review

**Spec coverage (Phase 1 uniquement)** — la spec §14 définit la Phase 1 = « service, schéma, Mandate/Lease,
CRUD back-office, gating has_rental, BFF, events mandate.*/lease.*, projections RO ; emails : bail signé,
mandat signé ». Couverture : service+schéma (T1), modèles+RO (T2), CRUD mandat (T3), CRUD bail (T4),
relay+worker/RO (T5), BFF (T6), gating (T7), mesh (T8), emails signés (T9), docs (T10). ✅ Complet pour la Phase 1.
Les entités RentPeriod/ChargeRegularization/candidature, PDF, UI, et les autres emails sont explicitement
Phases 2-5 (plans séparés).

**Placeholder scan** — aucun « TBD/TODO ». La seule zone d'incertitude (titre du bien dans lease_signed)
est tranchée explicitement : `property_title=None` en Phase 1, projeté en Phase 2. Le fallback SQL de la
projection de feature (T7 step 5) couvre l'absence des tables monolithe en dev.

**Type consistency** — `_emit_mandate`/`_emit_lease` produisent les mêmes clés que celles lues par
`_handle_mandate_signed`/`_handle_lease_signed` (`reference`, `mandate_type`, `fee_percent`,
`landlord_client_id` ; `tenant_client_id`, `rent_amount`, `charges_amount`, `deposit_amount`). Le gate
lit `principal.features` (liste) alimentée par `agency_ro.features` (T7). `recipients.client()` renvoie
`{id, email, name}` (existant, utilisé tel quel).

**Note d'exécution** — plusieurs tâches lancent des services en arrière-plan pour vérifier ; utiliser
l'exécution en tâche de fond suivie (le lancement direct `&` dans un appel shell ne survit pas à la fin
de l'appel). Idéalement, exécuter d'abord `bash scripts/dev-mesh-up.sh` une fois (après T8) pour disposer
du mesh complet, puis faire les vérifs curl/psql.
