# Éditeur de plan 2D (`design3d`, brique 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le service `design3d` (projets de conception, niveaux, géométrie en mètres, règle de conflit « le propriétaire prime + étagère ») et l'éditeur de plan 2D tactile, hors-ligne par défaut, avec sa visionneuse publique.

**Architecture:** Nouveau microservice `services/design3d` (FastAPI + SQLAlchemy + outbox, patron `partner`), gate d'entitlement `design3d` (patron `require_feature("artisans")` de `directory`). Frontend : logique géométrique pure dans `utils/floorplan.js`, couche locale IndexedDB (`idb`) + moteur de synchronisation applicatif, éditeur SVG (`components/design/*`), PWA via `vite-plugin-pwa`.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy / Pydantic / boto3 (MinIO) · React 18 / react-query / `idb` / `vite-plugin-pwa` / vitest + `fake-indexeddb` / `@playwright/test`.

**Spec:** `docs/superpowers/specs/2026-09-08-design3d-floorplan-design.md`

## Global Constraints

- Identifiants projet/niveau : **UUID hex 32 générés côté client** (`crypto.randomUUID().replace(/-/g,'')`), serveur accepte l'id fourni, 409 si pris par un autre propriétaire.
- Géométrie **en mètres**, document JSON unique par niveau, ≤ 512 Ko, validé serveur ET client (mêmes règles).
- Règle de conflit exacte de la spec : propriétaire avec `base_revision` obsolète → accepté + version déplacée mise de côté ; collègue obsolète → 409 + sa version mise de côté ; une entrée non revue par (`level_id`, `author_id`).
- Toute route `/design3d/*` : `require_feature("design3d")` ; lecture publique seulement si `status = ready`.
- Hors-ligne : chaque action écrit en IndexedDB avant tout réseau ; l'`outbox` est rejouée dans l'ordre ; jamais l'API Background Sync.
- Tactile : cibles ≥ 44 px, `touch-action: none` sur le canevas, deux doigts = pan/zoom, aucun recours au survol/clavier.
- i18n FR + AR pour toute chaîne ; clés stables pour les types de pièce.
- Commits Conventional Commits avec les trailers d'attribution de la session ; jamais `--no-verify`.
- `make check`/pytest/lint/build verts avant chaque commit.

---

### Task 1 : Scaffold du service `design3d` (modèles, DB, santé, tests de base)

**Files:**
- Create: `services/design3d/pyproject.toml`, `services/design3d/.env.example`, `services/design3d/README.md`
- Create: `services/design3d/db/schema.sql`
- Create: `services/design3d/app/__init__.py`, `app/db.py`, `app/models.py`, `app/events.py`, `app/relay.py`, `app/main.py`
- Create: `services/design3d/tests/__init__.py`, `tests/conftest.py`, `tests/test_health.py`

**Interfaces:**
- Produces: modèles `DesignProject`, `DesignLevel`, `DesignLevelShelf` (+ `to_dict()`), `get_db`, `init_db`, `app` FastAPI, constantes `ROOM_TYPES`, `EMPTY_GEOMETRY`.
- Produces (tests): fixtures `db_session`, `client`, `headers(user_id, agency_id=None, features=("design3d",))`.

- [ ] **Step 1 : pyproject / env / schema**

`services/design3d/pyproject.toml` (copie de `services/partner/pyproject.toml`, nom `semsar-design3d`, description « SemsarOut — service design3d (conception intérieure : plans 2D, scènes, rendus) », dépendances identiques + `"semsar-storage"`).

`services/design3d/.env.example` :
```
SERVICE_NAME=design3d
DATABASE_URL=postgresql+psycopg://design3d:design3d@localhost:5432/semsar
RABBITMQ_URL=amqp://semsar:semsar@localhost:5672/
EVENTS_EXCHANGE=semsar.events
TRUST_GATEWAY_HEADERS=true
INTERNAL_TOKEN=change-me-internal
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY=semsar
S3_SECRET_KEY=semsar-secret
DESIGN_PLANS_BUCKET=semsar-design-plans
OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=INFO
PORT=8526
```

`services/design3d/db/schema.sql` :
```sql
-- Service design3d — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE design3d LOGIN PASSWORD 'design3d';
CREATE SCHEMA IF NOT EXISTS design3d AUTHORIZATION design3d;
ALTER ROLE design3d SET search_path = design3d;
GRANT ALL ON SCHEMA design3d TO design3d;
```

`app/db.py` : copie de `services/partner/app/db.py` avec l'URL par défaut `postgresql+psycopg://design3d:design3d@localhost:5432/semsar`.

- [ ] **Step 2 : modèles**

`services/design3d/app/models.py` :
```python
"""Modèles du domaine design3d (schéma `design3d`) — projets de conception, niveaux, étagère.

Les identifiants projet/niveau sont fournis par le client (UUID hex) : un projet créé
hors-ligne garde son id à la synchronisation. La géométrie est un document JSON par niveau,
en MÈTRES (origine haut-gauche, y vers le bas) — la 3D et les meubles en dépendent.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer, Numeric, String

from .db import Base

ROOM_TYPES = {"living", "bedroom", "kitchen", "bathroom", "wc", "hallway", "balcony", "garage", "other"}
OPENING_TYPES = {"door", "window"}
TARGET_TYPES = {"property", "program_lot"}
PROJECT_STATUSES = {"draft", "ready"}
EMPTY_GEOMETRY = {"walls": [], "rooms": [], "openings": []}


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d):
    return d.isoformat() if d else None


class DesignProject(Base):
    __tablename__ = "design_project"
    __table_args__ = (Index("ix_design_project_target", "target_type", "target_id"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    tenant = Column(String(30), nullable=False, default="semsar", server_default="semsar")
    agency_id = Column(Integer, nullable=True, index=True)
    owner_id = Column(Integer, nullable=False, index=True)  # le propriétaire du projet : ses changements priment
    target_type = Column(String(20), nullable=False)
    target_id = Column(BigInteger, nullable=False)
    title = Column(String(200), nullable=False)
    status = Column(String(10), nullable=False, default="draft", server_default="draft")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    def to_dict(self, levels: list | None = None) -> dict:
        d = {"id": self.id, "tenant": self.tenant, "agency_id": self.agency_id, "owner_id": self.owner_id,
             "target_type": self.target_type, "target_id": self.target_id, "title": self.title,
             "status": self.status, "created_at": _iso(self.created_at), "updated_at": _iso(self.updated_at)}
        if levels is not None:
            d["levels"] = [lv.to_dict() for lv in levels]
        return d


class DesignLevel(Base):
    __tablename__ = "design_level"

    id = Column(String(32), primary_key=True, default=_uuid)
    project_id = Column(String(32), ForeignKey("design_project.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    background_image_key = Column(String(255))
    show_background_public = Column(Boolean, nullable=False, default=False, server_default="false")
    calibration = Column(JSON)  # {"p1": {x,y}, "p2": {x,y}, "meters": float} — p1/p2 normalisés 0-1
    wall_height_m = Column(Numeric(4, 2), nullable=False, default=2.70, server_default="2.70")
    geometry = Column(JSON, nullable=False, default=lambda: dict(EMPTY_GEOMETRY))
    revision = Column(Integer, nullable=False, default=0, server_default="0")
    revision_author_id = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    def to_dict(self, public: bool = False) -> dict:
        d = {"id": self.id, "project_id": self.project_id, "name": self.name, "position": self.position,
             "calibration": self.calibration, "wall_height_m": float(self.wall_height_m),
             "geometry": self.geometry or dict(EMPTY_GEOMETRY), "revision": self.revision,
             "show_background_public": self.show_background_public, "updated_at": _iso(self.updated_at)}
        if not public or self.show_background_public:
            d["background_image_key"] = self.background_image_key
        if not public:
            d["revision_author_id"] = self.revision_author_id
        return d


class DesignLevelShelf(Base):
    """Version « mise de côté » d'un niveau : le travail d'un collègue déplacé par le propriétaire
    (ou refusé par 409), conservé pour que le propriétaire puisse le récupérer. Une seule entrée
    non revue par (level_id, author_id)."""
    __tablename__ = "design_level_shelf"

    id = Column(String(32), primary_key=True, default=_uuid)
    level_id = Column(String(32), ForeignKey("design_level.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, nullable=False)
    geometry = Column(JSON, nullable=False)
    calibration = Column(JSON)
    wall_height_m = Column(Numeric(4, 2), nullable=False)
    base_revision = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    reviewed_at = Column(DateTime(timezone=True))

    def to_dict(self) -> dict:
        return {"id": self.id, "level_id": self.level_id, "author_id": self.author_id,
                "geometry": self.geometry, "calibration": self.calibration,
                "wall_height_m": float(self.wall_height_m), "base_revision": self.base_revision,
                "created_at": _iso(self.created_at), "reviewed_at": _iso(self.reviewed_at)}
```

`app/events.py` :
```python
"""Événements publiés par design3d."""
PROJECT_CREATED = "design3d.project.created"
PROJECT_READY = "design3d.project.ready"
PROJECT_DELETED = "design3d.project.deleted"
LEVEL_UPDATED = "design3d.level.updated"
```

`app/relay.py` : copie de `services/partner/app/relay.py` (relais outbox → RabbitMQ), inchangé hormis le docstring.

- [ ] **Step 3 : `app/main.py` minimal (santé + squelette)**

```python
"""Service design3d — conception intérieure : plans 2D (brique 1), scènes 3D et rendus (briques 2-3).

Routes `/design3d/*` gatées par l'entitlement `design3d` (patron directory/`require_feature`).
Cloisonnement : agence → même agency_id ; sans agence → owner_id (patron listing/_bo_access).
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal, require_feature
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import DesignLevel, DesignLevelShelf, DesignProject

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)
_design3d = require_feature("design3d")


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


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and str(principal.sub).isdigit() else None


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}
```

- [ ] **Step 4 : tests de base**

`tests/conftest.py` : copie de `services/partner/tests/conftest.py`, avec `headers` étendu :
```python
def _headers(user_id: int = 7, *, agency_id: int | None = None, features=("design3d",),
             superadmin: bool = False, tenant: str = "semsar") -> dict:
    h = {"x-semsar-user-id": str(user_id), "x-semsar-tenant": tenant,
         "x-semsar-features": ",".join(features)}
    if agency_id is not None:
        h["x-semsar-agency-id"] = str(agency_id)
    if superadmin:
        h["x-semsar-superadmin"] = "1"
    return h
```
(Vérifier dans `libs/semsar_auth/semsar_auth/rbac.py` le nom exact de l'en-tête des features lu par `get_principal` en mode `TRUST_GATEWAY_HEADERS` — s'il n'existe pas encore, l'ajouter dans `rbac.py` : `features=[f for f in request.headers.get("x-semsar-features", "").split(",") if f]`, et faire injecter cet en-tête par le BFF dans `_inject_identity` (`gateway/app/main.py`) depuis `ident["features"]`. Ce câblage est nécessaire : sans lui l'entitlement n'atteint jamais le service.)

`tests/test_health.py` :
```python
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["service"]
```

- [ ] **Step 5 : lancer**

Run: `pip install -e "services/design3d[test]" && cd services/design3d && python3 -m pytest tests/ -q`
Expected: `1 passed`.

- [ ] **Step 6 : commit**

```bash
git add services/design3d && git commit -F - <<'EOF'
feat(design3d): scaffold du service (modèles projet/niveau/étagère, santé)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01M6QLmyuUqxsemCutSzPq1v
EOF
```

---

### Task 2 : Validation de la géométrie (`schemas.py`) — TDD

**Files:**
- Create: `services/design3d/app/schemas.py`
- Create: `services/design3d/tests/test_geometry_validation.py`

**Interfaces:**
- Produces: `validate_geometry(geometry: dict, wall_height_m: float) -> list[str]` (liste d'erreurs, vide si valide) ; `wall_length(wall: dict) -> float` ; modèles Pydantic `ProjectCreateIn`, `ProjectUpdateIn`, `LevelCreateIn`, `LevelUpdateIn` (`base_revision: int` obligatoire), `CalibrationIn`.

- [ ] **Step 1 : tests d'abord**

```python
# tests/test_geometry_validation.py
from app.schemas import validate_geometry, wall_length

W = {"id": "w1", "a": {"x": 0, "y": 0}, "b": {"x": 4, "y": 0}, "thickness_m": 0.2}


def _g(**k):
    g = {"walls": [W], "rooms": [], "openings": []}
    g.update(k)
    return g


def test_valid_minimal():
    assert validate_geometry(_g(), 2.7) == []


def test_wall_length():
    assert wall_length({"a": {"x": 0, "y": 0}, "b": {"x": 3, "y": 4}}) == 5


def test_degenerate_wall_rejected():
    g = _g(walls=[{**W, "b": {"x": 0, "y": 0}}])
    assert any("w1" in e for e in validate_geometry(g, 2.7))


def test_thickness_bounds():
    assert validate_geometry(_g(walls=[{**W, "thickness_m": 0}]), 2.7)
    assert validate_geometry(_g(walls=[{**W, "thickness_m": 1.5}]), 2.7)


def test_room_needs_three_points():
    g = _g(rooms=[{"id": "r1", "type": "living", "name": "S", "polygon": [{"x": 0, "y": 0}, {"x": 1, "y": 0}]}])
    assert validate_geometry(g, 2.7)


def test_room_type_must_be_known():
    g = _g(rooms=[{"id": "r1", "type": "spa", "name": "S",
                   "polygon": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}]}])
    assert validate_geometry(g, 2.7)


def test_opening_orphan_rejected():
    g = _g(openings=[{"id": "o1", "wall_id": "nope", "type": "door", "offset_m": 0, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert validate_geometry(g, 2.7)


def test_opening_beyond_wall_rejected():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 3.5, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert validate_geometry(g, 2.7)


def test_opening_taller_than_wall_rejected():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "window", "offset_m": 1, "width_m": 1.2, "height_m": 2, "sill_m": 1}])
    assert validate_geometry(g, 2.7)


def test_duplicate_ids_rejected():
    assert validate_geometry(_g(walls=[W, {**W}]), 2.7)


def test_oversized_document_rejected():
    big = _g(walls=[{**W, "id": f"w{i}"} for i in range(20000)])
    assert any("512" in e for e in validate_geometry(big, 2.7))
```

- [ ] **Step 2 : échec**

Run: `cd services/design3d && python3 -m pytest tests/test_geometry_validation.py -q` → FAIL (`ModuleNotFoundError: app.schemas`).

- [ ] **Step 3 : implémentation**

```python
# app/schemas.py
"""Payloads API + validation du document `geometry` (miroir côté client : frontend/src/utils/floorplan.js)."""
import json
import math

from pydantic import BaseModel, Field, field_validator

from .models import OPENING_TYPES, PROJECT_STATUSES, ROOM_TYPES, TARGET_TYPES

MAX_GEOMETRY_BYTES = 512 * 1024


def wall_length(wall: dict) -> float:
    a, b = wall["a"], wall["b"]
    return math.hypot(b["x"] - a["x"], b["y"] - a["y"])


def _is_point(p) -> bool:
    return isinstance(p, dict) and all(isinstance(p.get(k), (int, float)) for k in ("x", "y"))


def validate_geometry(geometry: dict, wall_height_m: float) -> list[str]:
    errors: list[str] = []
    if not isinstance(geometry, dict):
        return ["geometry doit être un objet"]
    if len(json.dumps(geometry, separators=(",", ":"))) > MAX_GEOMETRY_BYTES:
        errors.append("geometry dépasse 512 Ko")
    walls = geometry.get("walls") or []
    rooms = geometry.get("rooms") or []
    openings = geometry.get("openings") or []
    for coll, name in ((walls, "walls"), (rooms, "rooms"), (openings, "openings")):
        ids = [e.get("id") for e in coll if isinstance(e, dict)]
        if len(ids) != len(set(ids)) or any(not i for i in ids):
            errors.append(f"{name}: identifiants manquants ou en double")
    by_id = {}
    for w in walls:
        if not (_is_point(w.get("a")) and _is_point(w.get("b"))) or wall_length(w) <= 0:
            errors.append(f"mur {w.get('id')}: deux points distincts requis")
            continue
        t = w.get("thickness_m")
        if not isinstance(t, (int, float)) or not (0 < t <= 1):
            errors.append(f"mur {w.get('id')}: thickness_m dans ]0, 1]")
        by_id[w["id"]] = w
    for r in rooms:
        poly = r.get("polygon") or []
        if len(poly) < 3 or not all(_is_point(p) for p in poly):
            errors.append(f"pièce {r.get('id')}: polygone ≥ 3 points")
        if r.get("type") not in ROOM_TYPES:
            errors.append(f"pièce {r.get('id')}: type inconnu")
    for o in openings:
        if o.get("type") not in OPENING_TYPES:
            errors.append(f"ouverture {o.get('id')}: type inconnu")
        w = by_id.get(o.get("wall_id"))
        if w is None:
            errors.append(f"ouverture {o.get('id')}: mur introuvable")
            continue
        off, wd, h, sill = (o.get(k, 0) for k in ("offset_m", "width_m", "height_m", "sill_m"))
        if not all(isinstance(v, (int, float)) for v in (off, wd, h, sill)) or wd <= 0 or off < 0:
            errors.append(f"ouverture {o.get('id')}: dimensions invalides")
            continue
        if off + wd > wall_length(w) + 1e-6:
            errors.append(f"ouverture {o.get('id')}: dépasse le mur")
        if sill + h > float(wall_height_m) + 1e-6:
            errors.append(f"ouverture {o.get('id')}: dépasse la hauteur du mur")
    return errors


class ProjectCreateIn(BaseModel):
    id: str | None = Field(default=None, min_length=32, max_length=32)
    target_type: str
    target_id: int
    title: str = Field(min_length=1, max_length=200)

    @field_validator("target_type")
    @classmethod
    def _tt(cls, v):
        if v not in TARGET_TYPES:
            raise ValueError("target_type invalide")
        return v


class ProjectUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        if v is not None and v not in PROJECT_STATUSES:
            raise ValueError("status invalide")
        return v


class CalibrationIn(BaseModel):
    p1: dict
    p2: dict
    meters: float = Field(gt=0)


class LevelCreateIn(BaseModel):
    id: str | None = Field(default=None, min_length=32, max_length=32)
    name: str = Field(min_length=1, max_length=60)
    position: int = 0


class LevelUpdateIn(BaseModel):
    base_revision: int
    name: str | None = Field(default=None, min_length=1, max_length=60)
    position: int | None = None
    wall_height_m: float | None = Field(default=None, gt=1.5, le=6)
    calibration: CalibrationIn | None = None
    geometry: dict | None = None
    show_background_public: bool | None = None
```

- [ ] **Step 4 : succès** — Run: `python3 -m pytest tests/test_geometry_validation.py -q` → `11 passed`.

- [ ] **Step 5 : commit** — `feat(design3d): validation du document géométrie` (mêmes trailers).

---

### Task 3 : CRUD projets/niveaux, entitlement, cloisonnement — TDD

**Files:**
- Modify: `services/design3d/app/main.py`
- Create: `services/design3d/tests/test_projects.py`

**Interfaces:**
- Produces: `_access(p: DesignProject, principal) -> JSONResponse | None` ; routes `POST/GET /design3d/projects`, `GET/PUT/DELETE /design3d/projects/{id}`, `POST /design3d/projects/{id}/levels`, `DELETE /design3d/levels/{id}`.

- [ ] **Step 1 : tests**

```python
# tests/test_projects.py
def _create(client, headers, **over):
    body = {"target_type": "property", "target_id": 42, "title": "Réno A"}
    body.update(over)
    return client.post("/design3d/projects", json=body, headers=headers)


def test_requires_entitlement(client, headers):
    r = _create(client, headers(features=()))
    assert r.status_code == 403


def test_create_makes_default_level_and_keeps_client_id(client, headers):
    r = _create(client, headers(), id="a" * 32)
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == "a" * 32 and body["owner_id"] == 7
    assert len(body["levels"]) == 1 and body["levels"][0]["name"] == "RDC"
    assert body["levels"][0]["geometry"] == {"walls": [], "rooms": [], "openings": []}


def test_client_id_taken_by_other_owner_is_409(client, headers):
    assert _create(client, headers(user_id=1), id="b" * 32).status_code == 201
    assert _create(client, headers(user_id=2), id="b" * 32).status_code == 409


def test_list_is_scoped(client, headers):
    _create(client, headers(user_id=1))
    _create(client, headers(user_id=2))
    r = client.get("/design3d/projects", params={"target_type": "property", "target_id": 42}, headers=headers(user_id=1))
    assert len(r.json()["projects"]) == 1


def test_agency_colleague_can_read_and_edit(client, headers):
    pid = _create(client, headers(user_id=1, agency_id=9)).json()["id"]
    r = client.get(f"/design3d/projects/{pid}", headers=headers(user_id=2, agency_id=9))
    assert r.status_code == 200
    assert client.put(f"/design3d/projects/{pid}", json={"title": "B"}, headers=headers(user_id=2, agency_id=9)).status_code == 200


def test_other_agency_is_403(client, headers):
    pid = _create(client, headers(user_id=1, agency_id=9)).json()["id"]
    assert client.get(f"/design3d/projects/{pid}", headers=headers(user_id=3, agency_id=10)).status_code == 403


def test_particulier_scoped_to_owner(client, headers):
    pid = _create(client, headers(user_id=1)).json()["id"]
    assert client.get(f"/design3d/projects/{pid}", headers=headers(user_id=2)).status_code == 403


def test_add_and_delete_level_last_protected(client, headers):
    pid = _create(client, headers()).json()["id"]
    lv = client.post(f"/design3d/projects/{pid}/levels", json={"name": "Étage 1"}, headers=headers()).json()
    assert lv["position"] == 1
    assert client.delete(f"/design3d/levels/{lv['id']}", headers=headers()).status_code == 204
    only = client.get(f"/design3d/projects/{pid}", headers=headers()).json()["levels"][0]["id"]
    assert client.delete(f"/design3d/levels/{only}", headers=headers()).status_code == 400


def test_status_ready_emits_event_and_delete_works(client, headers, db_session):
    from semsar_events.outbox import OutboxEvent  # nom exact à vérifier dans libs/semsar_events
    pid = _create(client, headers()).json()["id"]
    assert client.put(f"/design3d/projects/{pid}", json={"status": "ready"}, headers=headers()).status_code == 200
    assert db_session.query(OutboxEvent).filter_by(event_type="design3d.project.ready").count() == 1
    assert client.delete(f"/design3d/projects/{pid}", headers=headers()).status_code == 204
    assert client.get(f"/design3d/projects/{pid}", headers=headers()).status_code == 404
```

- [ ] **Step 2 : échec** — Run: `python3 -m pytest tests/test_projects.py -q` → FAIL (404 sur les routes).

- [ ] **Step 3 : implémentation (ajouter à `main.py`)**

```python
from fastapi import Response
from .models import EMPTY_GEOMETRY
from .schemas import LevelCreateIn, ProjectCreateIn, ProjectUpdateIn


def _access(p: DesignProject, principal: Principal):
    if principal.agency_id:
        if p.agency_id != principal.agency_id:
            return _err("Access denied", 403)
    elif p.owner_id != _uid(principal):
        return _err("Access denied", 403)
    return None


def _levels(db: Session, project_id: str) -> list[DesignLevel]:
    return db.query(DesignLevel).filter(DesignLevel.project_id == project_id).order_by(DesignLevel.position, DesignLevel.created_at).all()


def _load(db: Session, project_id: str, principal: Principal):
    p = db.get(DesignProject, project_id)
    if p is None:
        return None, _err("Not found", 404)
    denied = _access(p, principal)
    return (None, denied) if denied else (p, None)


@app.post("/design3d/projects", status_code=201)
def create_project(body: ProjectCreateIn, request: Request, principal: Principal = Depends(_design3d),
                   db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    if body.id and db.get(DesignProject, body.id) is not None:
        existing = db.get(DesignProject, body.id)
        if existing.owner_id != uid:
            return _err("Identifiant déjà utilisé", 409)
        return JSONResponse(existing.to_dict(_levels(db, existing.id)), status_code=201)  # idempotent (rejeu outbox)
    p = DesignProject(id=body.id or None, tenant=request.headers.get("x-semsar-tenant") or "semsar",
                      agency_id=principal.agency_id, owner_id=uid, target_type=body.target_type,
                      target_id=body.target_id, title=body.title)
    db.add(p)
    db.flush()
    db.add(DesignLevel(project_id=p.id, name="RDC", position=0, geometry=dict(EMPTY_GEOMETRY), revision_author_id=uid))
    enqueue(db, "design_project", p.id, events.PROJECT_CREATED, {"id": p.id, "target_type": p.target_type, "target_id": p.target_id})
    db.commit()
    return JSONResponse(p.to_dict(_levels(db, p.id)), status_code=201)


@app.get("/design3d/projects")
def list_projects(target_type: str | None = None, target_id: int | None = None,
                  principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    q = db.query(DesignProject)
    q = q.filter(DesignProject.agency_id == principal.agency_id) if principal.agency_id else q.filter(DesignProject.owner_id == _uid(principal))
    if target_type:
        q = q.filter(DesignProject.target_type == target_type)
    if target_id is not None:
        q = q.filter(DesignProject.target_id == target_id)
    return {"projects": [p.to_dict() for p in q.order_by(DesignProject.updated_at.desc()).all()]}


@app.get("/design3d/projects/{project_id}")
def get_project(project_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    return err or p.to_dict(_levels(db, p.id))


@app.put("/design3d/projects/{project_id}")
def update_project(project_id: str, body: ProjectUpdateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    if body.title is not None:
        p.title = body.title
    if body.status is not None and body.status != p.status:
        p.status = body.status
        if body.status == "ready":
            enqueue(db, "design_project", p.id, events.PROJECT_READY, {"id": p.id, "target_type": p.target_type, "target_id": p.target_id})
    db.commit()
    return p.to_dict(_levels(db, p.id))


@app.delete("/design3d/projects/{project_id}", status_code=204)
def delete_project(project_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    enqueue(db, "design_project", p.id, events.PROJECT_DELETED, {"id": p.id})
    db.delete(p)
    db.commit()
    return Response(status_code=204)


@app.post("/design3d/projects/{project_id}/levels", status_code=201)
def create_level(project_id: str, body: LevelCreateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    if body.id and db.get(DesignLevel, body.id) is not None:
        return JSONResponse(db.get(DesignLevel, body.id).to_dict(), status_code=201)
    position = body.position or len(_levels(db, p.id))
    lv = DesignLevel(id=body.id or None, project_id=p.id, name=body.name, position=position,
                     geometry=dict(EMPTY_GEOMETRY), revision_author_id=_uid(principal))
    db.add(lv)
    db.commit()
    return JSONResponse(lv.to_dict(), status_code=201)


def _load_level(db: Session, level_id: str, principal: Principal):
    lv = db.get(DesignLevel, level_id)
    if lv is None:
        return None, None, _err("Not found", 404)
    p, err = _load(db, lv.project_id, principal)
    return (None, None, err) if err else (lv, p, None)


@app.delete("/design3d/levels/{level_id}", status_code=204)
def delete_level(level_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    if len(_levels(db, p.id)) <= 1:
        return _err("Un projet doit garder au moins un niveau", 400)
    db.delete(lv)
    db.commit()
    return Response(status_code=204)
```

Note : les projets sont sans cascade ORM sur `levels` — la suppression repose sur `ondelete=CASCADE` côté DB ; en sqlite (tests) activer `PRAGMA foreign_keys=ON` dans `conftest.py` (event `connect` sur l'engine), sinon ajouter `relationship(..., cascade="all, delete-orphan")` sur `DesignProject`. Choisir la relation ORM (plus portable) et l'ajouter au modèle.

- [ ] **Step 4 : succès** — Run: `python3 -m pytest tests/ -q` → tout vert.
- [ ] **Step 5 : commit** — `feat(design3d): CRUD projets/niveaux, entitlement et cloisonnement`.

---

### Task 4 : `PUT /design3d/levels/{id}` avec règle de conflit, étagère, `/sync` — TDD

**Files:**
- Modify: `services/design3d/app/main.py`
- Create: `services/design3d/tests/test_conflicts.py`

**Interfaces:**
- Produces: `PUT /design3d/levels/{id}` (corps `LevelUpdateIn`, réponse `level.to_dict() + {"shelved": bool}`), `GET /design3d/levels/{id}/shelf`, `POST /design3d/levels/{id}/shelf/{shelf_id}/dismiss`, `GET /design3d/sync`.

- [ ] **Step 1 : tests**

```python
# tests/test_conflicts.py
W = {"id": "w1", "a": {"x": 0, "y": 0}, "b": {"x": 4, "y": 0}, "thickness_m": 0.2}
G1 = {"walls": [W], "rooms": [], "openings": []}
G2 = {"walls": [{**W, "b": {"x": 5, "y": 0}}], "rooms": [], "openings": []}


def _project(client, headers, owner=1, agency=9):
    r = client.post("/design3d/projects", json={"target_type": "property", "target_id": 1, "title": "P"},
                    headers=headers(user_id=owner, agency_id=agency))
    return r.json()["id"], r.json()["levels"][0]["id"]


def _put(client, headers, lid, base, geometry, **who):
    return client.put(f"/design3d/levels/{lid}", json={"base_revision": base, "geometry": geometry}, headers=headers(**who))


def test_fresh_write_increments_revision(client, headers):
    _, lid = _project(client, headers)
    r = _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    assert r.status_code == 200 and r.json()["revision"] == 1 and r.json()["shelved"] is False


def test_invalid_geometry_is_422(client, headers):
    _, lid = _project(client, headers)
    bad = {"walls": [{**W, "b": {"x": 0, "y": 0}}], "rooms": [], "openings": []}
    assert _put(client, headers, lid, 0, bad, user_id=1, agency_id=9).status_code == 422


def test_owner_stale_wins_and_shelves_colleague(client, headers):
    _, lid = _project(client, headers)
    assert _put(client, headers, lid, 0, G2, user_id=2, agency_id=9).status_code == 200   # collègue écrit d'abord (rev 1)
    r = _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)                          # propriétaire, base obsolète
    assert r.status_code == 200 and r.json()["revision"] == 2 and r.json()["shelved"] is True
    assert r.json()["geometry"] == G1
    shelf = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"]
    assert len(shelf) == 1 and shelf[0]["author_id"] == 2 and shelf[0]["geometry"] == G2


def test_owner_stale_over_own_version_does_not_shelve(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G2, user_id=1, agency_id=9)
    r = _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    assert r.json()["shelved"] is False


def test_colleague_stale_is_409_and_shelved(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    r = _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    assert r.status_code == 409 and r.json()["level"]["revision"] == 1
    shelf = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"]
    assert len(shelf) == 1 and shelf[0]["author_id"] == 2


def test_one_unreviewed_entry_per_author(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    shelf = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"]
    assert len(shelf) == 1


def test_shelf_only_for_owner_and_dismiss(client, headers):
    _, lid = _project(client, headers)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    assert client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=2, agency_id=9)).status_code == 403
    sid = client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"][0]["id"]
    assert client.post(f"/design3d/levels/{lid}/shelf/{sid}/dismiss", headers=headers(user_id=1, agency_id=9)).status_code == 200
    assert client.get(f"/design3d/levels/{lid}/shelf", headers=headers(user_id=1, agency_id=9)).json()["items"] == []


def test_sync_summary_scoped(client, headers):
    pid, lid = _project(client, headers)
    _project(client, headers, owner=5, agency=10)
    _put(client, headers, lid, 0, G1, user_id=1, agency_id=9)
    _put(client, headers, lid, 0, G2, user_id=2, agency_id=9)
    r = client.get("/design3d/sync", headers=headers(user_id=1, agency_id=9)).json()
    assert [p["id"] for p in r["projects"]] == [pid]
    lv = r["projects"][0]["levels"][0]
    assert lv["id"] == lid and lv["revision"] == 1 and lv["shelved_count"] == 1
```

- [ ] **Step 2 : échec** — FAIL (404/405).

- [ ] **Step 3 : implémentation**

```python
from .schemas import LevelUpdateIn, validate_geometry


def _shelve(db: Session, lv: DesignLevel, author_id: int, geometry, calibration, wall_height_m, base_revision: int) -> None:
    prev = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.author_id == author_id,
                                            DesignLevelShelf.reviewed_at.is_(None)).first()
    if prev is not None:
        db.delete(prev)
    db.add(DesignLevelShelf(level_id=lv.id, author_id=author_id, geometry=geometry, calibration=calibration,
                            wall_height_m=wall_height_m, base_revision=base_revision))


@app.put("/design3d/levels/{level_id}")
def update_level(level_id: str, body: LevelUpdateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    uid = _uid(principal)
    is_owner = uid == p.owner_id
    height = body.wall_height_m if body.wall_height_m is not None else float(lv.wall_height_m)
    if body.geometry is not None:
        problems = validate_geometry(body.geometry, height)
        if problems:
            return JSONResponse({"error": "Géométrie invalide", "details": problems}, status_code=422)
    shelved = False
    if body.base_revision < lv.revision:
        if not is_owner:
            _shelve(db, lv, uid, body.geometry if body.geometry is not None else lv.geometry,
                    body.calibration.model_dump() if body.calibration else lv.calibration, height, body.base_revision)
            db.commit()
            return JSONResponse({"error": "Version obsolète : le propriétaire a modifié ce niveau",
                                 "level": lv.to_dict()}, status_code=409)
        if lv.revision_author_id not in (None, p.owner_id):
            _shelve(db, lv, lv.revision_author_id, lv.geometry, lv.calibration, float(lv.wall_height_m), lv.revision)
            shelved = True
    for field in ("name", "position", "show_background_public"):
        v = getattr(body, field)
        if v is not None:
            setattr(lv, field, v)
    if body.wall_height_m is not None:
        lv.wall_height_m = body.wall_height_m
    if body.calibration is not None:
        lv.calibration = body.calibration.model_dump()
    if body.geometry is not None:
        lv.geometry = body.geometry
    lv.revision += 1
    lv.revision_author_id = uid
    enqueue(db, "design_level", lv.id, events.LEVEL_UPDATED, {"id": lv.id, "project_id": p.id, "revision": lv.revision})
    db.commit()
    return {**lv.to_dict(), "shelved": shelved}


def _owner_only(p: DesignProject, principal: Principal):
    return None if _uid(principal) == p.owner_id else _err("Réservé au propriétaire du projet", 403)


@app.get("/design3d/levels/{level_id}/shelf")
def list_shelf(level_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    if (d := _owner_only(p, principal)) is not None:
        return d
    rows = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.reviewed_at.is_(None)).all()
    return {"items": [s.to_dict() for s in rows]}


@app.post("/design3d/levels/{level_id}/shelf/{shelf_id}/dismiss")
def dismiss_shelf(level_id: str, shelf_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    if (d := _owner_only(p, principal)) is not None:
        return d
    s = db.get(DesignLevelShelf, shelf_id)
    if s is None or s.level_id != lv.id:
        return _err("Not found", 404)
    from .models import _now
    s.reviewed_at = _now()
    db.commit()
    return s.to_dict()


@app.get("/design3d/sync")
def sync_summary(principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    q = db.query(DesignProject)
    q = q.filter(DesignProject.agency_id == principal.agency_id) if principal.agency_id else q.filter(DesignProject.owner_id == _uid(principal))
    out = []
    for p in q.all():
        levels = []
        for lv in _levels(db, p.id):
            shelved = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.reviewed_at.is_(None)).count()
            levels.append({"id": lv.id, "revision": lv.revision, "updated_at": lv.to_dict()["updated_at"], "shelved_count": shelved})
        out.append({"id": p.id, "status": p.status, "updated_at": p.to_dict()["updated_at"], "levels": levels})
    return {"projects": out}
```

- [ ] **Step 4 : succès** — `python3 -m pytest tests/ -q` vert.
- [ ] **Step 5 : commit** — `feat(design3d): sauvegarde de niveau avec règle de conflit propriétaire, étagère et résumé de synchro`.

---

### Task 5 : Recalibration serveur, image de fond (MinIO), lecture publique — TDD

**Files:**
- Create: `services/design3d/app/storage.py`, `services/design3d/app/geometry.py`
- Modify: `services/design3d/app/main.py`
- Create: `services/design3d/tests/test_public_and_background.py`

**Interfaces:**
- Produces: `geometry.rescale(geometry: dict, factor: float) -> dict` ; `storage.plans() -> ObjectStorage` (bucket `DESIGN_PLANS_BUCKET`) ; routes `POST /design3d/levels/{id}/recalibrate`, `POST /design3d/levels/{id}/background` (multipart `file`), `GET /public/design3d/projects/{id}`, `GET /design3d/levels/{id}/background` (flux, authentifié) et `GET /public/design3d/levels/{id}/background` (flux, si `show_background_public` et projet `ready`).

- [ ] **Step 1 : tests**

```python
# tests/test_public_and_background.py
import io

from app.geometry import rescale

W = {"id": "w1", "a": {"x": 0, "y": 0}, "b": {"x": 4, "y": 0}, "thickness_m": 0.2}
G = {"walls": [W],
     "rooms": [{"id": "r1", "type": "living", "name": "S", "polygon": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 4, "y": 3}]}],
     "openings": [{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 1, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}]}


def test_rescale_scales_coordinates_and_offsets_not_thickness():
    g = rescale(G, 2)
    assert g["walls"][0]["b"] == {"x": 8, "y": 0} and g["walls"][0]["thickness_m"] == 0.2
    assert g["rooms"][0]["polygon"][2] == {"x": 8, "y": 6}
    assert g["openings"][0]["offset_m"] == 2 and g["openings"][0]["width_m"] == 0.9


def _project(client, headers):
    r = client.post("/design3d/projects", json={"target_type": "property", "target_id": 1, "title": "P"}, headers=headers())
    return r.json()["id"], r.json()["levels"][0]["id"]


def test_recalibrate_rescales(client, headers):
    _, lid = _project(client, headers)
    client.put(f"/design3d/levels/{lid}", json={"base_revision": 0, "geometry": G,
               "calibration": {"p1": {"x": 0.1, "y": 0.1}, "p2": {"x": 0.5, "y": 0.1}, "meters": 4}}, headers=headers())
    r = client.post(f"/design3d/levels/{lid}/recalibrate",
                    json={"base_revision": 1, "calibration": {"p1": {"x": 0.1, "y": 0.1}, "p2": {"x": 0.5, "y": 0.1}, "meters": 8}},
                    headers=headers())
    assert r.status_code == 200
    assert r.json()["geometry"]["walls"][0]["b"]["x"] == 8 and r.json()["revision"] == 2


def test_background_upload_and_stream(client, headers, monkeypatch):
    import app.main as m
    store = {}

    class _S:
        def put(self, key, data, content_type="application/octet-stream", **k): store[key] = (data, content_type)
        def get(self, key): return store[key][0]
    monkeypatch.setattr(m.storage, "plans", lambda: _S())
    _, lid = _project(client, headers)
    r = client.post(f"/design3d/levels/{lid}/background", files={"file": ("plan.png", io.BytesIO(b"\x89PNG..."), "image/png")}, headers=headers())
    assert r.status_code == 200 and r.json()["background_image_key"].endswith("/background.png")
    assert client.get(f"/design3d/levels/{lid}/background", headers=headers()).status_code == 200


def test_background_rejects_pdf_and_oversize(client, headers, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.storage, "plans", lambda: None)
    _, lid = _project(client, headers)
    assert client.post(f"/design3d/levels/{lid}/background", files={"file": ("p.pdf", io.BytesIO(b"%PDF"), "application/pdf")}, headers=headers()).status_code == 400
    big = io.BytesIO(b"\x89PNG" + b"0" * (10 * 1024 * 1024 + 1))
    assert client.post(f"/design3d/levels/{lid}/background", files={"file": ("p.png", big, "image/png")}, headers=headers()).status_code == 413


def test_public_read_requires_ready_and_hides_background(client, headers, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.storage, "plans", lambda: type("S", (), {"put": lambda *a, **k: None, "get": lambda *a: b"img"})())
    pid, lid = _project(client, headers)
    client.post(f"/design3d/levels/{lid}/background", files={"file": ("p.png", io.BytesIO(b"\x89PNG"), "image/png")}, headers=headers())
    assert client.get(f"/public/design3d/projects/{pid}").status_code == 404
    client.put(f"/design3d/projects/{pid}", json={"status": "ready"}, headers=headers())
    body = client.get(f"/public/design3d/projects/{pid}").json()
    assert "background_image_key" not in body["levels"][0] and "revision_author_id" not in body["levels"][0]
    assert client.get(f"/public/design3d/levels/{lid}/background").status_code == 404
    client.put(f"/design3d/levels/{lid}", json={"base_revision": 1, "show_background_public": True}, headers=headers())
    assert client.get(f"/public/design3d/levels/{lid}/background").status_code == 200
```

- [ ] **Step 2 : échec** — FAIL.

- [ ] **Step 3 : implémentation**

`app/geometry.py` :
```python
"""Transformations pures sur le document géométrie (miroir de frontend/src/utils/floorplan.js)."""


def _pt(p: dict, f: float) -> dict:
    return {"x": p["x"] * f, "y": p["y"] * f}


def rescale(geometry: dict, factor: float) -> dict:
    """Remet à l'échelle positions/longueurs (recalibration). Épaisseurs, largeurs d'ouverture,
    hauteurs et allèges sont des dimensions réelles saisies : elles ne changent pas."""
    return {
        "walls": [{**w, "a": _pt(w["a"], factor), "b": _pt(w["b"], factor)} for w in geometry.get("walls", [])],
        "rooms": [{**r, "polygon": [_pt(p, factor) for p in r["polygon"]]} for r in geometry.get("rooms", [])],
        "openings": [{**o, "offset_m": o["offset_m"] * factor} for o in geometry.get("openings", [])],
    }


def calibration_scale(old: dict | None, new: dict) -> float:
    """Facteur à appliquer à une géométrie calibrée avec `old` pour l'exprimer avec `new`
    (même segment de référence, nouvelle longueur en mètres). Sans ancienne calibration → 1."""
    if not old:
        return 1.0
    return float(new["meters"]) / float(old["meters"])
```

`app/storage.py` : copie de `services/listing/app/storage.py` avec `plans()` et bucket `DESIGN_PLANS_BUCKET` (défaut `semsar-design-plans`).

Routes (dans `main.py`) :
```python
from fastapi import File, UploadFile
from fastapi.responses import Response as RawResponse
from pydantic import BaseModel
from . import storage
from .geometry import calibration_scale, rescale
from .schemas import CalibrationIn

_IMAGE_TYPES = {"image/png": "png", "image/jpeg": "jpg"}
_MAX_BG = 10 * 1024 * 1024


class RecalibrateIn(BaseModel):
    base_revision: int
    calibration: CalibrationIn


@app.post("/design3d/levels/{level_id}/recalibrate")
def recalibrate(level_id: str, body: RecalibrateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    if body.base_revision != lv.revision:
        return JSONResponse({"error": "Version obsolète", "level": lv.to_dict()}, status_code=409)
    new = body.calibration.model_dump()
    lv.geometry = rescale(lv.geometry or dict(EMPTY_GEOMETRY), calibration_scale(lv.calibration, new))
    lv.calibration = new
    lv.revision += 1
    lv.revision_author_id = _uid(principal)
    db.commit()
    return lv.to_dict()


@app.post("/design3d/levels/{level_id}/background")
async def upload_background(level_id: str, file: UploadFile = File(...), principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    ext = _IMAGE_TYPES.get(file.content_type or "")
    if ext is None:
        return _err("Image PNG ou JPEG requise", 400)
    data = await file.read()
    if len(data) > _MAX_BG:
        return _err("Image trop volumineuse (10 Mo max)", 413)
    key = f"design3d/{p.id}/{lv.id}/background.{ext}"
    storage.plans().put(key, data, file.content_type)
    lv.background_image_key = key
    db.commit()
    return lv.to_dict()


def _stream_background(lv: DesignLevel):
    if not lv.background_image_key:
        return _err("Not found", 404)
    data = storage.plans().get(lv.background_image_key)
    ctype = "image/png" if lv.background_image_key.endswith(".png") else "image/jpeg"
    return RawResponse(content=data, media_type=ctype, headers={"Cache-Control": "private, max-age=3600"})


@app.get("/design3d/levels/{level_id}/background")
def get_background(level_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    return err or _stream_background(lv)


@app.get("/public/design3d/projects/{project_id}")
def public_project(project_id: str, db: Session = Depends(get_db)):
    p = db.get(DesignProject, project_id)
    if p is None or p.status != "ready":
        return _err("Not found", 404)
    return {**p.to_dict(), "levels": [lv.to_dict(public=True) for lv in _levels(db, p.id)]}


@app.get("/public/design3d/levels/{level_id}/background")
def public_background(level_id: str, db: Session = Depends(get_db)):
    lv = db.get(DesignLevel, level_id)
    p = db.get(DesignProject, lv.project_id) if lv else None
    if lv is None or p is None or p.status != "ready" or not lv.show_background_public:
        return _err("Not found", 404)
    return _stream_background(lv)
```

`pyproject.toml` : ajouter `"python-multipart>=0.0.9"` (upload) dans les dépendances.

- [ ] **Step 4 : succès** — suite complète verte.
- [ ] **Step 5 : commit** — `feat(design3d): recalibration, image de fond MinIO, lecture publique`.

---

### Task 6 : Plomberie plateforme + entitlement de bout en bout

**Files:**
- Modify: `gateway/app/config.py` (`design3d_url: str | None = None`), `gateway/app/main.py` (state, routes, fermeture), `gateway/tests/test_design3d_routes.py` (create)
- Modify: `scripts/dev-mesh-up.sh`, `.github/workflows/ci.yml`, `infra/prod/ansible/roles/mesh/vars/main.yml`, `tools/check_env_examples.py`
- Modify: `services/billing/app/models.py` (`has_design3d`), `services/billing/app/seed.py`, `services/billing/app/main.py` (sérialisation), create `services/billing/db/migrate_design3d.sql`
- Modify: `services/billing/app/main.py` (payload de `billing.subscription.activated` : ajouter `features`), `services/identity/app/worker.py` (projection `AgencyRO.features`), tests correspondants
- Modify: `libs/semsar_auth/semsar_auth/rbac.py` + `gateway/app/main.py::_inject_identity` (en-tête `x-semsar-features`) si absent (cf. Task 1 Step 4)

- [ ] **Step 1 : gateway**

`_resolve_upstream` (après la règle `partner`) :
```python
    if settings.design3d_url and (path.startswith("/api/v1/design3d/") or path == "/api/v1/design3d"
                                  or path.startswith("/api/v1/public/design3d/")):
        return app.state.design3d, path.replace("/api/v1", "", 1)
```
`app.state.design3d = _client_or_none(settings.design3d_url)` dans le lifespan + ajout au tuple de fermeture.

Test (`gateway/tests/test_design3d_routes.py`, patron `test_kyc_routes.py`) : `/api/v1/design3d/projects` → `("DESIGN3D", "/design3d/projects")`, `/api/v1/public/design3d/projects/x` → `("DESIGN3D", "/public/design3d/projects/x")`, non mappé si `design3d_url=None`.

- [ ] **Step 2 : mesh / CI / prod / garde-fou**

- `dev-mesh-up.sh` : `design3d:8526` dans `SVCS` et dans la boucle de santé ; `design3d) extra="$S3 DESIGN_PLANS_BUCKET=semsar-design-plans";;` ; `design3d` dans la liste `relay` ; `DESIGN3D_URL=http://localhost:8526` dans le bloc BFF.
- `ci.yml` : `services/design3d` dans `ALL`.
- Ansible `mesh_apps` : `{ name: design3d, port: 8526 }` ; `mesh_relays` : `design3d`.
- `tools/check_env_examples.py` : `"8526": "design3d"`.
- `services/design3d/.env.example` déjà cohérent ; exécuter `python3 tools/check_env_examples.py` → OK.

- [ ] **Step 3 : billing → identity : projection des entitlements**

État constaté : `AgencyRO.features` est créé vide par `identity/app/worker.py` et **jamais alimenté** par billing (écart documenté dans `services/billing/app/main.py:11`). Sans correction, aucun entitlement (artisans, contracts, design3d…) n'atteint le JWT en v2. Correction ciblée, nécessaire à cette brique :

1. `services/billing/app/models.py` : `has_design3d = Column(Boolean, default=False)` ; `db/migrate_design3d.sql` : `ALTER TABLE billing.plan ADD COLUMN IF NOT EXISTS has_design3d BOOLEAN NOT NULL DEFAULT false;` ; `seed.py` : `True` pour Pro et Enterprise ; sérialisation `/plans` : `"has_design3d": p.has_design3d`.
2. `services/billing/app/main.py` : fonction `plan_features(p) -> list[str]` = `[name for flag, name in (("has_contracts","contracts"),("has_legal","legal"),("has_artisans","artisans"),("has_rental","rental"),("has_programs","programs"),("has_analytics","analytics"),("has_api_access","api_access"),("has_csv_import","csv_import"),("has_staymanager_sync","staymanager_sync"),("has_design3d","design3d")) if getattr(p, flag)]` ; l'événement `billing.subscription.activated` (et tout événement de changement de plan existant — lire `main.py` pour la liste exacte) porte `"agency_id"` et `"features": plan_features(plan)`.
3. `services/identity/app/worker.py` : binding `billing.#` ; sur `billing.subscription.activated` avec `agency_id` → `AgencyRO.features = payload.get("features", [])` (créer la ligne si absente, patron existant `agency.created`). Test dans `services/identity/tests/test_worker_features.py` : l'événement met à jour `features`, et `/auth/me`/JWT les expose (réutiliser `_features`).
4. `libs/semsar_auth/semsar_auth/rbac.py` : si `get_principal` (mode `TRUST_GATEWAY_HEADERS`) ne lit pas encore les features, ajouter `features=[f for f in request.headers.get("x-semsar-features", "").split(",") if f]` ; `gateway/app/main.py::_inject_identity` : `headers["x-semsar-features"] = ",".join(ident.get("features", []))` (vérifier que `_identity_from_claims` recopie `features` depuis les claims JWT). Test gateway : `_inject_identity` pose l'en-tête.

- [ ] **Step 4 : vérifier**

Run : `cd gateway && python3 -m pytest tests -q` ; `cd services/billing && python3 -m pytest tests -q` ; `cd services/identity && python3 -m pytest tests -q` ; `cd services/design3d && python3 -m pytest tests -q` ; `python3 tools/check_env_examples.py` ; `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`.
Expected : tout vert.

- [ ] **Step 5 : commit** — `feat(platform): câblage design3d (gateway, mesh, CI, prod) + entitlements de plan projetés dans le JWT`.

---

### Task 7 : Frontend — dépendances + `utils/floorplan.js` (logique pure) — TDD

**Files:**
- Modify: `frontend/package.json` (+ `idb`, `fake-indexeddb` (dev), `vite-plugin-pwa` (dev), `@playwright/test` (dev)) + lockfile ; `CHANGELOG.md` (entrée « Unreleased »)
- Create: `frontend/src/utils/floorplan.js`, `frontend/src/utils/floorplan.test.js`

**Interfaces:**
- Produces (toutes pures, coordonnées en mètres sauf mention) :
  - `newId()` → UUID hex 32
  - `dist(a, b)`, `wallLength(wall)`, `polygonArea(polygon)` (valeur absolue, shoelace), `levelArea(geometry)`
  - `snapToGrid(p, step)`, `snapToPoints(p, points, tolerance)`, `snapAngle(origin, p, enabled)` (0/45/90°)
  - `projectPointOnWall(p, wall)` → `{offset_m, distance, point}` (offset borné à `[0, length]`)
  - `normalizedToMeters(pNorm, calibration, imageAspect)` / `metersToNormalized(pM, calibration, imageAspect)` — l'échelle est `meters / distNorm(p1,p2)` en tenant compte du ratio largeur/hauteur de l'image (les coordonnées normalisées ne sont pas isotropes)
  - `rescaleGeometry(geometry, factor)` (miroir de `app/geometry.py`)
  - `validateGeometry(geometry, wallHeightM)` → `string[]` (mêmes règles que le serveur)
  - `bbox(geometry)` → `{minX, minY, maxX, maxY}`

- [ ] **Step 1 : dépendances**

Run: `cd frontend && npm install idb && npm install -D fake-indexeddb vite-plugin-pwa @playwright/test && npm audit --audit-level=high`
Expected : installation propre, lockfile mis à jour, audit sans « high ». Entrée CHANGELOG : « Éditeur de plan 2D (design3d) — hors-ligne, PWA, tablette ».

- [ ] **Step 2 : tests**

```js
// src/utils/floorplan.test.js
import { describe, it, expect } from 'vitest'
import {
  polygonArea, wallLength, snapToGrid, snapToPoints, snapAngle, projectPointOnWall,
  normalizedToMeters, metersToNormalized, rescaleGeometry, validateGeometry, levelArea, bbox, newId,
} from './floorplan'

const W = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness_m: 0.2 }

describe('floorplan geometry', () => {
  it('newId is 32 hex chars', () => expect(newId()).toMatch(/^[0-9a-f]{32}$/))
  it('wallLength', () => expect(wallLength({ a: { x: 0, y: 0 }, b: { x: 3, y: 4 } })).toBe(5))
  it('polygonArea square and concave', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(12)
    expect(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 2, y: 2 }, { x: 0, y: 4 }])).toBe(12)
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(0)
  })
  it('levelArea sums rooms', () => {
    const g = { walls: [], openings: [], rooms: [
      { id: 'r1', type: 'living', name: 'S', polygon: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }] },
      { id: 'r2', type: 'wc', name: 'W', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }] }
    expect(levelArea(g)).toBe(5)
  })
  it('snapToGrid', () => expect(snapToGrid({ x: 1.26, y: 0.74 }, 0.5)).toEqual({ x: 1.5, y: 0.5 }))
  it('snapToPoints within tolerance only', () => {
    expect(snapToPoints({ x: 4.05, y: 0.02 }, [W.a, W.b], 0.15)).toEqual(W.b)
    expect(snapToPoints({ x: 3, y: 1 }, [W.a, W.b], 0.15)).toEqual({ x: 3, y: 1 })
  })
  it('snapAngle rounds to 45° when enabled', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 3, y: 0.4 }, true)
    expect(p.y).toBeCloseTo(0, 6)
    const q = snapAngle({ x: 0, y: 0 }, { x: 2, y: 2.3 }, true)
    expect(q.x).toBeCloseTo(q.y, 6)
    expect(snapAngle({ x: 0, y: 0 }, { x: 3, y: 0.4 }, false)).toEqual({ x: 3, y: 0.4 })
  })
  it('projectPointOnWall clamps and measures distance', () => {
    expect(projectPointOnWall({ x: 1, y: 0.3 }, W)).toMatchObject({ offset_m: 1, distance: 0.3 })
    expect(projectPointOnWall({ x: 9, y: 0 }, W).offset_m).toBe(4)
    expect(projectPointOnWall({ x: -2, y: 0 }, W).offset_m).toBe(0)
  })
  it('calibration round-trips with non-square image', () => {
    const cal = { p1: { x: 0.1, y: 0.5 }, p2: { x: 0.5, y: 0.5 }, meters: 4 } // 0.4 de largeur = 4 m
    const aspect = 2 // image 2× plus large que haute
    const m = normalizedToMeters({ x: 0.5, y: 0.75 }, cal, aspect)
    expect(m.x).toBeCloseTo(4, 6)          // 0.4 → 4 m, origine à p1... (x: (0.5-0.1)*10)
    expect(m.y).toBeCloseTo(1.25, 6)       // 0.25 de hauteur = 0.25 * (H en m) avec H = W/aspect = 10/2 = 5 → 1.25
    expect(metersToNormalized(m, cal, aspect)).toEqual({ x: 0.5, y: 0.75 })
  })
  it('rescaleGeometry mirrors server', () => {
    const g = rescaleGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9, height_m: 2.1, sill_m: 0 }] }, 2)
    expect(g.walls[0].b).toEqual({ x: 8, y: 0 })
    expect(g.walls[0].thickness_m).toBe(0.2)
    expect(g.openings[0]).toMatchObject({ offset_m: 2, width_m: 0.9 })
  })
  it('validateGeometry mirrors server rules', () => {
    expect(validateGeometry({ walls: [W], rooms: [], openings: [] }, 2.7)).toEqual([])
    expect(validateGeometry({ walls: [{ ...W, b: { x: 0, y: 0 } }], rooms: [], openings: [] }, 2.7).length).toBe(1)
    expect(validateGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'door', offset_m: 3.5, width_m: 0.9, height_m: 2.1, sill_m: 0 }] }, 2.7).length).toBe(1)
    expect(validateGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'window', offset_m: 1, width_m: 1, height_m: 2, sill_m: 1 }] }, 2.7).length).toBe(1)
  })
  it('bbox', () => expect(bbox({ walls: [W], rooms: [], openings: [] })).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 0 }))
})
```

Convention de calibration à implémenter (et à documenter en tête de fichier) : l'origine du repère métrique est le **coin haut-gauche de l'image** ; `scale = meters / (|p2−p1| en unités « largeur d'image »)` où la distance normalisée est calculée avec `dx = (p2.x−p1.x)`, `dy = (p2.y−p1.y)/aspect` (l'axe y normalisé est comprimé du ratio) ; alors `xM = xNorm * Wm`, `yM = yNorm * Hm` avec `Wm = 1/scaleNormPerMeter…` — plus simplement : `Wm = meters / hypot(dx, dy)` (largeur de l'image en mètres) et `Hm = Wm / aspect`. Le test ci-dessus est calé sur cette convention (dx = 0.4, dy = 0 → Wm = 10 m, Hm = 5 m).

- [ ] **Step 3 : échec** — Run: `npx vitest run src/utils/floorplan.test.js` → FAIL.

- [ ] **Step 4 : implémentation**

```js
// src/utils/floorplan.js
/**
 * Géométrie pure de l'éditeur de plan (mètres). Miroir de services/design3d/app/schemas.py
 * (validation) et app/geometry.py (rescale) : toute règle changée d'un côté l'est de l'autre.
 *
 * Repère : origine = coin haut-gauche de l'image de fond (ou de la grille), x → droite, y → bas.
 * Calibration : {p1, p2} normalisés (0-1) sur l'image, `meters` = longueur réelle du segment.
 * Largeur de l'image en mètres Wm = meters / hypot(dx, dy/aspect) ; hauteur Hm = Wm / aspect.
 */
export const ROOM_TYPES = ['living', 'bedroom', 'kitchen', 'bathroom', 'wc', 'hallway', 'balcony', 'garage', 'other']
export const EMPTY_GEOMETRY = { walls: [], rooms: [], openings: [] }
const MAX_BYTES = 512 * 1024

export const newId = () => crypto.randomUUID().replace(/-/g, '')
export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
export const wallLength = (w) => dist(w.a, w.b)

export function polygonArea(poly) {
  if (!poly || poly.length < 3) return 0
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return Math.abs(s) / 2
}

export const levelArea = (g) => (g.rooms || []).reduce((acc, r) => acc + polygonArea(r.polygon), 0)

export const snapToGrid = (p, step) => ({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step })

export function snapToPoints(p, points, tolerance) {
  let best = null, bestD = tolerance
  for (const q of points) {
    const d = dist(p, q)
    if (d <= bestD) { best = q; bestD = d }
  }
  return best ? { x: best.x, y: best.y } : p
}

export function snapAngle(origin, p, enabled) {
  if (!enabled) return p
  const dx = p.x - origin.x, dy = p.y - origin.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return p
  const step = Math.PI / 4
  const ang = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: origin.x + Math.cos(ang) * len, y: origin.y + Math.sin(ang) * len }
}

export function projectPointOnWall(p, wall) {
  const { a, b } = wall
  const len = dist(a, b)
  if (len === 0) return { offset_m: 0, distance: dist(p, a), point: { ...a } }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)))
  const point = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
  return { offset_m: t * len, distance: dist(p, point), point }
}

function imageMeters(cal, aspect) {
  const dx = cal.p2.x - cal.p1.x, dy = (cal.p2.y - cal.p1.y) / aspect
  const wM = cal.meters / Math.hypot(dx, dy)
  return { wM, hM: wM / aspect }
}
export function normalizedToMeters(pn, cal, aspect) {
  const { wM, hM } = imageMeters(cal, aspect)
  return { x: pn.x * wM, y: pn.y * hM }
}
export function metersToNormalized(pm, cal, aspect) {
  const { wM, hM } = imageMeters(cal, aspect)
  return { x: pm.x / wM, y: pm.y / hM }
}

const sp = (p, f) => ({ x: p.x * f, y: p.y * f })
export const rescaleGeometry = (g, f) => ({
  walls: (g.walls || []).map(w => ({ ...w, a: sp(w.a, f), b: sp(w.b, f) })),
  rooms: (g.rooms || []).map(r => ({ ...r, polygon: r.polygon.map(p => sp(p, f)) })),
  openings: (g.openings || []).map(o => ({ ...o, offset_m: o.offset_m * f })),
})

export function bbox(g) {
  const pts = [...(g.walls || []).flatMap(w => [w.a, w.b]), ...(g.rooms || []).flatMap(r => r.polygon)]
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX: Math.min(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)),
           maxX: Math.max(...pts.map(p => p.x)), maxY: Math.max(...pts.map(p => p.y)) }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isPt = (p) => p && isNum(p.x) && isNum(p.y)

export function validateGeometry(g, wallHeightM) {
  const errors = []
  if (!g || typeof g !== 'object') return ['geometry doit être un objet']
  if (JSON.stringify(g).length > MAX_BYTES) errors.push('geometry dépasse 512 Ko')
  const walls = g.walls || [], rooms = g.rooms || [], openings = g.openings || []
  for (const [coll, name] of [[walls, 'walls'], [rooms, 'rooms'], [openings, 'openings']]) {
    const ids = coll.map(e => e.id)
    if (new Set(ids).size !== ids.length || ids.some(i => !i)) errors.push(`${name}: identifiants manquants ou en double`)
  }
  const byId = {}
  for (const w of walls) {
    if (!isPt(w.a) || !isPt(w.b) || wallLength(w) <= 0) { errors.push(`mur ${w.id}: deux points distincts requis`); continue }
    if (!isNum(w.thickness_m) || !(w.thickness_m > 0 && w.thickness_m <= 1)) errors.push(`mur ${w.id}: thickness_m dans ]0, 1]`)
    byId[w.id] = w
  }
  for (const r of rooms) {
    if (!r.polygon || r.polygon.length < 3 || !r.polygon.every(isPt)) errors.push(`pièce ${r.id}: polygone ≥ 3 points`)
    if (!ROOM_TYPES.includes(r.type)) errors.push(`pièce ${r.id}: type inconnu`)
  }
  for (const o of openings) {
    if (!['door', 'window'].includes(o.type)) errors.push(`ouverture ${o.id}: type inconnu`)
    const w = byId[o.wall_id]
    if (!w) { errors.push(`ouverture ${o.id}: mur introuvable`); continue }
    const { offset_m: off = 0, width_m: wd = 0, height_m: h = 0, sill_m: sill = 0 } = o
    if (![off, wd, h, sill].every(isNum) || wd <= 0 || off < 0) { errors.push(`ouverture ${o.id}: dimensions invalides`); continue }
    if (off + wd > wallLength(w) + 1e-6) errors.push(`ouverture ${o.id}: dépasse le mur`)
    if (sill + h > wallHeightM + 1e-6) errors.push(`ouverture ${o.id}: dépasse la hauteur du mur`)
  }
  return errors
}
```

- [ ] **Step 5 : succès** — `npx vitest run src/utils/floorplan.test.js` vert ; `npm run lint` vert.
- [ ] **Step 6 : commit** — `feat(frontend): logique géométrique pure de l'éditeur de plan + dépendances hors-ligne/PWA`.

---

### Task 8 : Couche locale IndexedDB + moteur de synchronisation — TDD

**Files:**
- Create: `frontend/src/services/design3dLocal.js`, `frontend/src/services/design3dApi.js`, `frontend/src/services/design3dSync.js`
- Create: `frontend/src/services/design3dSync.test.js`
- Modify: `frontend/src/test/setup.js` (importer `fake-indexeddb/auto` sous condition d'environnement de test)

**Interfaces:**
- `design3dLocal` (async, toutes les fonctions retournent des promesses) :
  - `openDb()` ; stores `projects` (clé `id`), `levels` (clé `id`, index `project_id`), `backgrounds` (clé `level_id`, valeur `{blob, type}`), `outbox` (clé auto, index `seq`)
  - `getProject(id)`, `putProject(p)`, `listProjects(targetType, targetId)`, `deleteProjectLocal(id)`
  - `getLevel(id)`, `putLevel(lv)` (lv porte `revision`, `dirty: bool`, `base_revision`), `listLevels(projectId)`
  - `putBackground(levelId, blob, type)`, `getBackground(levelId)`
  - `enqueue(op)` où `op = {type, payload, created_at}` ; `peek()`, `remove(id)`, `pendingCount()`, `clearAll()`
- `design3dApi` : appels axios (`api` existant) : `createProject`, `updateProject`, `deleteProject`, `createLevel`, `updateLevel(id, {base_revision, ...})`, `deleteLevel`, `uploadBackground(id, blob)`, `recalibrate`, `getProject`, `sync()`, `listShelf(levelId)`, `dismissShelf`.
- `design3dSync` :
  - `applyLocal(op)` : écrit en local puis `enqueue(op)` (une seule fonction pour toute mutation UI)
  - `runOnce({api, local, onState})` → traite l'`outbox` dans l'ordre ; retourne `{synced, pending, conflict}` ; pose `state` ∈ `offline | syncing | synced | conflict | auth_expired`
  - `startEngine({api, local, onState, intervalMs = 30000})` → écoute `online`, `visibilitychange`, timer ; `stop()`
  - `refreshFromServer({api, local})` : `GET /sync` puis recharge les niveaux non `dirty` dont la révision a avancé ; signale `shelved_count > 0`
  - Règle : sur 409 pour `level.update`, remplace le niveau local par `error.level` (le travail du collègue est sur l'étagère du propriétaire), marque `conflict` ; sur réponse `shelved: true`, marque `conflict` (propriétaire à avertir) ; sur 401 → `auth_expired`, file conservée, arrêt jusqu'au prochain `online`/visibilité ; sur erreur réseau → backoff `min(2^n * 1000, 300000)`.

- [ ] **Step 1 : tests**

```js
// src/services/design3dSync.test.js
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as local from './design3dLocal'
import { applyLocal, runOnce, refreshFromServer } from './design3dSync'

const lvl = (over = {}) => ({ id: 'l'.repeat(32), project_id: 'p'.repeat(32), name: 'RDC', position: 0, revision: 0,
  wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false, ...over })

function fakeApi(overrides = {}) {
  return {
    createProject: vi.fn(async (p) => ({ ...p, levels: [lvl()] })),
    updateLevel: vi.fn(async (id, body) => ({ ...lvl(), revision: body.base_revision + 1, shelved: false })),
    sync: vi.fn(async () => ({ projects: [] })),
    getProject: vi.fn(async () => ({ id: 'p'.repeat(32), levels: [lvl({ revision: 3 })] })),
    ...overrides,
  }
}

beforeEach(async () => { await local.clearAll() })

describe('design3d sync engine', () => {
  it('applyLocal writes locally before any network call', async () => {
    const api = fakeApi()
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    expect((await local.getLevel(lvl().id)).dirty).toBe(true)
    expect(api.updateLevel).not.toHaveBeenCalled()
    expect(await local.pendingCount()).toBe(1)
  })

  it('replays outbox in order and removes ops only after success', async () => {
    const calls = []
    const api = fakeApi({
      createProject: vi.fn(async (p) => { calls.push('create'); return { ...p, levels: [lvl()] } }),
      updateLevel: vi.fn(async (id, b) => { calls.push('update'); return { ...lvl(), revision: 1, shelved: false } }),
    })
    await applyLocal({ type: 'project.create', payload: { id: 'p'.repeat(32), target_type: 'property', target_id: 1, title: 'A' } }, { local })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const r = await runOnce({ api, local, onState: () => {} })
    expect(calls).toEqual(['create', 'update'])
    expect(r).toMatchObject({ synced: 2, pending: 0 })
    expect((await local.getLevel(lvl().id)).revision).toBe(1)
    expect((await local.getLevel(lvl().id)).dirty).toBe(false)
  })

  it('keeps the op and backs off on network error', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw Object.assign(new Error('net'), { code: 'ERR_NETWORK' }) }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    const r = await runOnce({ api, local, onState: (s) => states.push(s.state) })
    expect(r.pending).toBe(1)
    expect(states.at(-1)).toBe('offline')
    expect(r.retryInMs).toBeGreaterThan(0)
  })

  it('stops on 401 keeping the queue', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw { response: { status: 401 } } }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    await runOnce({ api, local, onState: (s) => states.push(s.state) })
    expect(states.at(-1)).toBe('auth_expired')
    expect(await local.pendingCount()).toBe(1)
  })

  it('409 replaces local level with server version and flags conflict', async () => {
    const server = lvl({ revision: 5, name: 'Serveur' })
    const api = fakeApi({ updateLevel: vi.fn(async () => { throw { response: { status: 409, data: { level: server } } } }) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    await runOnce({ api, local, onState: (s) => states.push(s) })
    expect((await local.getLevel(lvl().id)).name).toBe('Serveur')
    expect(await local.pendingCount()).toBe(0)
    expect(states.at(-1).state).toBe('conflict')
  })

  it('owner shelved response flags conflict but keeps own version', async () => {
    const api = fakeApi({ updateLevel: vi.fn(async (id, b) => ({ ...lvl(), revision: 7, shelved: true })) })
    await applyLocal({ type: 'level.update', payload: { id: lvl().id, geometry: { walls: [], rooms: [], openings: [] }, base_revision: 0 } }, { local })
    const states = []
    await runOnce({ api, local, onState: (s) => states.push(s) })
    expect(states.at(-1).state).toBe('conflict')
    expect((await local.getLevel(lvl().id)).revision).toBe(7)
  })

  it('offline-created project keeps its id after sync', async () => {
    const api = fakeApi()
    await applyLocal({ type: 'project.create', payload: { id: 'p'.repeat(32), target_type: 'property', target_id: 1, title: 'A' } }, { local })
    await runOnce({ api, local, onState: () => {} })
    expect(api.createProject.mock.calls[0][0].id).toBe('p'.repeat(32))
    expect((await local.getProject('p'.repeat(32))).synced).toBe(true)
  })

  it('refreshFromServer reloads non-dirty levels whose revision advanced', async () => {
    await local.putLevel(lvl({ revision: 1 }))
    const api = fakeApi({ sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 3, shelved_count: 0 }] }] })) })
    await refreshFromServer({ api, local })
    expect((await local.getLevel(lvl().id)).revision).toBe(3)
  })

  it('refreshFromServer leaves dirty levels alone', async () => {
    await local.putLevel(lvl({ revision: 1, dirty: true, name: 'Local' }))
    const api = fakeApi({ sync: vi.fn(async () => ({ projects: [{ id: 'p'.repeat(32), levels: [{ id: lvl().id, revision: 3, shelved_count: 0 }] }] })) })
    await refreshFromServer({ api, local })
    expect((await local.getLevel(lvl().id)).name).toBe('Local')
  })
})
```

- [ ] **Step 2 : échec** — `npx vitest run src/services/design3dSync.test.js` → FAIL.

- [ ] **Step 3 : implémentation**

`design3dLocal.js` (idb) :
```js
import { openDB } from 'idb'

const DB = 'semsar-design3d', VERSION = 1
let dbp
export function openDb() {
  dbp ??= openDB(DB, VERSION, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' })
      db.createObjectStore('levels', { keyPath: 'id' }).createIndex('project_id', 'project_id')
      db.createObjectStore('backgrounds', { keyPath: 'level_id' })
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
    },
  })
  return dbp
}
export const getProject = async (id) => (await openDb()).get('projects', id)
export const putProject = async (p) => (await openDb()).put('projects', p)
export const deleteProjectLocal = async (id) => {
  const db = await openDb()
  const tx = db.transaction(['projects', 'levels', 'backgrounds'], 'readwrite')
  await tx.objectStore('projects').delete(id)
  for (const lv of await tx.objectStore('levels').index('project_id').getAll(id)) {
    await tx.objectStore('levels').delete(lv.id); await tx.objectStore('backgrounds').delete(lv.id)
  }
  await tx.done
}
export const listProjects = async (targetType, targetId) =>
  (await (await openDb()).getAll('projects')).filter(p => p.target_type === targetType && p.target_id === targetId)
export const getLevel = async (id) => (await openDb()).get('levels', id)
export const putLevel = async (lv) => (await openDb()).put('levels', lv)
export const listLevels = async (projectId) => (await openDb()).getAllFromIndex('levels', 'project_id', projectId)
export const putBackground = async (level_id, blob, type) => (await openDb()).put('backgrounds', { level_id, blob, type })
export const getBackground = async (level_id) => (await openDb()).get('backgrounds', level_id)
export const enqueue = async (op) => (await openDb()).add('outbox', { ...op, created_at: Date.now() })
export const peek = async () => { const all = await (await openDb()).getAll('outbox'); return all[0] ?? null }
export const remove = async (seq) => (await openDb()).delete('outbox', seq)
export const pendingCount = async () => (await openDb()).count('outbox')
export const clearAll = async () => {
  const db = await openDb()
  await Promise.all(['projects', 'levels', 'backgrounds', 'outbox'].map(s => db.clear(s)))
}
```

`design3dApi.js` : fonctions axios sur `api` (`/design3d/...`), `uploadBackground` en `FormData`, `sync` → `GET /design3d/sync`.

`design3dSync.js` :
```js
import * as defaultLocal from './design3dLocal'
import * as defaultApi from './design3dApi'
import { newId } from '../utils/floorplan'

const NET = (e) => !e?.response && (e?.code === 'ERR_NETWORK' || e?.message === 'net' || !navigator.onLine)
let failures = 0

export async function applyLocal(op, { local = defaultLocal } = {}) {
  const p = op.payload
  switch (op.type) {
    case 'project.create': {
      await local.putProject({ ...p, id: p.id ?? newId(), status: 'draft', synced: false })
      const lid = p.level_id ?? newId()
      await local.putLevel({ id: lid, project_id: p.id, name: 'RDC', position: 0, revision: 0, base_revision: 0,
        wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false })
      break
    }
    case 'project.update': await local.putProject({ ...(await local.getProject(p.id)), ...p }); break
    case 'project.delete': await local.deleteProjectLocal(p.id); break
    case 'level.create': await local.putLevel({ revision: 0, base_revision: 0, dirty: false, ...p }); break
    case 'level.update': {
      const cur = (await local.getLevel(p.id)) ?? { id: p.id, revision: 0 }
      await local.putLevel({ ...cur, ...p, base_revision: cur.dirty ? cur.base_revision : cur.revision, dirty: true })
      break
    }
    case 'level.delete': await local.putLevel({ ...(await local.getLevel(p.id)), deleted: true }); break
    case 'level.background': await local.putBackground(p.id, p.blob, p.type); break
    default: throw new Error(`op inconnue: ${op.type}`)
  }
  await local.enqueue(op)
}

async function send(op, api, local) {
  const p = op.payload
  switch (op.type) {
    case 'project.create': {
      const r = await api.createProject(p)
      await local.putProject({ ...(await local.getProject(p.id)), ...r, synced: true }); return
    }
    case 'project.update': await api.updateProject(p.id, p); return
    case 'project.delete': await api.deleteProject(p.id); return
    case 'level.create': await api.createLevel(p.project_id, p); return
    case 'level.update': {
      const cur = await local.getLevel(p.id)
      const r = await api.updateLevel(p.id, { base_revision: cur.base_revision ?? 0, name: cur.name, position: cur.position,
        wall_height_m: cur.wall_height_m, calibration: cur.calibration, geometry: cur.geometry,
        show_background_public: cur.show_background_public })
      await local.putLevel({ ...cur, ...r, base_revision: r.revision, dirty: false })
      return r.shelved ? 'shelved' : undefined
    }
    case 'level.delete': await api.deleteLevel(p.id); return
    case 'level.background': { const bg = await local.getBackground(p.id); await api.uploadBackground(p.id, bg.blob, bg.type); return }
    default: throw new Error(`op inconnue: ${op.type}`)
  }
}

export async function runOnce({ api = defaultApi, local = defaultLocal, onState }) {
  let synced = 0, conflict = false
  onState?.({ state: 'syncing', pending: await local.pendingCount() })
  for (;;) {
    const op = await local.peek()
    if (!op) break
    try {
      const flag = await send(op, api, local)
      if (flag === 'shelved') conflict = true
      await local.remove(op.seq); synced++; failures = 0
    } catch (e) {
      const status = e?.response?.status
      if (status === 401) { onState?.({ state: 'auth_expired', pending: await local.pendingCount() }); return { synced, pending: await local.pendingCount(), conflict } }
      if (status === 409 && op.type === 'level.update') {
        const server = e.response.data?.level
        if (server) await local.putLevel({ ...server, base_revision: server.revision, dirty: false })
        await local.remove(op.seq); conflict = true; continue
      }
      if (status === 422 || status === 403 || status === 404) { await local.remove(op.seq); onState?.({ state: 'error', error: e.response?.data, pending: await local.pendingCount() }); continue }
      if (NET(e) || !status) {
        failures++
        const retryInMs = Math.min(2 ** failures * 1000, 300000)
        onState?.({ state: 'offline', pending: await local.pendingCount(), retryInMs })
        return { synced, pending: await local.pendingCount(), conflict, retryInMs }
      }
      await local.remove(op.seq)
    }
  }
  const pending = await local.pendingCount()
  onState?.({ state: conflict ? 'conflict' : 'synced', pending, at: Date.now() })
  return { synced, pending, conflict }
}

export async function refreshFromServer({ api = defaultApi, local = defaultLocal, onShelved } = {}) {
  const { projects } = await api.sync()
  for (const p of projects) {
    for (const lv of p.levels) {
      const cur = await local.getLevel(lv.id)
      if (lv.shelved_count > 0) onShelved?.(lv.id, lv.shelved_count)
      if (cur?.dirty) continue
      if (!cur || lv.revision > cur.revision) {
        const full = await api.getProject(p.id)
        const fresh = full.levels.find(l => l.id === lv.id)
        if (fresh) await local.putLevel({ ...fresh, base_revision: fresh.revision, dirty: false })
        await local.putProject({ ...(await local.getProject(p.id)), ...full, levels: undefined, synced: true })
      }
    }
  }
}

export function startEngine({ api = defaultApi, local = defaultLocal, onState, intervalMs = 30000 }) {
  let timer = null, running = false
  const tick = async () => {
    if (running || !navigator.onLine) return
    running = true
    try { const r = await runOnce({ api, local, onState }); if (!r.retryInMs) await refreshFromServer({ api, local }) }
    catch { /* réseau : réessai au prochain tick */ } finally { running = false }
  }
  const onOnline = () => tick()
  const onVis = () => { if (document.visibilityState === 'visible') tick() }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVis)
  timer = setInterval(tick, intervalMs)
  tick()
  return { tick, stop() { clearInterval(timer); window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVis) } }
}
```

`src/test/setup.js` : ajouter `import 'fake-indexeddb/auto'` (le fichier est déjà le setup vitest).

- [ ] **Step 4 : succès** — `npx vitest run src/services/design3dSync.test.js` vert ; lint vert.
- [ ] **Step 5 : commit** — `feat(frontend): couche locale IndexedDB et moteur de synchronisation design3d`.

---

### Task 9 : Éditeur (composants SVG, page, route, entrées, entitlement front, i18n)

**Files:**
- Create: `frontend/src/components/design/FloorplanCanvas.jsx`, `Toolbar.jsx`, `PropertiesPanel.jsx`, `LevelTabs.jsx`, `CalibrationOverlay.jsx`, `NumericPad.jsx`, `SyncBadge.jsx`, `ShelfDialog.jsx`, `useFloorplanEditor.js` (reducer + undo/redo)
- Create: `frontend/src/pages/dashboard/DesignEditor.jsx`, `DesignProjects.jsx` (liste/création depuis un bien), `DesignEditor.test.jsx`, `useFloorplanEditor.test.js`
- Modify: `frontend/src/App.jsx` (routes `dashboard/conception`, `dashboard/conception/:projectId`), `frontend/src/pages/dashboard/MyProperties.jsx` et `frontend/src/pages/dashboard/ProgramPlanEditor.jsx` (bouton « Concevoir en 3D »), `frontend/src/store/authStore.js` (`features` depuis `/auth/me`, `hasFeature(name)`), `frontend/src/locales/{fr,ar}/dashboard.json`

**Interfaces:**
- `useFloorplanEditor(initialLevel)` → `{ state: {geometry, tool, selection, draft, zoom, pan, grid, snap}, dispatch, undo, redo, canUndo, canRedo }` ; actions : `SET_TOOL`, `ADD_WALL`, `MOVE_VERTEX`, `ADD_ROOM`, `SET_ROOM_TYPE`, `ADD_OPENING`, `UPDATE_ELEMENT`, `DELETE_SELECTED`, `SET_VIEW`, `LOAD_GEOMETRY`.
- Chaque action qui modifie `geometry` appelle `onChange(geometry)` → la page fait `applyLocal({type:'level.update', ...})` (débounce 500 ms).
- `FloorplanCanvas` props : `{ level, background (URL objet ou null), aspect, state, dispatch, readOnly, compact }` — pointer events, `touch-action: none`, deux pointeurs = pan/zoom, un pointeur = outil ; hit-targets ≥ 44 px (rayon en px converti en mètres via le zoom).
- `authStore.hasFeature('design3d')` : lit `user.features` (retourné par `/auth/me` — vérifier que la réponse identity contient `features` ; sinon l'ajouter à `identity/app/auth.py::me` depuis `_features`).

- [ ] **Step 1 : tests du reducer**

```js
// src/components/design/useFloorplanEditor.test.js
import { describe, it, expect } from 'vitest'
import { reducer, initialState } from './useFloorplanEditor'

const s0 = initialState({ geometry: { walls: [], rooms: [], openings: [] } })

describe('floorplan editor reducer', () => {
  it('adds a wall and supports undo/redo', () => {
    const s1 = reducer(s0, { type: 'ADD_WALL', wall: { id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness_m: 0.2 } })
    expect(s1.geometry.walls).toHaveLength(1)
    const s2 = reducer(s1, { type: 'UNDO' })
    expect(s2.geometry.walls).toHaveLength(0)
    expect(reducer(s2, { type: 'REDO' }).geometry.walls).toHaveLength(1)
  })
  it('deleting a wall deletes its openings', () => {
    let s = reducer(s0, { type: 'ADD_WALL', wall: { id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness_m: 0.2 } })
    s = reducer(s, { type: 'ADD_OPENING', opening: { id: 'o1', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9, height_m: 2.1, sill_m: 0 } })
    s = reducer(s, { type: 'SELECT', selection: { kind: 'wall', id: 'w1' } })
    s = reducer(s, { type: 'DELETE_SELECTED' })
    expect(s.geometry.openings).toHaveLength(0)
  })
  it('caps history at 50', () => {
    let s = s0
    for (let i = 0; i < 60; i++) s = reducer(s, { type: 'ADD_WALL', wall: { id: `w${i}`, a: { x: i, y: 0 }, b: { x: i + 1, y: 0 }, thickness_m: 0.1 } })
    expect(s.past.length).toBe(50)
  })
})
```

- [ ] **Step 2 : implémentation** — `useFloorplanEditor.js` : `reducer` pur (past/present/future), `initialState`, hook exportant `dispatch` enveloppé (toute action de géométrie pousse dans `past`). Composants SVG :
  - `FloorplanCanvas` : `<svg viewBox="${pan.x} ${pan.y} ${w/zoom} ${h/zoom}">` en mètres ; couches : fond (image, opacité 0,6), grille (pattern), pièces (polygones colorés par type, libellé + surface), murs (`<line>` `stroke-width = thickness_m`, `stroke-linecap: square`), ouvertures (rectangles blancs/bleus posés via `projectPointOnWall`), draft en cours (pointillé), poignées (cercles rayon `Math.max(0.12, 22/pxPerMeter)` m). Gestion pointeurs : `Map` de pointeurs actifs ; 2 pointeurs → pan/zoom (distance/centre), 1 pointeur → outil ; `setPointerCapture` ; appui long (500 ms sans déplacement > 8 px) → `onContextMenu`.
  - `Toolbar` : boutons ≥ 44 px, icônes `react-icons/fi` (`FiMousePointer`, `FiMinus`, `FiSquare`, `FiLogIn` porte, `FiSun` fenêtre, `FiHash` cotes, `FiRotateCcw`/`FiRotateCw`, `FiZoomIn`/`FiZoomOut`, `FiMaximize2` plein écran), état actif, `aria-pressed`.
  - `PropertiesPanel` : formulaire contextuel (mur : longueur via `NumericPad`, épaisseur ; pièce : type `<select>` + nom + surface ; ouverture : type, largeur, hauteur, allège) + surface totale (`levelArea`).
  - `NumericPad` : pavé 0-9 . ⌫ ✓, valeur contrôlée, `inputMode="decimal"` en repli.
  - `LevelTabs`, `CalibrationOverlay` (deux clics + saisie mètres, bloque les outils tant que `calibration == null` en mode calque), `SyncBadge` (états de la spec), `ShelfDialog` (aperçu SVG de la version mise de côté via `FloorplanCanvas readOnly`, boutons « Récupérer » → `LOAD_GEOMETRY` + `applyLocal(level.update)` puis `dismissShelf`, « Ignorer » → `dismissShelf`).
  - `DesignEditor.jsx` : charge le niveau depuis `design3dLocal` (puis `refreshFromServer` si en ligne), `startEngine` au montage / `stop` au démontage, layout responsive : `< 900px` → barre d'outils en bas + panneau en bottom sheet (`<details>`-like avec poignée, hauteur 40 %), sinon colonnes ; bouton plein écran (`document.documentElement.requestFullscreen` si dispo, sinon masque la nav via une classe sur le layout).
  - `DesignProjects.jsx` : liste des projets d'un bien (`listProjects` local ∪ serveur), « Nouveau projet » (`applyLocal(project.create)` puis navigation immédiate — fonctionne hors-ligne), « Marquer prêt ».
  - Entrées : bouton « Concevoir en 3D » sur `MyProperties.jsx` (par annonce) et `ProgramPlanEditor.jsx` (par lot), rendu seulement si `hasFeature('design3d')`, sinon vignette « Module conception 3D — à activer dans votre abonnement » (lien vers `/dashboard/compte/abonnement`).
  - i18n : `dashboard:designEditor.*` (outils, panneau, états de synchro, calibration, dialogues, types de pièce `roomTypes.living`…), FR + AR (AR revu par le même patron que les autres namespaces).

- [ ] **Step 3 : test de rendu** — `DesignEditor.test.jsx` (patron `PropertyForm.test.jsx`) : rendu FR/AR de la page (titre, barre d'outils), avec `fake-indexeddb` et `design3dApi` mocké ; vérifier qu'un `ADD_WALL` via interaction pointeur simulée (`fireEvent.pointerDown/Up` sur le svg avec l'outil Mur) produit un mur et incrémente `pendingCount`.

- [ ] **Step 4 : vérifier** — `npm run lint && npx vitest run src/components/design src/pages/dashboard/DesignEditor.test.jsx src/i18n && npm run build`.
- [ ] **Step 5 : commit** — `feat(frontend): éditeur de plan 2D hors-ligne (canevas SVG tactile, niveaux, calibration, étagère)`.

---

### Task 10 : Visionneuse publique + intégration fiches

**Files:**
- Create: `frontend/src/components/design/DesignViewer.jsx`, `DesignViewer.test.jsx`
- Modify: `frontend/src/pages/PropertyDetail.jsx`, `frontend/src/pages/ProgramDetail.jsx`, `frontend/src/services/propertyService.js` (ou nouveau `design3dPublic.js`), `frontend/src/locales/{fr,ar}/public.json`

- [ ] **Step 1 : test** — `DesignViewer.test.jsx` : à partir d'un projet `ready` mocké (2 niveaux, 2 pièces), rend les onglets, les libellés de pièce traduits FR/AR, la surface totale formatée (`useFormat`), pas d'`<img>` de fond quand `background_image_key` absent.
- [ ] **Step 2 : implémentation** — `DesignViewer` = `FloorplanCanvas readOnly` + `LevelTabs` + légende des types ; `PropertyDetail` : requête `GET /api/v1/design3d/projects?...` n'est pas publique → utiliser `GET /api/v1/public/design3d/projects/{id}` ; la fiche connaît les projets via un nouveau champ **`design_project_ids`** ? Non : plus simple, `services/listing` n'est pas modifié ; on ajoute côté `design3d` `GET /public/design3d/by-target?target_type=&target_id=` (projets `ready` d'un bien) — ajouter la route et son test au service (même règle `ready`), puis la fiche l'interroge et affiche la section « Plan du bien » si non vide.
- [ ] **Step 3 : vérifier** — `npx vitest run src/components/design/DesignViewer.test.jsx src/i18n && npm run build` ; backend : `cd services/design3d && python3 -m pytest -q`.
- [ ] **Step 4 : commit** — `feat(design3d): visionneuse publique du plan sur les fiches bien et programme`.

---

### Task 11 : PWA, tablette, tests Playwright 6 viewports, revue sur appareils

**Files:**
- Modify: `frontend/vite.config.js` (`VitePWA`), create `frontend/public/manifest` assets (icônes 192/512), `frontend/index.html` (theme-color)
- Create: `frontend/playwright.config.js`, `frontend/e2e/design-editor.spec.js`
- Modify: `frontend/package.json` (script `test:e2e`), `.github/workflows/ci.yml` (job `frontend-semsarout` : `npx playwright install --with-deps chromium && npm run test:e2e` après le build)

- [ ] **Step 1 : PWA** — `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'SemsarOut', short_name: 'SemsarOut', display: 'standalone', orientation: 'any', theme_color: '#0B1220', icons: [...] }, workbox: { navigateFallback: '/index.html', runtimeCaching: [{ urlPattern: ({url}) => url.pathname.startsWith('/api/'), handler: 'NetworkFirst', options: { cacheName: 'api', networkTimeoutSeconds: 5 } }] } })`. Vérifier que `/api/v1/design3d/*` n'est **pas** servi depuis le cache pour les écritures (Workbox ne met en cache que GET) et que `index.html` reste `no-store` côté nginx en prod (déjà le cas, cf. mémoire prod).
- [ ] **Step 2 : Playwright** — `playwright.config.js` : `webServer: { command: 'npm run preview -- --port 4173', url: 'http://localhost:4173' }`, projets : `ipad-mini-portrait` 768×1024, `ipad-mini-landscape` 1024×768, `ipad-portrait` 820×1180, `ipad-landscape` 1180×820, `ipad-pro-portrait` 1024×1366, `ipad-pro-landscape` 1366×1024, tous `hasTouch: true, isMobile: false`. Le spec mocke l'API via `page.route('**/api/v1/**', …)` (auth `/auth/me` avec `features: ['design3d']`, `design3d/sync` vide). Scénarios : (1) ouvrir `/dashboard/conception/<id>` en mode dessin libre, choisir Mur, deux `touchscreen.tap` → un `<line>` de mur existe ; (2) Porte : tap sur le mur → un `<rect>` d'ouverture ; (3) sous 900 px, le bottom sheet est replié puis dépliable ; (4) pinch simulé via `page.touchscreen` (deux `dispatchEvent` de `pointerdown` multi-pointeurs) modifie le `viewBox` ; (5) `page.setViewportSize` inverse → l'éditeur reste rendu, l'état (mur présent) survit ; (6) mode hors-ligne (`context.setOffline(true)`) : ajouter un mur, le badge affiche « 1 modification en attente », `setOffline(false)` → badge « Synchronisé ».
- [ ] **Step 3 : lancer** — `npx playwright install chromium && npm run test:e2e` → 6 × 6 verts ; `npm run build` ; `npm run lint`.
- [ ] **Step 4 : revue manuelle sur appareils (obligatoire avant de marquer livré)** — sur un iPad réel (Safari) et une tablette Android réelle (Chrome), depuis le mesh de dev exposé sur le réseau local : installer la PWA, tracer un plan complet (fond + calibration + 4 murs + 2 pièces + 1 porte + 1 fenêtre), couper le Wi-Fi, continuer à éditer, fermer l'app, la rouvrir hors-ligne (le plan est là), rétablir le Wi-Fi → synchronisé ; vérifier la précision du doigt avec la loupe, la rotation, le pavé numérique en portrait. Consigner les constats dans `docs/superpowers/plans/2026-09-08-design3d-floorplan.md` (section « Revue appareils ») avec les corrections apportées.
- [ ] **Step 5 : commit** — `feat(frontend): PWA, ergonomie tablette et tests Playwright multi-viewports de l'éditeur de plan`.

---

### Task 12 : Intégration finale

- [ ] `bash scripts/dev-mesh-up.sh` → `design3d` répond 200 ; créer un projet depuis le backoffice, le marquer prêt, vérifier la section « Plan du bien » sur la fiche publique.
- [ ] Suites : `for d in services/design3d services/billing services/identity gateway; do (cd $d && python3 -m pytest -q); done` ; `cd frontend && npm run lint && npx vitest run && npm run build && npm run test:e2e`.
- [ ] `python3 tools/check_env_examples.py` ; CHANGELOG à jour ; `docs/architecture-v2-status.md` : ligne `design3d :8526` dans le tableau des services post-coupure et `docs/architecture-v2.drawio` : nœud `design3d`.
- [ ] Commit `docs(architecture): ajoute le service design3d`, puis proposer la fusion sur `develop` (pas de push sans accord).

## Self-Review Notes

- **Couverture spec** : modèle (T1), validation (T2), CRUD/entitlement/cloisonnement (T3), règle de conflit + étagère + `/sync` (T4), recalibration/fond/public (T5), plomberie + **projection des entitlements de bout en bout** (T6 — écart préexistant corrigé car il bloquait la garde), géométrie pure (T7), hors-ligne/synchro (T8), éditeur tactile + niveaux + calibration + étagère (T9), visionneuse publique (T10), PWA + tablette + Playwright + revue appareils (T11), intégration/docs (T12).
- **Écart de la spec** : la spec prévoyait `PUT /levels/{id}` pour la recalibration ; le plan la sépare en `POST /recalibrate` (revision check strict) pour éviter qu'une recalibration passe par la règle « propriétaire prime » et écrase silencieusement — cohérent avec l'intention.
- **Point à vérifier en T1/T6** : nom exact de l'en-tête des features entre BFF et services (`x-semsar-features`) — il n'existe peut-être pas encore ; le plan l'ajoute des deux côtés.
- **Hors périmètre respecté** : pas de 3D, pas de rendu IA, pas de catalogue, pas d'add-on payant (le flag `has_design3d` est seedé, pas vendu), pas de PDF→image, pas de fusion automatique.

## Revue appareils (tâche 11)

**Automatisé (fait, CI)** — `frontend/e2e/design-editor.spec.js` joue 6 scénarios sur
6 formats de tablette (768×1024, 1024×768, 820×1180, 1180×820, 1024×1366, 1366×1024),
tactile activé, API simulée : tracé de mur au doigt, pose d'une porte, repli/dépli du
panneau sous 900 px, pinch à deux doigts, rotation de l'écran, aller-retour hors-ligne
(file d'attente + badge). 36/36 verts.

**À faire par un humain (non réalisable par un agent)** — la revue sur matériel réel
reste ouverte. Protocole, à consigner ici avec les constats et les correctifs :

- [ ] iPad réel (Safari) : installer la PWA depuis le mesh de dev exposé sur le réseau local (« Sur l'écran d'accueil »), vérifier l'icône, le nom « SemsarOut » et le lancement en `standalone` (pas de barre d'URL).
- [ ] Tablette Android réelle (Chrome) : même installation via la bannière/menu « Installer l'application ».
- [ ] Tracer un plan complet : import d'un fond, calibration à deux points, 4 murs, 2 pièces, 1 porte, 1 fenêtre.
- [ ] Couper le Wi-Fi, continuer à éditer : le badge doit passer à « Hors connexion — n en attente », aucune action ne doit bloquer.
- [ ] Fermer l'application, la rouvrir **toujours hors ligne** : le plan doit être là (IndexedDB), l'éditeur doit démarrer (pré-cache du service worker).
- [ ] Rétablir le Wi-Fi : le badge doit repasser à « À jour » sans intervention.
- [ ] Précision du doigt : les poignées et les cibles font 44 px ; vérifier la sélection d'un sommet, l'accrochage et la lisibilité au zoom maximal.
- [ ] Rotation portrait ↔ paysage en cours d'édition : rien ne doit être perdu ni recadré de travers.
- [ ] Pavé numérique en portrait : saisie d'une longueur de mur au clavier virtuel, sans que le champ passe sous le clavier.

**Constats :** _(à remplir lors de la revue)_
