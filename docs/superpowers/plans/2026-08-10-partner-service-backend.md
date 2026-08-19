# Service `partner` — Backend Implementation Plan (Plan 1/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le microservice `services/partner/` (FastAPI + SQLAlchemy + Pydantic + outbox) : entité partenaire + membership, auth double (session/membership + clé API), CRUD des ressources métier avec événements, clés API, webhooks + worker de livraison signée, reporting agrégé, seed de démo, suite pytest — testable en isolation via TestClient.

**Architecture:** Calqué sur `services/coloc-listing/` (skeleton main/db/models/schemas/events, `init_db`+outbox, `_require_tenant` mono-tenant, `get_principal`/`_uid`, `enqueue`). Autorisation par appartenance (`uid ∈ PartnerMember`) OU clé API (`X-Api-Key`). Schéma DB `partner`, port 8525. La plomberie gateway/mesh/CI et le front font l'objet des plans 2 et 3.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, Pydantic v2, `semsar_common`/`semsar_auth`/`semsar_events`, pytest + httpx (SQLite en test).

## Global Constraints

- Mono-tenant `m3a-l3achrane` : `_require_tenant` sur toutes les routes métier (403 sinon).
- Cloisonnement STRICT par `partner_id` sur toute lecture/écriture (un partenaire ne voit jamais un autre).
- Auth : dépendance `partner_ctx` → clé API (`X-Api-Key`) d'abord, sinon `get_principal`→membership ; 403 si ni l'un ni l'autre. Superadmin (`principal.is_superadmin`) peut cibler `?partner_id=`.
- Clés API : générées `secrets.token_urlsafe(32)`, stockées en `sha256` uniquement, `prefix` (8 car.) pour l'affichage, révocables ; le brut n'est renvoyé QU'À la création.
- Secrets webhook jamais re-sérialisés après création ; signatures HMAC via `hmac.compare_digest` (constant-temps).
- Devise stockée `MAD` (ISO). Pas de secret en dur. Commits Conventional Commits, PAS d'attribution IA.
- Enums stockés en `String`, validés en Pydantic (patron coloc-listing `_validate`).
- Gate service : `cd services/partner && python -m pytest tests/ -v` vert (fixtures SQLite, pas de Postgres requis).

---

## Task 1: Scaffold du service (structure + config + health + tests infra)

**Files:**
- Create: `services/partner/pyproject.toml`, `services/partner/.env.example`, `services/partner/README.md`
- Create: `services/partner/app/__init__.py`, `services/partner/app/db.py`, `services/partner/app/events.py`, `services/partner/app/main.py`
- Create: `services/partner/db/schema.sql`
- Create: `services/partner/tests/conftest.py`, `services/partner/tests/test_health.py`

**Interfaces:**
- Produces: app FastAPI (`app.main:app`), `Base`/`get_db`/`init_db` (`app.db`), fixtures `client`/`db_session`/`headers` (conftest), `TENANT="m3a-l3achrane"`.

- [ ] **Step 1: pyproject.toml** (copier `services/coloc-listing/pyproject.toml`, remplacer le nom) :
```toml
[project]
name = "semsar-partner"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi", "uvicorn[standard]", "prometheus-fastapi-instrumentator",
  "SQLAlchemy>=2.0", "psycopg[binary]",
  "semsar-common", "semsar-auth", "semsar-events",
]
[project.optional-dependencies]
test = ["pytest>=8.0", "httpx>=0.27"]
[tool.setuptools]
packages = ["app"]
```

- [ ] **Step 2: `.env.example`** (copier coloc-listing, `SERVICE_NAME=partner`, `DATABASE_URL=postgresql+psycopg://partner:partner@localhost:5432/semsar_dev`).

- [ ] **Step 3: `db/schema.sql`** (rôle+schéma dédiés, ADR-0002) :
```sql
CREATE ROLE partner LOGIN PASSWORD 'partner';
CREATE SCHEMA IF NOT EXISTS partner AUTHORIZATION partner;
ALTER ROLE partner SET search_path = partner;
GRANT ALL ON SCHEMA partner TO partner;
```

- [ ] **Step 4: `app/db.py`** (copier coloc-listing/app/db.py en remplaçant le défaut) :
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from semsar_common import get_settings
_settings = get_settings()
_engine = create_engine(
    _settings.database_url or "postgresql+psycopg://partner:partner@localhost:5432/semsar",
    future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()

def init_db() -> None:
    from semsar_events import OutboxBase
    Base.metadata.create_all(_engine)
    OutboxBase.metadata.create_all(_engine)

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 5: `app/events.py`** (constantes de routing keys) :
```python
AFFILIE_CREATED = "partner.affilie_created"
VERIFICATION_DECIDED = "partner.verification_decided"
RESERVATION_CREATED = "partner.reservation_created"
RESERVATION_RELEASED = "partner.reservation_released"
GRANT_PAID = "partner.grant_paid"
INVOICE_SENT = "partner.invoice_sent"
WEBHOOK_TEST = "partner.test"
```

- [ ] **Step 6: `app/main.py`** — ossature (copier l'en-tête coloc-listing) : imports, `settings`, `setup_logging`, `TENANT`, `_require_tenant`+`_TenantForbidden`+handler, `router = APIRouter(dependencies=[Depends(_require_tenant)])`, `lifespan`(init_db), `app`, `install_legacy_error_handlers`, tracing best-effort, `Instrumentator`, `_err`, `/health`, et `app.include_router(router)` à la fin. (Les routes métier arrivent aux tâches suivantes.)

- [ ] **Step 7: `tests/conftest.py`** (copier coloc-listing/tests/conftest.py) : `TRUST_GATEWAY_HEADERS=true`, compile BigInteger→INTEGER sur SQLite, `db_session`(SQLite tmp + create_all Base+OutboxBase), `client`(TestClient + override get_db), `headers(user_id=7, *, superadmin=False, tenant="m3a-l3achrane")`.

- [ ] **Step 8: `tests/test_health.py`** :
```python
def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
```

- [ ] **Step 9: Lancer → vert + commit**

Run: `cd services/partner && python -m pytest tests/ -v`
Expected: PASS.
```bash
git add services/partner
git commit -m "feat(partner): scaffold du service (skeleton, db, config, health)"
```

---

## Task 2: Modèles Partner/PartnerMember/ApiKey + auth `partner_ctx`

**Files:**
- Create: `services/partner/app/models.py` (Partner, PartnerMember, ApiKey pour l'instant)
- Create: `services/partner/app/auth.py` (dépendance `partner_ctx`)
- Test: `services/partner/tests/test_auth.py`

**Interfaces:**
- Produces:
  - `Partner(id:str, name, type, tenant, created_at)`, `PartnerMember(id, partner_id, user_id:int, role, created_at)`, `ApiKey(id, partner_id, label, prefix, key_hash, last_used_at, created_at, revoked_at)`.
  - `hash_key(raw:str)->str` (sha256 hex), `PartnerCtx(partner_id:str, mode:str)`, dépendance `partner_ctx(request, db) -> PartnerCtx` (403 si non résolu).
  - Helper `_uid(principal)->int|None`.

- [ ] **Step 1: Test (rouge)** — `tests/test_auth.py` :
```python
from app.models import Partner, PartnerMember, ApiKey
from app.auth import hash_key

def _seed_partner(db, uid=7):
    p = Partner(name="Univ Demo", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush()
    db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER"))
    db.commit()
    return p

def test_member_can_access(client, db_session, headers):
    p = _seed_partner(db_session, uid=7)
    r = client.get("/partner/me", headers=headers(user_id=7))
    assert r.status_code == 200
    assert r.json()["id"] == p.id

def test_non_member_forbidden(client, db_session, headers):
    _seed_partner(db_session, uid=7)
    r = client.get("/partner/me", headers=headers(user_id=999))
    assert r.status_code == 403

def test_api_key_auth(client, db_session, headers):
    p = _seed_partner(db_session, uid=7)
    raw = "demo-raw-key"
    db_session.add(ApiKey(partner_id=p.id, label="k", prefix=raw[:8], key_hash=hash_key(raw)))
    db_session.commit()
    r = client.get("/partner/me", headers={"x-api-key": raw, "x-semsar-tenant": "m3a-l3achrane"})
    assert r.status_code == 200
    assert r.json()["id"] == p.id
```

- [ ] **Step 2: Lancer → échec** (`python -m pytest tests/test_auth.py -v` → import/route manquants).

- [ ] **Step 3: `app/models.py`** — Partner/PartnerMember/ApiKey avec `to_dict()` (ApiKey.to_dict N'expose PAS `key_hash` ; expose `prefix`, `label`, `last_used_at`, `revoked_at`). `id` = uuid str (`default=lambda: uuid4().hex`). Timestamps timezone-aware (`_now`).

- [ ] **Step 4: `app/auth.py`** :
```python
import hashlib
from dataclasses import dataclass
from fastapi import Depends, Request
from sqlalchemy.orm import Session
from semsar_auth import Principal, get_principal
from .db import get_db
from .models import ApiKey, PartnerMember

def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None

@dataclass
class PartnerCtx:
    partner_id: str
    mode: str  # "api_key" | "session"

class PartnerForbidden(Exception):
    pass

def partner_ctx(request: Request, db: Session = Depends(get_db)) -> PartnerCtx:
    raw = request.headers.get("x-api-key")
    if raw:
        key = db.query(ApiKey).filter(ApiKey.key_hash == hash_key(raw),
                                      ApiKey.revoked_at.is_(None)).first()
        if key is None:
            raise PartnerForbidden()
        key.last_used_at = _now(); db.commit()
        return PartnerCtx(partner_id=key.partner_id, mode="api_key")
    principal = get_principal(request)
    uid = _uid(principal)
    if uid is None:
        raise PartnerForbidden()
    member = db.query(PartnerMember).filter(PartnerMember.user_id == uid).first()
    if member is None:
        raise PartnerForbidden()
    return PartnerCtx(partner_id=member.partner_id, mode="session")
```
(Importer/définir `_now`. Enregistrer un exception handler `PartnerForbidden → 403` dans main.py, et une route `GET /partner/me` renvoyant `Partner.to_dict()`.)

- [ ] **Step 5: Câbler dans `main.py`** : handler `PartnerForbidden`, route `@router.get("/partner/me")` utilisant `ctx: PartnerCtx = Depends(partner_ctx)` → charge le `Partner` → `to_dict()`.

- [ ] **Step 6: Lancer → vert + commit**
```bash
git add services/partner
git commit -m "feat(partner): entité partenaire + membership + auth partner_ctx (session/clé API)"
```

---

## Task 3: Affiliés (CRUD + événement) — patron des ressources

**Files:**
- Modify: `services/partner/app/models.py` (Affilie), `app/schemas.py` (créer), `app/main.py` (routes)
- Test: `services/partner/tests/test_affilies.py`

**Interfaces:**
- Produces: `Affilie(id, partner_id, full_name, email, external_ref, status, created_at)` ; `AffilieCreateIn`/`AffilieUpdateIn` (Pydantic) ; routes `GET/POST /partner/affilies`, `PATCH /partner/affilies/{id}`. Émet `AFFILIE_CREATED`.
- Ce task fixe le PATRON réutilisé pour vérifications/réservations/subventions/factures : scope `partner_id = ctx.partner_id`, 404 si l'objet appartient à un autre partenaire.

- [ ] **Step 1: Test (rouge)** — `tests/test_affilies.py` :
```python
def _member(db, uid=7):
    from app.models import Partner, PartnerMember
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush(); db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER")); db.commit()
    return p

def test_create_and_list_affilie(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/affilies", headers=headers(7),
                    json={"full_name": "Sara B.", "email": "sara@x.ma"})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    lst = client.get("/partner/affilies", headers=headers(7)).json()
    assert any(a["id"] == aid and a["full_name"] == "Sara B." for a in lst)

def test_affilie_isolated_between_partners(client, db_session, headers):
    _member(db_session, 7)                    # partenaire A (user 7)
    _member(db_session, 8)                    # partenaire B (user 8)
    aid = client.post("/partner/affilies", headers=headers(7),
                      json={"full_name": "A", "email": "a@x.ma"}).json()["id"]
    # user 8 (autre partenaire) ne voit pas l'affilié de A
    assert all(a["id"] != aid for a in client.get("/partner/affilies", headers=headers(8)).json())
    assert client.patch(f"/partner/affilies/{aid}", headers=headers(8),
                        json={"status": "ACTIVE"}).status_code == 404
```

- [ ] **Step 2: Lancer → échec.**

- [ ] **Step 3: `Affilie` (models.py)** : colonnes + `to_dict()`. `status` défaut `PENDING`.

- [ ] **Step 4: `app/schemas.py`** :
```python
from pydantic import BaseModel, EmailStr, Field
AFFILIE_STATUSES = {"PENDING", "ACTIVE", "INACTIVE"}
class AffilieCreateIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    external_ref: str | None = Field(default=None, max_length=80)
class AffilieUpdateIn(BaseModel):
    full_name: str | None = None
    status: str | None = None   # validé contre AFFILIE_STATUSES dans la route
```

- [ ] **Step 5: Routes (main.py)** — helper de scope réutilisable :
```python
def _scoped(db, model, obj_id, ctx):
    obj = db.get(model, obj_id)
    return obj if obj is not None and obj.partner_id == ctx.partner_id else None
```
`GET /partner/affilies` (filtre `partner_id == ctx.partner_id`, tri created desc) ; `POST` (crée avec `partner_id=ctx.partner_id`, `enqueue(db,"partner",obj.id,events.AFFILIE_CREATED,{...})`, 201 + to_dict) ; `PATCH /{id}` (via `_scoped`, 404 si absent/autre partenaire, valide status).

- [ ] **Step 6: Lancer → vert + commit**
```bash
git add services/partner
git commit -m "feat(partner): ressource affiliés (CRUD + événement, cloisonnement partner_id)"
```

---

## Task 4: Vérifications, Réservations, Subventions, Factures

**Files:** Modify `app/models.py`, `app/schemas.py`, `app/main.py` ; Test `tests/test_verifications.py`, `test_reservations.py`, `test_grants.py`, `test_invoices.py`.

**Interfaces (modèles, tous avec `partner_id` + `to_dict()`) :**
- `Verification(id, partner_id, affilie_id, doc_type, status, note, submitted_at, decided_at, decided_by)` ; routes `GET/POST /partner/verifications`, `POST .../{id}/approve`, `POST .../{id}/reject`. `approve/reject` : `_scoped`, passe `status`, pose `decided_at`+`decided_by=ctx?`, émet `VERIFICATION_DECIDED`.
- `Reservation(id, partner_id, listing_id, affilie_id?, label, start_date, end_date, status)` ; `GET/POST /partner/reservations`, `POST .../{id}/release` (status→RELEASED, émet `RESERVATION_RELEASED`). POST émet `RESERVATION_CREATED`.
- `Grant(id, partner_id, program, affilie_id?, amount, currency, status)` ; `GET/POST /partner/grants`, `PATCH .../{id}` (status ; PAID → émet `GRANT_PAID`).
- `Invoice(id, partner_id, number, period, amount, currency, status, issued_at)` ; `GET/POST /partner/invoices`, `PATCH .../{id}` (status ; SENT → pose `issued_at`+émet `INVOICE_SENT`).

Chaque ressource suit le PATRON de la Task 3 (scope `partner_id`, `_scoped` pour les mutations, 404 cross-partenaire). Enums validés en Pydantic.

- [ ] **Step 1 (par ressource): Test (rouge)** — pour chaque ressource, un test : create+list scoped, une action d'état (approve/reject/release/PATCH) via `_scoped`, et l'isolation cross-partenaire (404). Ex. vérification :
```python
def test_verification_approve(client, db_session, headers):
    _member(db_session, 7)
    aid = client.post("/partner/affilies", headers=headers(7),
                      json={"full_name":"A","email":"a@x.ma"}).json()["id"]
    vid = client.post("/partner/verifications", headers=headers(7),
                      json={"affilie_id": aid, "doc_type": "CIN"}).json()["id"]
    r = client.post(f"/partner/verifications/{vid}/approve", headers=headers(7))
    assert r.status_code == 200 and r.json()["status"] == "APPROVED"
```

- [ ] **Step 2 (par ressource): modèle + schéma + routes** suivant le patron Task 3.

- [ ] **Step 3: Lancer chaque suite → vert.**

- [ ] **Step 4: Commit** (un commit par ressource, ou un commit groupé « ressources métier ») :
```bash
git add services/partner
git commit -m "feat(partner): vérifications, réservations, subventions, factures (CRUD + états + événements)"
```

---

## Task 5: Clés API (CRUD, show-once)

**Files:** Modify `app/main.py`, `app/schemas.py` ; Test `tests/test_api_keys.py`.

**Interfaces:** `GET /partner/api-keys` (liste, sans hash), `POST /partner/api-keys` (crée, renvoie le brut `key` UNE fois + prefix), `DELETE /partner/api-keys/{id}` (pose `revoked_at`).

- [ ] **Step 1: Test (rouge)** :
```python
def test_api_key_create_shows_raw_once_then_hashed(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/api-keys", headers=headers(7), json={"label": "CI"})
    assert r.status_code == 201
    body = r.json()
    assert body["key"] and body["prefix"] == body["key"][:8]   # brut présent à la création
    lst = client.get("/partner/api-keys", headers=headers(7)).json()
    assert all("key" not in k and "key_hash" not in k for k in lst)  # jamais re-exposé
    kid = lst[0]["id"]
    assert client.delete(f"/partner/api-keys/{kid}", headers=headers(7)).status_code == 200
```

- [ ] **Step 2: Route POST** : `raw = secrets.token_urlsafe(32)` ; stocke `ApiKey(prefix=raw[:8], key_hash=hash_key(raw), label=...)` ; renvoie `{**to_dict(), "key": raw}` (brut UNIQUEMENT ici). GET → liste `to_dict()` (sans key ni hash). DELETE → `revoked_at=_now()`.

- [ ] **Step 3: Lancer → vert + commit**
```bash
git commit -am "feat(partner): clés API (création show-once, hachées, révocables)"
```

---

## Task 6: Webhooks (CRUD + test signé) + worker de livraison

**Files:** Modify `app/models.py` (Webhook, WebhookDelivery), `app/schemas.py`, `app/main.py` ; Create `app/delivery.py` (signature + livraison pure, testable), `app/worker.py` (consommateur), `app/relay.py` (relais outbox, copier coloc-listing) ; Test `tests/test_webhooks.py`, `tests/test_delivery.py`.

**Interfaces:**
- `Webhook(id, partner_id, url, events:JSON, secret, active, created_at)` ; `WebhookDelivery(id, webhook_id, event_type, payload:JSON, status, attempts, last_attempt_at, response_code, created_at)`.
- Routes : `GET/POST/PATCH/DELETE /partner/webhooks`, `POST /partner/webhooks/{id}/test`.
- `app/delivery.py` : `sign(secret, body:bytes) -> str` (`"sha256=" + hmac_sha256_hex`) ; `deliver(webhook, event_type, payload, *, post) -> WebhookDeliveryResult` (POST signé via l'injectable `post`, retries backoff, renvoie statut/attempts). `post` injectable pour tester sans réseau.

- [ ] **Step 1: Test delivery (rouge, PUR, sans réseau)** — `tests/test_delivery.py` :
```python
import hmac, hashlib
from app.delivery import sign, deliver

def test_sign_hmac():
    assert sign("s3cr3t", b"body") == "sha256=" + hmac.new(b"s3cr3t", b"body", hashlib.sha256).hexdigest()

def test_deliver_retries_then_fails():
    calls = []
    def post(url, data, headers):          # simule 500 puis 500 puis 500
        calls.append(headers["X-Partner-Signature"]); return 500
    res = deliver({"url":"http://x","secret":"s"}, "partner.test", {"a":1}, post=post, max_attempts=3)
    assert res.status == "FAILED" and res.attempts == 3
    assert all(sig.startswith("sha256=") for sig in calls)

def test_deliver_succeeds_first_try():
    def post(url, data, headers): return 200
    res = deliver({"url":"http://x","secret":"s"}, "partner.test", {"a":1}, post=post, max_attempts=3)
    assert res.status == "DELIVERED" and res.attempts == 1
```

- [ ] **Step 2: `app/delivery.py`** — `sign` (HMAC hex) et `deliver` (boucle max_attempts, backoff — en test l'injectable `post` renvoie le code ; en prod `post` = httpx). Signature envoyée en en-tête `X-Partner-Signature` + `X-Partner-Event`. Retourne un dataclass `{status, attempts, response_code}`.

- [ ] **Step 3: Lancer test_delivery → vert.**

- [ ] **Step 4: Webhook CRUD + test signé** — Test `tests/test_webhooks.py` : create/list/patch/delete scoped par `partner_id` ; `POST /{id}/test` livre immédiatement un `partner.test` signé (via `deliver` avec un `post` mocké au niveau app/route en test, ou vérifie qu'une `WebhookDelivery` est créée). `secret` renvoyé UNIQUEMENT à la création. Implémenter les modèles + routes.

- [ ] **Step 5: `app/relay.py`** (copier coloc-listing/app/relay.py — `run_relay`) et `app/worker.py` (consomme les événements `partner.*`, pour chaque `Webhook` actif du partenaire abonné à l'event → `deliver` + persiste `WebhookDelivery`). Le worker est testé en unité sur sa fonction de dispatch (mapping event→webhooks→deliver), sans broker réel.

- [ ] **Step 6: Lancer suites → vert + commit**
```bash
git add services/partner
git commit -m "feat(partner): webhooks (CRUD + test signé) + worker de livraison HMAC avec retries"
```

---

## Task 7: Reporting agrégé + `/internal/stats`

**Files:** Modify `app/main.py` ; Test `tests/test_reporting.py`.

**Interfaces:** `GET /partner/reporting` (agrégats du partenaire du contexte) ; `GET /internal/stats?tenant=` (garde `x-internal-token`, patron coloc-listing) pour `backoffice_overview`.

- [ ] **Step 1: Test (rouge)** :
```python
def test_reporting_scoped(client, db_session, headers):
    _member(db_session, 7)
    client.post("/partner/affilies", headers=headers(7), json={"full_name":"A","email":"a@x.ma"})
    rep = client.get("/partner/reporting", headers=headers(7)).json()
    assert rep["affilies"]["total"] >= 1
    assert "verifications" in rep and "grants" in rep and "invoices" in rep

def test_internal_stats_requires_token(client):
    assert client.get("/internal/stats").status_code == 403
```

- [ ] **Step 2: Implémenter** `GET /partner/reporting` : compte affiliés par statut ; entonnoir vérifications (pending/approved/rejected + taux) ; réservations actives/libérées ; subventions (montant total + nombre par statut) ; factures (encours/payées) — TOUT filtré `partner_id == ctx.partner_id`. `GET /internal/stats` (`@app.get`, hors router tenant) : garde token, renvoie compteurs globaux (patron `coloc-listing/internal_stats`).

- [ ] **Step 3: Lancer → vert + commit**
```bash
git commit -am "feat(partner): reporting agrégé + /internal/stats"
```

---

## Task 8: Seed de démo + gate final

**Files:** Create `services/partner/app/seed_demo.py` ; run full suite.

- [ ] **Step 1: `seed_demo.py`** (patron `coloc-listing/app/seed_demo.py`) : 1 `Partner` de démo (« Université Hassan II ») + 1 `PartnerMember(user_id = <id du compte partenaire de démo>, role=OWNER)` — utiliser l'id du user `partenaire@m3a.ma` du seed identity, ou paramétrable — + quelques affiliés/vérifications/réservations/subventions/factures, idempotent (upsert par clé logique).

- [ ] **Step 2: Gate final**

Run: `cd services/partner && python -m pytest tests/ -v`
Expected: TOUTES les suites vertes.
```bash
git add services/partner
git commit -m "feat(partner): seed de démo (partenaire + membership + données)"
```

---

## Self-review coverage (spec → tâches)

- Modèle de données → T2 (Partner/Member/ApiKey), T3 (Affilie), T4 (Verification/Reservation/Grant/Invoice), T6 (Webhook/WebhookDelivery).
- Auth `partner_ctx` (session+clé API) + cloisonnement → T2, patron scope T3, isolation testée T3/T4.
- Sécurité clés API (hash, show-once, révocation) → T5. HMAC constant-temps + retries → T6.
- Événements outbox → T3/T4/T6. Worker livraison → T6. Reporting + /internal/stats → T7. Seed → T8. Mono-tenant `_require_tenant` → T1.
- HORS de ce plan (plans 2 & 3) : gateway `/api/v1/partner*` + config + backoffice_overview, dev-mesh/CI/ansible, et tout le frontend (services + écrans + reporting graphique + i18n).
