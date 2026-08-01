# Plan A — Tenant & auth M3a-L3achrane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comptes séparés par tenant (`semsar` | `m3a-l3achrane`) dans le service identity, résolution/rejet de tenant au BFF, et renommage du dossier front — première brique du branchement frontend ↔ backend.

**Architecture:** Le BFF résout le tenant de chaque requête (Host en prod, en-tête `x-tenant` en dev) et l'injecte en `x-semsar-tenant` vers les services ; identity scope inscription/login/refresh par tenant et embarque le claim `tenant` dans les JWT ; le BFF rejette tout jeton dont le claim ne correspond pas au tenant de la requête.

**Tech Stack:** FastAPI, SQLAlchemy, PyJWT, pytest (sqlite en tests unitaires), Vite (proxy front).

**Spec de référence :** `docs/superpowers/specs/2026-08-01-branchement-m3a-l3achrane-backend-design.md` (§4.2, §6, §9)

## Global Constraints

- Nommage : **`m3a-l3achrane` en entier partout** (tenant, en-têtes, cibles Makefile, dossiers) — jamais « m3a » seul.
- Valeurs de tenant : exactement `semsar` (défaut) et `m3a-l3achrane`.
- En-têtes : `x-tenant` (entrant, honoré uniquement en dev), `x-semsar-tenant` (interne, posé par le BFF seul, filtré s'il vient de l'extérieur comme tout `x-semsar-*`).
- Format d'erreur des services : `{"error": "<message>"}` (conservé à l'identique).
- Additif strict : aucune route ni réponse existante ne change pour le tenant `semsar` (anti-régression `tools/contract_test.py`).
- Aucun secret en dur ; `JWT_SECRET_KEY` vient de l'environnement.
- Commits : Conventional Commits, un commit par tâche, **sans** trailer d'attribution IA.

---

### Task 1: Renommage `frontend-m3a-l3chrane` → `frontend-m3a-l3achrane`

**Files:**
- Rename: `frontend-m3a-l3chrane/` → `frontend-m3a-l3achrane/` (git mv)
- Modify: `Makefile:2,19-29`
- Modify: `.gitignore` (référence au dossier)
- Modify: `docs/superpowers/specs/2026-07-31-m3a-l3achrane-frontend-design.md`, `docs/superpowers/plans/2026-07-31-m3a-l3achrane-frontend.md` (chemins)

**Interfaces:**
- Consumes: rien.
- Produces: le chemin `frontend-m3a-l3achrane/` et les cibles Makefile `m3a-l3achrane-install|dev|build|lint` utilisés par les tâches 5-6 et les plans B→F.

- [ ] **Step 1: Renommer le dossier**

```bash
cd /home/younes/Documents/work/0semsar
git mv frontend-m3a-l3chrane frontend-m3a-l3achrane
```

- [ ] **Step 2: Mettre à jour le Makefile (cibles + chemins)**

Remplacer les lignes 2 et 19-29 du `Makefile` par :

```makefile
.PHONY: infra-up infra-down libs-install gateway-run gateway-test m3a-l3achrane-install m3a-l3achrane-dev m3a-l3achrane-build m3a-l3achrane-lint
```

```makefile
m3a-l3achrane-install: ## Installe dépendances frontend-m3a-l3achrane
	cd frontend-m3a-l3achrane && npm install

m3a-l3achrane-dev:     ## Lance frontend-m3a-l3achrane sur :5610
	cd frontend-m3a-l3achrane && npm run dev

m3a-l3achrane-build:   ## Build frontend-m3a-l3achrane
	cd frontend-m3a-l3achrane && npm run build

m3a-l3achrane-lint:    ## Lint frontend-m3a-l3achrane
	cd frontend-m3a-l3achrane && npm run lint
```

- [ ] **Step 3: Mettre à jour .gitignore et les docs**

```bash
sed -i 's/frontend-m3a-l3chrane/frontend-m3a-l3achrane/g' \
  .gitignore \
  docs/superpowers/specs/2026-07-31-m3a-l3achrane-frontend-design.md \
  docs/superpowers/plans/2026-07-31-m3a-l3achrane-frontend.md
grep -rn "l3chrane" Makefile .gitignore docs/superpowers | grep -v "frontend-m3a-l3achrane" || echo "OK aucun reliquat"
```

Expected: `OK aucun reliquat` (les diffs `.superpowers/sdd/` sont des archives d'exécution, on n'y touche pas).

- [ ] **Step 4: Vérifier que le front marche toujours**

```bash
make m3a-l3achrane-lint && make m3a-l3achrane-build
```

Expected: lint 0 warning, build Vite OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(m3a-l3achrane): renommage du dossier front (orthographe l3achrane)"
```

---

### Task 2: Colonne `tenant` + unicité (tenant, email) dans identity

**Files:**
- Modify: `services/identity/app/models.py:94-122` (classe `UserRO`)
- Create: `services/identity/db/add_tenant.sql`
- Create: `services/identity/tests/conftest.py`
- Test: `services/identity/tests/test_tenant_model.py`

**Interfaces:**
- Consumes: `UserRO`, `Base`, `get_db` existants (`services/identity/app/{models,db}.py`).
- Produces: `UserRO.tenant: str` (défaut `"semsar"`), contrainte `uq_user_ro_tenant_email UNIQUE (tenant, email)`, et le conftest pytest (fixtures `db_session`, `client`) réutilisé par la tâche 3.

- [ ] **Step 1: Créer le conftest (même patron que `services/listing/tests/conftest.py`)**

`services/identity/tests/conftest.py` :

```python
import os

os.environ.setdefault("JWT_SECRET_KEY", "test-secret")  # lu à l'import de app.auth

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import BigInteger, create_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from semsar_events import OutboxBase  # noqa: E402

from app import models  # noqa: E402,F401 — enregistre les tables
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    # SQLite ne reconnaît l'auto-incrément rowid que sur un type "INTEGER" exact.
    return "INTEGER"


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 2: Écrire le test qui échoue**

`services/identity/tests/test_tenant_model.py` :

```python
import pytest
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from app.models import UserRO


def _user(email: str, tenant: str | None = None) -> UserRO:
    kwargs = dict(email=email, password_hash=generate_password_hash("x"),
                  first_name="A", last_name="B")
    if tenant is not None:
        kwargs["tenant"] = tenant
    return UserRO(**kwargs)


def test_tenant_default_semsar(db_session):
    db_session.add(_user("a@ex.ma"))
    db_session.commit()
    assert db_session.query(UserRO).filter_by(email="a@ex.ma").one().tenant == "semsar"


def test_same_email_two_tenants_ok(db_session):
    db_session.add(_user("dup@ex.ma", "semsar"))
    db_session.add(_user("dup@ex.ma", "m3a-l3achrane"))
    db_session.commit()  # ne doit PAS lever
    assert db_session.query(UserRO).filter_by(email="dup@ex.ma").count() == 2


def test_same_email_same_tenant_rejected(db_session):
    db_session.add(_user("uniq@ex.ma", "m3a-l3achrane"))
    db_session.commit()
    db_session.add(_user("uniq@ex.ma", "m3a-l3achrane"))
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 3: Vérifier l'échec**

```bash
cd services/identity && python -m pytest tests/test_tenant_model.py -v
```

Expected: FAIL — `TypeError: 'tenant' is an invalid keyword argument for UserRO` (ou `AttributeError` sur `.tenant`).

- [ ] **Step 4: Modifier le modèle**

Dans `services/identity/app/models.py`, classe `UserRO` :
1. ajouter l'import `UniqueConstraint` à la liste `from sqlalchemy import (...)` ;
2. remplacer la ligne `email = Column(String(120), unique=True, nullable=False, index=True)` et ajouter `tenant` + `__table_args__` :

```python
class UserRO(Base):
    __tablename__ = "user_ro"
    # Un même email peut exister sur les deux produits (comptes séparés par tenant).
    __table_args__ = (UniqueConstraint("tenant", "email", name="uq_user_ro_tenant_email"),)

    id = Column(BigInteger, primary_key=True)
    tenant = Column(String(32), nullable=False, default="semsar", index=True)
    email = Column(String(120), nullable=False, index=True)
```

(le reste de la classe est inchangé). Dans `to_dict()`, ajouter la clé `"tenant": self.tenant,` juste après `"id": self.id,`.

- [ ] **Step 5: Vérifier que les tests passent**

```bash
cd services/identity && python -m pytest tests/ -v
```

Expected: PASS (les 3 nouveaux + `test_health_ok`).

- [ ] **Step 6: Écrire la migration pour la base existante**

`services/identity/db/add_tenant.sql` :

```sql
-- Tenant M3a-L3achrane : comptes séparés par produit sur le même service identity.
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
ALTER TABLE identity.user_ro
    ADD COLUMN IF NOT EXISTS tenant varchar(32) NOT NULL DEFAULT 'semsar';
CREATE INDEX IF NOT EXISTS ix_user_ro_tenant ON identity.user_ro (tenant);

-- L'unicité globale sur email devient (tenant, email). Selon l'historique de la base,
-- l'ancienne unicité est soit un index unique (create_all), soit une contrainte.
DROP INDEX IF EXISTS identity.ix_user_ro_email;
ALTER TABLE identity.user_ro DROP CONSTRAINT IF EXISTS user_ro_email_key;
CREATE INDEX IF NOT EXISTS ix_user_ro_email ON identity.user_ro (email);

DO $$
BEGIN
    ALTER TABLE identity.user_ro
        ADD CONSTRAINT uq_user_ro_tenant_email UNIQUE (tenant, email);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN
    NULL;  -- déjà appliquée
END $$;
```

- [ ] **Step 7: Appliquer la migration sur la base dev et vérifier**

```bash
psql -d semsarout -f services/identity/db/add_tenant.sql
psql -d semsarout -c "\d identity.user_ro" | grep -E "tenant|uq_user_ro"
```

Expected: colonne `tenant` présente, contrainte `uq_user_ro_tenant_email` listée. (Si la base dev locale n'est pas montée, noter la migration comme « à appliquer au bring-up » et continuer.)

- [ ] **Step 8: Commit**

```bash
git add services/identity/app/models.py services/identity/db/add_tenant.sql services/identity/tests/
git commit -m "feat(identity): colonne tenant + unicité (tenant, email) pour m3a-l3achrane"
```

---

### Task 3: Tenant dans register/login/refresh + claim JWT

**Files:**
- Modify: `services/identity/app/auth.py` (`_claims`, `login`, `register`, `refresh`, `forgot_password`)
- Test: `services/identity/tests/test_tenant_auth.py`

**Interfaces:**
- Consumes: `UserRO.tenant` (Task 2), fixtures `db_session`/`client` (Task 2).
- Produces: JWT access **et** refresh portant le claim `"tenant"` ; routes `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/forgot-password` scopées par l'en-tête `x-semsar-tenant` (défaut `"semsar"`). Le BFF (Task 4) s'appuie sur le claim `tenant`.

- [ ] **Step 1: Écrire les tests qui échouent**

`services/identity/tests/test_tenant_auth.py` :

```python
import jwt as pyjwt

_M3A = {"x-semsar-tenant": "m3a-l3achrane"}
_REG = {"email": "sara@ex.ma", "password": "secret123", "first_name": "Sara", "last_name": "K"}


def _decode(token: str) -> dict:
    return pyjwt.decode(token, "test-secret", algorithms=["HS256"])


def test_register_attaches_tenant_and_claim(client):
    r = client.post("/auth/register", json=_REG, headers=_M3A)
    assert r.status_code == 201
    assert r.json()["user"]["tenant"] == "m3a-l3achrane"
    assert _decode(r.json()["access_token"])["tenant"] == "m3a-l3achrane"
    assert _decode(r.json()["refresh_token"])["tenant"] == "m3a-l3achrane"


def test_register_default_tenant_semsar(client):
    r = client.post("/auth/register", json=_REG)
    assert r.status_code == 201
    assert r.json()["user"]["tenant"] == "semsar"
    assert _decode(r.json()["access_token"])["tenant"] == "semsar"


def test_same_email_registers_on_both_tenants(client):
    assert client.post("/auth/register", json=_REG).status_code == 201
    assert client.post("/auth/register", json=_REG, headers=_M3A).status_code == 201


def test_login_scoped_by_tenant(client):
    client.post("/auth/register", json=_REG, headers=_M3A)
    ok = client.post("/auth/login", json={"email": _REG["email"], "password": _REG["password"]},
                     headers=_M3A)
    assert ok.status_code == 200
    # Mêmes identifiants côté semsar : le compte n'existe pas sur ce tenant.
    ko = client.post("/auth/login", json={"email": _REG["email"], "password": _REG["password"]})
    assert ko.status_code == 401


def test_refresh_rejects_cross_tenant(client):
    reg = client.post("/auth/register", json=_REG, headers=_M3A)
    refresh_token = reg.json()["refresh_token"]
    ok = client.post("/auth/refresh", headers={"authorization": f"Bearer {refresh_token}", **_M3A})
    assert ok.status_code == 200
    assert _decode(ok.json()["access_token"])["tenant"] == "m3a-l3achrane"
    ko = client.post("/auth/refresh", headers={"authorization": f"Bearer {refresh_token}"})
    assert ko.status_code == 403
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd services/identity && python -m pytest tests/test_tenant_auth.py -v
```

Expected: FAIL (`KeyError: 'tenant'` sur les claims, puis assertions 401/403).

- [ ] **Step 3: Implémenter dans `auth.py`**

1. Helper tenant (après `_err`) :

```python
_KNOWN_TENANTS = {"semsar", "m3a-l3achrane"}


def _tenant(request: Request) -> str:
    """Tenant de la requête, posé par le BFF (x-semsar-tenant). Défaut : semsar."""
    t = request.headers.get("x-semsar-tenant", "semsar")
    return t if t in _KNOWN_TENANTS else "semsar"
```

2. `_claims` — ajouter le tenant :

```python
def _claims(db: Session, user: UserRO) -> dict:
    return {
        "agency_id": user.agency_id,
        "is_superadmin": any(r.slug == "superadmin" for r in user.roles),
        "account_role": user.account_role,
        "features": _features(db, user.agency_id),
        "tenant": user.tenant,
    }
```

3. `login` — remplacer la recherche par email :

```python
    user = db.query(UserRO).filter(UserRO.email == data["email"],
                                   UserRO.tenant == _tenant(request)).first()
```

4. `register` — scoper le doublon et attacher le tenant :

```python
    tenant = _tenant(request)
    if db.query(UserRO).filter(UserRO.email == data["email"], UserRO.tenant == tenant).first():
        return _err("Email already registered", 409)
```

et dans le constructeur `UserRO(...)` ajouter `tenant=tenant,`.

5. `refresh` — porter le claim sur le refresh token et vérifier le tenant. Dans `login` et `register`, remplacer l'émission du refresh :

```python
        "refresh_token": _token(user.id, REFRESH_TTL, "refresh", {"tenant": user.tenant}),
```

et dans `refresh`, après le chargement de `user` et avant `_login_blocked` :

```python
    if user.tenant != _tenant(request):
        return _err("Tenant mismatch", 403)
```

6. `forgot_password` — scoper la recherche :

```python
    user = db.query(UserRO).filter(UserRO.email == email,
                                   UserRO.tenant == _tenant(request)).first()
```

- [ ] **Step 4: Vérifier que tout passe (nouveaux + existants)**

```bash
cd services/identity && python -m pytest tests/ -v
```

Expected: PASS. Les tests de la task 2 restent verts (aucun défaut de régression : sans en-tête, tenant = `semsar`, comportement historique inchangé).

- [ ] **Step 5: Commit**

```bash
git add services/identity/app/auth.py services/identity/tests/test_tenant_auth.py
git commit -m "feat(identity): register/login/refresh scopés par tenant + claim JWT tenant"
```

---

### Task 4: Résolution du tenant + rejet cross-tenant au BFF

**Files:**
- Modify: `gateway/app/config.py:29` (après `jwt_algorithm`)
- Modify: `gateway/app/main.py` (`_identity_from_claims`, filtre d'en-têtes, `proxy`)
- Test: `gateway/tests/test_tenant.py`

**Interfaces:**
- Consumes: claim JWT `tenant` (Task 3).
- Produces: fonctions `_parse_tenant_hosts(raw: str) -> dict[str, str]` et `_resolve_tenant(headers: Mapping, host: str) -> str` ; en-tête interne `x-semsar-tenant` injecté vers **tous** les upstreams (même anonyme) ; réponse `403 {"error": "Tenant mismatch"}` si claim ≠ tenant de la requête. Les plans B→F comptent sur `x-semsar-tenant` dans chaque service coloc.

- [ ] **Step 1: Écrire les tests qui échouent**

`gateway/tests/test_tenant.py` :

```python
from app.main import _identity_from_claims, _parse_tenant_hosts, _resolve_tenant


def test_parse_tenant_hosts():
    mapping = _parse_tenant_hosts("m3a-l3achrane.ma=m3a-l3achrane, www.m3a-l3achrane.ma=m3a-l3achrane,bad=unknown")
    assert mapping == {"m3a-l3achrane.ma": "m3a-l3achrane",
                       "www.m3a-l3achrane.ma": "m3a-l3achrane"}  # tenant inconnu ignoré


def test_resolve_tenant_by_host(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "_TENANT_HOSTS", {"m3a-l3achrane.ma": "m3a-l3achrane"})
    monkeypatch.setattr(m.settings, "environment", "prod")
    assert _resolve_tenant({}, "m3a-l3achrane.ma:443") == "m3a-l3achrane"
    assert _resolve_tenant({}, "semsarout.ma") == "semsar"
    # En prod, l'en-tête x-tenant est IGNORÉ (anti-usurpation).
    assert _resolve_tenant({"x-tenant": "m3a-l3achrane"}, "semsarout.ma") == "semsar"


def test_resolve_tenant_dev_header(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "_TENANT_HOSTS", {})
    monkeypatch.setattr(m.settings, "environment", "dev")
    assert _resolve_tenant({"x-tenant": "m3a-l3achrane"}, "localhost:8099") == "m3a-l3achrane"
    assert _resolve_tenant({"x-tenant": "hack"}, "localhost:8099") == "semsar"  # inconnu → défaut
    assert _resolve_tenant({}, "localhost:8099") == "semsar"


def test_identity_claims_carry_tenant():
    ident = _identity_from_claims({"sub": "7", "account_role": "buyer", "tenant": "m3a-l3achrane"})
    assert ident["tenant"] == "m3a-l3achrane"
    assert _identity_from_claims({"sub": "7", "account_role": "buyer"})["tenant"] == "semsar"
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd gateway && python -m pytest tests/test_tenant.py -v
```

Expected: FAIL — `ImportError: cannot import name '_parse_tenant_hosts'`.

- [ ] **Step 3: Config — table Host→tenant**

Dans `gateway/app/config.py`, après `jwt_algorithm` :

```python
    # Multi-tenant (M3a-L3achrane) : "host=tenant,host2=tenant2". En dev, l'en-tête
    # x-tenant (posé par le proxy Vite du front) est honoré ; en prod seul Host compte.
    tenant_hosts: str = ""
```

- [ ] **Step 4: Implémenter dans `gateway/app/main.py`**

1. Après `_IDENTITY_CACHE` :

```python
_KNOWN_TENANTS = {"semsar", "m3a-l3achrane"}


def _parse_tenant_hosts(raw: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for pair in raw.split(","):
        host, _, tenant = pair.partition("=")
        if host.strip() and tenant.strip() in _KNOWN_TENANTS:
            mapping[host.strip().lower()] = tenant.strip()
    return mapping


_TENANT_HOSTS = _parse_tenant_hosts(settings.tenant_hosts)


def _resolve_tenant(headers, host: str) -> str:
    """Tenant de la requête : en-tête x-tenant en dev (proxy Vite), sinon table Host."""
    if settings.environment == "dev":
        wanted = headers.get("x-tenant")
        if wanted in _KNOWN_TENANTS:
            return wanted
    return _TENANT_HOSTS.get((host or "").split(":")[0].lower(), "semsar")
```

2. `_identity_from_claims` — ajouter dans le dict retourné :

```python
        "tenant": payload.get("tenant") or "semsar",
```

3. Dans `proxy()`, remplacer le bloc filtrage + injection (`headers = {...}` jusqu'à `_inject_identity`) par :

```python
    tenant = _resolve_tenant(request.headers, request.headers.get("host", ""))
    # Filtrer : hop-by-hop + tout X-Semsar-* ENTRANT (anti-usurpation : seul le BFF les pose)
    # + x-tenant (consommé ici, jamais relayé).
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP
        and not k.lower().startswith("x-semsar-")
        and k.lower() != "x-tenant"
    }
    # Frontière d'auth : tous les upstreams sont des services internes → injecter l'identité.
    ident = await _resolve_identity(app, request.headers.get("authorization"))
    if ident:
        if ident.get("tenant", "semsar") != tenant:
            # Jeton d'un produit utilisé sur l'autre (semsar ⇄ m3a-l3achrane) → rejet.
            return Response(content=b'{"error":"Tenant mismatch"}', status_code=403,
                            media_type="application/json")
        _inject_identity(headers, ident)
    headers["x-semsar-tenant"] = tenant
```

- [ ] **Step 5: Vérifier que tout passe**

```bash
cd gateway && python -m pytest tests/ -v
```

Expected: PASS (`test_tenant.py` + `test_health.py`).

- [ ] **Step 6: Commit**

```bash
git add gateway/app/config.py gateway/app/main.py gateway/tests/test_tenant.py
git commit -m "feat(gateway): résolution de tenant (Host/x-tenant dev) + rejet cross-tenant"
```

---

### Task 5: Proxy Vite du front — en-tête `x-tenant`

**Files:**
- Modify: `frontend-m3a-l3achrane/vite.config.js`

**Interfaces:**
- Consumes: dossier renommé (Task 1) ; BFF honorant `x-tenant` en dev (Task 4).
- Produces: toute requête `/api` ou `/uploads` du front dev porte `x-tenant: m3a-l3achrane` — les plans B→F en dépendent pour tester en local.

- [ ] **Step 1: Modifier le proxy**

`frontend-m3a-l3achrane/vite.config.js` — remplacer le bloc `proxy` :

```js
    proxy: {
      // Dev : le BFF résout le tenant via cet en-tête (en prod : par Host/Traefik).
      '/api': {
        target: 'http://localhost:8099',
        changeOrigin: true,
        headers: { 'x-tenant': 'm3a-l3achrane' },
      },
      '/uploads': {
        target: 'http://localhost:8099',
        changeOrigin: true,
        headers: { 'x-tenant': 'm3a-l3achrane' },
      },
    },
```

- [ ] **Step 2: Vérifier lint + build**

```bash
make m3a-l3achrane-lint && make m3a-l3achrane-build
```

Expected: OK, 0 warning.

- [ ] **Step 3: Commit**

```bash
git add frontend-m3a-l3achrane/vite.config.js
git commit -m "feat(m3a-l3achrane): en-tête x-tenant sur le proxy dev Vite"
```

---

### Task 6: Smoke test d'isolation tenant contre le mesh

**Files:**
- Create: `tools/tenant_smoke.py`

**Interfaces:**
- Consumes: BFF + identity avec les tâches 2-4 déployées, mesh dev monté (`scripts/dev-mesh-up.sh`), migration `add_tenant.sql` appliquée.
- Produces: script rejouable de validation bout en bout (critère de succès n°2 du spec) ; réutilisé au gate des plans B→F.

- [ ] **Step 1: Écrire le script**

`tools/tenant_smoke.py` :

```python
#!/usr/bin/env python3
"""Smoke d'isolation tenant m3a-l3achrane ⇄ semsar via le BFF (dev).

Usage : python tools/tenant_smoke.py --bff http://localhost:8099
Prérequis : mesh monté (scripts/dev-mesh-up.sh), migration identity add_tenant.sql
appliquée, BFF en environment=dev (en-tête x-tenant honoré).
"""
import argparse
import sys
import time

import requests

M3A = {"x-tenant": "m3a-l3achrane"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bff", default="http://localhost:8099")
    args = parser.parse_args()
    base = args.bff.rstrip("/") + "/api/v1"
    email = f"smoke-tenant-{int(time.time())}@test.ma"
    reg = {"email": email, "password": "smoke-pass-123",
           "first_name": "Smoke", "last_name": "Tenant"}
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'OK ' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
        if not cond:
            failures.append(name)

    # 1. Inscription côté m3a-l3achrane
    r = requests.post(f"{base}/auth/register", json=reg, headers=M3A, timeout=10)
    check("register m3a-l3achrane → 201", r.status_code == 201, r.text[:200])
    token = r.json().get("access_token", "") if r.status_code == 201 else ""

    # 2. Login OK sur m3a-l3achrane, refusé sur semsar (compte inexistant sur ce tenant)
    creds = {"email": email, "password": reg["password"]}
    r = requests.post(f"{base}/auth/login", json=creds, headers=M3A, timeout=10)
    check("login m3a-l3achrane → 200", r.status_code == 200, r.text[:200])
    r = requests.post(f"{base}/auth/login", json=creds, timeout=10)
    check("login semsar (même email) → 401", r.status_code == 401, r.text[:200])

    # 3. Jeton m3a-l3achrane refusé sur une route semsar (et l'inverse par symétrie)
    r = requests.get(f"{base}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    check("jeton m3a-l3achrane sans x-tenant → 403 Tenant mismatch", r.status_code == 403, r.text[:200])
    r = requests.get(f"{base}/auth/me", headers={"Authorization": f"Bearer {token}", **M3A}, timeout=10)
    check("jeton m3a-l3achrane sur tenant m3a-l3achrane → 200", r.status_code == 200, r.text[:200])

    print("\n" + ("SMOKE TENANT : OK" if not failures else f"SMOKE TENANT : {len(failures)} échec(s)"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Monter le mesh et exécuter**

```bash
bash scripts/dev-mesh-up.sh   # si pas déjà monté
python tools/tenant_smoke.py --bff http://localhost:8099
```

Expected:

```
  OK  register m3a-l3achrane → 201
  OK  login m3a-l3achrane → 200
  OK  login semsar (même email) → 401
  OK  jeton m3a-l3achrane sans x-tenant → 403 Tenant mismatch
  OK  jeton m3a-l3achrane sur tenant m3a-l3achrane → 200

SMOKE TENANT : OK
```

- [ ] **Step 3: Anti-régression semsar**

```bash
cd gateway && python -m pytest tests/ -v && cd ../services/identity && python -m pytest tests/ -v
```

Expected: PASS partout. (Si un jeu de données de contrat est monté, rejouer aussi `tools/contract_test.py --services all` — les routes semsar doivent rester byte-identiques : sans en-tête ni host mappé, tenant=`semsar` partout.)

- [ ] **Step 4: Commit**

```bash
git add tools/tenant_smoke.py
git commit -m "test(gateway): smoke d'isolation tenant m3a-l3achrane via le BFF"
```

---

### Task 7: Gate final du plan A

**Files:**
- Aucun nouveau — vérification globale.

**Interfaces:**
- Consumes: toutes les tâches précédentes.
- Produces: branche prête pour le plan B (annonces & recherche).

- [ ] **Step 1: Suites backend**

```bash
cd services/identity && python -m pytest tests/ -v
cd ../../gateway && python -m pytest tests/ -v
```

Expected: PASS.

- [ ] **Step 2: Front**

```bash
make m3a-l3achrane-lint && make m3a-l3achrane-build
```

Expected: OK, 0 warning.

- [ ] **Step 3: Smoke tenant (mesh monté)**

```bash
python tools/tenant_smoke.py --bff http://localhost:8099
```

Expected: `SMOKE TENANT : OK`.

- [ ] **Step 4: Relecture du diff complet**

```bash
git log --oneline main..HEAD | head -20 && git diff main --stat
```

Vérifier : aucun secret, aucune route semsar historique modifiée hors ajout d'en-tête, nommage `m3a-l3achrane` partout.
