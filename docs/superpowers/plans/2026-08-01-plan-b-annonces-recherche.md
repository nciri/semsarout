# Plan B — Annonces & recherche coloc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le service `coloc-listing` (porté du dépôt initial m3a-l3achrane) tourne dans le mesh 0semsar, ses annonces publiées sont indexées dans OpenSearch, le BFF expose `GET /listings` + CRUD, et les surfaces recherche/détail du front affichent des données réelles.

**Architecture:** Nouveau service FastAPI `services/coloc-listing` (port **8521**, schéma PG `coloc_listing`) suivant les conventions du mesh (sync SQLAlchemy, `semsar_*`, outbox `enqueue` + relay, erreurs legacy `{"error": msg}`). La machine à états à 9 statuts et le modèle du dépôt initial sont portés avec adaptations documentées. À l'approbation, l'événement `coloc.listing_published` alimente un index OpenSearch `coloc_listings` via le worker du service `search`, qui expose `GET /listings` (filtres + tri). Le front bascule `listings` en live via un mapper EN→FR.

**Tech Stack:** FastAPI, SQLAlchemy (sync), semsar_events (outbox/relay/consumer), OpenSearch (opensearchpy), pytest+sqlite, React/Vite (front), node --test (mappers).

**Spec :** `docs/superpowers/specs/2026-08-01-branchement-m3a-l3achrane-backend-design.md` §4.1, §5, §7. **Références de portage** : dépôt initial `/home/younes/Documents/work/m3a-l3achrane/services/listing` (lecture seule).

## Global Constraints

- Nommage : **`m3a-l3achrane` en entier partout** ; le service s'appelle `coloc-listing`, rôle/schéma PG `coloc_listing` (le `-` devient `_`, cf. `role()` de dev-mesh-up.sh).
- Erreurs : format legacy `{"error": "<message>"}` via `_err()` + `install_legacy_error_handlers` (comme messaging/geo).
- Garde tenant : toutes les routes métier du service exigent `x-semsar-tenant: m3a-l3achrane` (dépendance routeur) → sinon `403 {"error": "Tenant interdit"}`. `/health` et `/metrics` non gardés.
- Identité : via en-têtes `x-semsar-*` (`semsar_auth.get_principal`, `TRUST_GATEWAY_HEADERS=true` en dev) ; `owner_id` est un **BigInteger** (ids identity semsarout). Modération = `principal.is_superadmin`.
- Confidentialité (portée du dépôt initial) : `address`, `latitude`, `longitude` **jamais exposés** dans les réponses API, les événements ni l'index.
- Non-mixité : contrainte dure — `housing_gender=MIXTE_FAMILIAL` refusé à la création (`422`).
- Montants : `Numeric(12,2)`, jamais de float en base (float uniquement dans les documents d'index).
- Adaptations de portage actées (ne pas « corriger » vers l'original) : géo en **chaînes** `city`/`neighborhood` (pas d'UUID geo, pas de PostGIS) ; **`title`/`description` ajoutés** au modèle ; PK UUID hex `String(32)` applicatives ; enums en `String` validés par Pydantic ; médias par **URL seulement** (pas d'upload dans ce service).
- Statuts (9, verbatim) : `BROUILLON, EN_MODERATION, PUBLIEE, RESERVEE, LOUEE, EXPIREE, ARCHIVEE, REJETEE, SUSPENDUE`.
- Événements (routing keys) : `coloc.listing_published`, `coloc.listing_status_changed` — outbox `semsar_events.enqueue(session, aggregate_type, aggregate_id, event_type, payload)`.
- Additif strict : aucune route/réponse semsarout existante ne change ; le worker search garde ses bindings `listing.#` intacts.
- Commits : Conventional Commits, un commit par tâche, sans trailer d'attribution IA. Aucun secret en dur.

## Contrats partagés entre tâches (source de vérité)

**Document d'index/événement publié** (produit par B2 `_search_doc`, indexé par B3, consommé par B6) :

```json
{
  "listing_id": "9f7c…32hex", "title": "Chambre lumineuse à Gauthier",
  "description": "…", "city": "Casablanca", "neighborhood": "Gauthier",
  "property_type": "APPARTEMENT", "bed_type": "CHAMBRE_INDIVIDUELLE",
  "housing_gender": "FEMININ", "furnished": true, "rent": 2200.0,
  "currency": "MAD", "capacity": 3, "available_from": "2026-09-01",
  "published_at": "2026-08-01T12:00:00+00:00",
  "media_urls": ["/uploads/photos/demo1.jpg"], "rules": ["Non-fumeur"],
  "amenities": ["wifi", "machine_a_laver"], "status": "PUBLIEE"
}
```

**Réponse `GET /listings` (search)** : `{"total": int, "items": [<doc ci-dessus>…]}`.
**Réponse détail `GET /listings/{id}` (coloc-listing)** : `to_dict()` du listing (B2) — mêmes clés que le doc + `id`, `status`, `charges_included`, `charges_amount`, `deposit`, `duration_min_months`, `duration_max_months`, `floor`, `area_m2`, `property_type`, `media` (liste `{url, position, media_type}`), `house_rules` (liste `{code, value}`), `roommates` (`{total, women, men}` ou `null`).
**Paramètres `GET /listings`** : `city`, `neighborhood`, `housing_gender` (`FEMININ|MASCULIN`), `kind` (`chambre|studio|residence`), `min_rent`, `max_rent`, `q`, `sort` (`relevance|rent_asc|rent_desc|recent`), `limit` (1-100, déf. 20), `offset` (déf. 0).

---

### Task B1: Squelette du service + modèles + machine à états

**Files:**
- Create: `services/coloc-listing/pyproject.toml`, `services/coloc-listing/db/schema.sql`, `services/coloc-listing/.env.example`, `services/coloc-listing/README.md`
- Create: `services/coloc-listing/app/__init__.py` (vide), `app/db.py`, `app/models.py`, `app/state_machine.py`
- Test: `services/coloc-listing/tests/conftest.py`, `tests/test_state_machine.py`, `tests/test_models.py`

**Interfaces:**
- Produces: `Base`, `get_db`, `init_db` (db.py) ; modèles `ColocProperty`, `Listing`, `ListingMedia`, `HouseRule`, `CurrentRoommates` avec `Listing.to_dict() -> dict` ; `assert_transition(current: str, target: str)` + `TransitionError` + `EDITABLE_STATUSES = {"BROUILLON", "REJETEE"}` (state_machine.py) ; fixtures pytest `db_session`, `client` (conftest, client ajouté en B2).

- [ ] **Step 1: pyproject + schema.sql + .env.example + README**

`services/coloc-listing/pyproject.toml` :

```toml
[project]
name = "semsar-coloc-listing"
version = "0.1.0"
description = "M3a-L3achrane — service coloc-listing (annonces de colocation, porté du dépôt initial)."
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "prometheus-fastapi-instrumentator>=7.0",
    "SQLAlchemy>=2.0",
    "psycopg[binary]>=3.1",
    "semsar-common",
    "semsar-auth",
    "semsar-events",
]

[project.optional-dependencies]
test = ["pytest>=8.0", "httpx>=0.27"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["app"]
```

`services/coloc-listing/db/schema.sql` :

```sql
-- Service coloc-listing — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE coloc_listing LOGIN PASSWORD 'coloc_listing';
CREATE SCHEMA IF NOT EXISTS coloc_listing AUTHORIZATION coloc_listing;
ALTER ROLE coloc_listing SET search_path = coloc_listing;
GRANT ALL ON SCHEMA coloc_listing TO coloc_listing;
```

`services/coloc-listing/.env.example` :

```
SERVICE_NAME=coloc-listing
DATABASE_URL=postgresql+psycopg://coloc_listing:coloc_listing@localhost:5432/semsar_dev
RABBITMQ_URL=amqp://semsar:semsar@localhost:5672/
EVENTS_EXCHANGE=semsar.events
TRUST_GATEWAY_HEADERS=true
OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=INFO
```

`services/coloc-listing/README.md` :

```markdown
# coloc-listing — annonces de colocation M3a-L3achrane

Port du service `listing` du dépôt initial m3a-l3achrane, adapté aux conventions
du mesh (sync SQLAlchemy, libs semsar_*, erreurs legacy). Port :8521.

Cycle de vie : BROUILLON → EN_MODERATION → PUBLIEE (modération superadmin),
9 statuts, transitions strictes (app/state_machine.py). À l'approbation,
`coloc.listing_published` part en outbox → index OpenSearch `coloc_listings`
(worker du service search).

Démarrage :
    psql "$ADMIN" -f db/schema.sql
    uvicorn app.main:app --port 8521
    python -m app.relay          # outbox → RabbitMQ
Seed de démo (dev) : python -m app.seed_demo
```

- [ ] **Step 2: db.py (patron messaging, rôle coloc_listing)**

`services/coloc-listing/app/db.py` :

```python
"""Accès données du service coloc-listing — schéma + rôle dédiés (ADR-0002)."""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from semsar_common import get_settings

_settings = get_settings()
_engine = create_engine(
    _settings.database_url or "postgresql+psycopg://coloc_listing:coloc_listing@localhost:5432/semsar",
    future=True, pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def init_db() -> None:
    from semsar_events import OutboxBase  # table outbox locale au schéma du service

    Base.metadata.create_all(_engine)
    OutboxBase.metadata.create_all(_engine)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 3: Tests state machine (échec attendu : module absent)**

`services/coloc-listing/tests/conftest.py` (version B1 — la fixture `client` arrive en B2) :

```python
import os

os.environ.setdefault("TRUST_GATEWAY_HEADERS", "true")

import pytest  # noqa: E402
from sqlalchemy import BigInteger, create_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from semsar_events import OutboxBase  # noqa: E402

from app import models  # noqa: E402,F401 — enregistre les tables
from app.db import Base  # noqa: E402


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    return "INTEGER"


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'test.db'}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()
```

`services/coloc-listing/tests/test_state_machine.py` (transitions du dépôt initial, verbatim) :

```python
import pytest

from app.state_machine import EDITABLE_STATUSES, TransitionError, assert_transition


@pytest.mark.parametrize(("current", "target"), [
    ("BROUILLON", "EN_MODERATION"), ("EN_MODERATION", "PUBLIEE"),
    ("EN_MODERATION", "REJETEE"), ("PUBLIEE", "RESERVEE"),
    ("RESERVEE", "LOUEE"), ("REJETEE", "BROUILLON"),
    ("PUBLIEE", "ARCHIVEE"), ("SUSPENDUE", "PUBLIEE"),
])
def test_allowed(current, target):
    assert_transition(current, target)  # ne lève pas


@pytest.mark.parametrize(("current", "target"), [
    ("BROUILLON", "PUBLIEE"), ("PUBLIEE", "BROUILLON"),
    ("ARCHIVEE", "PUBLIEE"), ("LOUEE", "PUBLIEE"),
])
def test_forbidden(current, target):
    with pytest.raises(TransitionError):
        assert_transition(current, target)


def test_editable_statuses():
    assert EDITABLE_STATUSES == {"BROUILLON", "REJETEE"}
```

- [ ] **Step 4: Vérifier l'échec**

Run: `cd services/coloc-listing && python3 -m pytest tests/ -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.state_machine'` (installer d'abord : `pip install -e "services/coloc-listing[test]"` depuis la racine).

- [ ] **Step 5: state_machine.py (porté du dépôt initial, statuts en chaînes)**

`services/coloc-listing/app/state_machine.py` :

```python
"""Machine à états des annonces — portée de m3a-l3achrane (domain/state_machine.py).

9 statuts, transitions strictes. RESERVEE/LOUEE/EXPIREE/SUSPENDUE seront pilotés
par d'autres services (booking, trust) via événements — plans E/F.
"""

STATUSES = frozenset({
    "BROUILLON", "EN_MODERATION", "PUBLIEE", "RESERVEE", "LOUEE",
    "EXPIREE", "ARCHIVEE", "REJETEE", "SUSPENDUE",
})

EDITABLE_STATUSES = {"BROUILLON", "REJETEE"}

_TRANSITIONS: dict[str, frozenset[str]] = {
    "BROUILLON": frozenset({"EN_MODERATION", "ARCHIVEE"}),
    "EN_MODERATION": frozenset({"PUBLIEE", "REJETEE", "BROUILLON"}),
    "PUBLIEE": frozenset({"RESERVEE", "EXPIREE", "SUSPENDUE", "ARCHIVEE"}),
    "RESERVEE": frozenset({"LOUEE", "PUBLIEE", "ARCHIVEE"}),
    "LOUEE": frozenset({"EXPIREE", "ARCHIVEE"}),
    "REJETEE": frozenset({"BROUILLON", "ARCHIVEE"}),
    "SUSPENDUE": frozenset({"PUBLIEE", "ARCHIVEE"}),
    "EXPIREE": frozenset({"BROUILLON", "ARCHIVEE"}),
    "ARCHIVEE": frozenset(),  # état terminal
}


class TransitionError(ValueError):
    pass


def assert_transition(current: str, target: str) -> None:
    if target not in _TRANSITIONS[current]:
        raise TransitionError(f"transition interdite : {current} → {target}")
```

- [ ] **Step 6: Tests modèles (échec : models absent)**

`services/coloc-listing/tests/test_models.py` :

```python
from decimal import Decimal

from app.models import ColocProperty, CurrentRoommates, HouseRule, Listing, ListingMedia


def _listing(db):
    prop = ColocProperty(owner_id=7, city="Casablanca", neighborhood="Gauthier",
                         property_type="APPARTEMENT", area_m2=90,
                         amenities={"wifi": True, "machine_a_laver": True})
    db.add(prop); db.flush()
    listing = Listing(property_id=prop.id, owner_id=7, title="Chambre lumineuse à Gauthier",
                      description="Belle chambre.", bed_type="CHAMBRE_INDIVIDUELLE",
                      rent=Decimal("2200.00"), housing_gender="FEMININ", furnished=True, capacity=3)
    db.add(listing); db.flush()
    db.add(HouseRule(listing_id=listing.id, code="fumeur", value="Non-fumeur"))
    db.add(ListingMedia(listing_id=listing.id, url="/uploads/photos/demo1.jpg",
                        position=0, media_type="CHAMBRE"))
    db.add(CurrentRoommates(listing_id=listing.id, total=2, women=2, men=0))
    db.commit(); db.refresh(listing)
    return listing


def test_defaults_and_to_dict(db_session):
    listing = _listing(db_session)
    assert listing.status == "BROUILLON"
    assert listing.currency == "MAD"
    d = listing.to_dict()
    assert d["title"] == "Chambre lumineuse à Gauthier"
    assert d["city"] == "Casablanca"
    assert d["rent"] == 2200.0
    assert d["media"] == [{"url": "/uploads/photos/demo1.jpg", "position": 0, "media_type": "CHAMBRE"}]
    assert d["house_rules"] == [{"code": "fumeur", "value": "Non-fumeur"}]
    assert d["roommates"] == {"total": 2, "women": 2, "men": 0}
    # Confidentialité : jamais d'adresse ni de coordonnées dans les sorties.
    assert "address" not in d and "latitude" not in d and "longitude" not in d
```

Run: `python3 -m pytest tests/test_models.py -v` → FAIL (`No module named 'app.models'`).

- [ ] **Step 7: models.py**

`services/coloc-listing/app/models.py` :

```python
"""Modèles du domaine coloc-listing (schéma `coloc_listing`) — portés de m3a-l3achrane.

Adaptations actées : géo en chaînes city/neighborhood (pas d'UUID geo ni PostGIS),
title/description ajoutés (le front en a besoin), owner_id = id identity (BigInteger),
PK UUID hex applicatives, enums en String validés au niveau API.
L'adresse exacte et les coordonnées ne sont JAMAIS exposées (révélées après
acceptation d'une mise en relation — plan E).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .db import Base

PROPERTY_TYPES = {"APPARTEMENT", "MAISON", "VILLA", "STUDIO", "RESIDENCE_ETUDIANTE", "CHEZ_HABITANT"}
BED_TYPES = {"CHAMBRE_INDIVIDUELLE", "CHAMBRE_PARTAGEE", "LIT_DORTOIR", "STUDIO_ENTIER", "APPARTEMENT_ENTIER"}
HOUSING_GENDERS = {"FEMININ", "MASCULIN", "MIXTE_FAMILIAL"}
MEDIA_TYPES = {"CHAMBRE", "PARTIES_COMMUNES", "AUTRE"}


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ColocProperty(Base):
    __tablename__ = "properties"

    id = Column(String(32), primary_key=True, default=_uuid)
    owner_id = Column(BigInteger, nullable=False, index=True)
    city = Column(String(80), nullable=False, index=True)
    neighborhood = Column(String(120))
    address = Column(String(300))   # jamais exposée publiquement
    latitude = Column(Numeric(9, 6))    # jamais exposées
    longitude = Column(Numeric(9, 6))
    property_type = Column(String(30), nullable=False)
    floor = Column(Integer)
    area_m2 = Column(Integer)
    amenities = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    listings = relationship("Listing", back_populates="property")


class Listing(Base):
    __tablename__ = "listings"

    id = Column(String(32), primary_key=True, default=_uuid)
    property_id = Column(String(32), ForeignKey("properties.id"), nullable=False, index=True)
    owner_id = Column(BigInteger, nullable=False, index=True)
    title = Column(String(160), nullable=False)
    description = Column(Text, default="", nullable=False)
    bed_type = Column(String(30), nullable=False)
    rent = Column(Numeric(12, 2), nullable=False)
    charges_included = Column(Boolean, default=False, nullable=False)
    charges_amount = Column(Numeric(12, 2))
    deposit = Column(Numeric(12, 2))
    currency = Column(String(3), default="MAD", nullable=False)
    furnished = Column(Boolean, default=False, nullable=False)
    housing_gender = Column(String(20), nullable=False)
    capacity = Column(Integer, default=1, nullable=False)
    available_from = Column(Date)
    duration_min_months = Column(Integer)
    duration_max_months = Column(Integer)
    status = Column(String(20), default="BROUILLON", nullable=False, index=True)
    published_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    property = relationship("ColocProperty", back_populates="listings", lazy="joined")
    media = relationship("ListingMedia", cascade="all, delete-orphan",
                         order_by="ListingMedia.position", lazy="selectin")
    house_rules = relationship("HouseRule", cascade="all, delete-orphan", lazy="selectin")
    roommates = relationship("CurrentRoommates", uselist=False,
                             cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self) -> dict:
        p = self.property
        return {
            "id": self.id, "title": self.title, "description": self.description,
            "status": self.status, "city": p.city, "neighborhood": p.neighborhood,
            "property_type": p.property_type, "floor": p.floor, "area_m2": p.area_m2,
            "amenities": [k for k, v in (p.amenities or {}).items() if v],
            "bed_type": self.bed_type, "rent": float(self.rent),
            "charges_included": self.charges_included,
            "charges_amount": float(self.charges_amount) if self.charges_amount is not None else None,
            "deposit": float(self.deposit) if self.deposit is not None else None,
            "currency": self.currency, "furnished": self.furnished,
            "housing_gender": self.housing_gender, "capacity": self.capacity,
            "available_from": self.available_from.isoformat() if self.available_from else None,
            "duration_min_months": self.duration_min_months,
            "duration_max_months": self.duration_max_months,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "media": [{"url": m.url, "position": m.position, "media_type": m.media_type}
                      for m in self.media],
            "house_rules": [{"code": r.code, "value": r.value} for r in self.house_rules],
            "roommates": ({"total": self.roommates.total, "women": self.roommates.women,
                           "men": self.roommates.men} if self.roommates else None),
        }


class ListingMedia(Base):
    __tablename__ = "listing_media"

    id = Column(String(32), primary_key=True, default=_uuid)
    listing_id = Column(String(32), ForeignKey("listings.id"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    position = Column(Integer, default=0, nullable=False)
    media_type = Column(String(20), nullable=False)


class HouseRule(Base):
    __tablename__ = "house_rules"
    __table_args__ = (UniqueConstraint("listing_id", "code", name="uq_house_rules_listing_code"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    listing_id = Column(String(32), ForeignKey("listings.id"), nullable=False, index=True)
    code = Column(String(40), nullable=False)
    value = Column(String(120), nullable=False)


class CurrentRoommates(Base):
    """Agrégat NON NOMINATIF des colocataires en place (aucune identité)."""

    __tablename__ = "current_roommates"
    __table_args__ = (UniqueConstraint("listing_id", name="uq_current_roommates_listing"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    listing_id = Column(String(32), ForeignKey("listings.id"), nullable=False, index=True)
    total = Column(Integer, default=0, nullable=False)
    women = Column(Integer, default=0, nullable=False)
    men = Column(Integer, default=0, nullable=False)
    statuses = Column(JSON, default=dict, nullable=False)
```

- [ ] **Step 8: Vérifier le vert**

Run: `cd services/coloc-listing && python3 -m pytest tests/ -v`
Expected: PASS (tests state machine + modèles).

- [ ] **Step 9: Commit**

```bash
git add services/coloc-listing
git commit -m "feat(coloc-listing): squelette du service — modèles portés + machine à états 9 statuts"
```

---

### Task B2: Routes API + cycle de vie + événements

**Files:**
- Create: `services/coloc-listing/app/main.py`, `app/schemas.py`, `app/events.py`, `app/relay.py`
- Modify: `services/coloc-listing/tests/conftest.py` (fixture `client`)
- Test: `services/coloc-listing/tests/test_listings.py`

**Interfaces:**
- Consumes: modèles + `assert_transition`/`EDITABLE_STATUSES` (B1) ; `semsar_events.enqueue` ; `semsar_auth.get_principal`.
- Produces: routes `POST /listings`, `GET /me/listings`, `GET /listings/{id}` (public, PUBLIEE seulement), `PATCH /listings/{id}`, `PUT /listings/{id}/house-rules`, `PUT /listings/{id}/roommates`, `POST /listings/{id}/media`, `POST /listings/{id}/{submit|approve|reject|archive}` ; fonction `_search_doc(listing) -> dict` (contrat « document d'index » de l'en-tête) ; événements `coloc.listing_published` (payload = `_search_doc`) et `coloc.listing_status_changed` (`{listing_id, previous_status, new_status}`).

- [ ] **Step 1: Ajouter la fixture client au conftest**

Ajouter à la fin de `services/coloc-listing/tests/conftest.py` :

```python
@pytest.fixture
def client(db_session):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def headers(user_id: int = 7, *, superadmin: bool = False,
            tenant: str = "m3a-l3achrane") -> dict:
    """En-têtes x-semsar-* comme injectés par le BFF (TRUST_GATEWAY_HEADERS)."""
    h = {"x-semsar-user-id": str(user_id), "x-semsar-tenant": tenant}
    if superadmin:
        h["x-semsar-superadmin"] = "1"
    return h
```

- [ ] **Step 2: Écrire les tests HTTP (échec : main absent)**

`services/coloc-listing/tests/test_listings.py` :

```python
from sqlalchemy import select

from semsar_events import OutboxEvent

from tests.conftest import headers

PAYLOAD = {
    "property": {"city": "Casablanca", "neighborhood": "Gauthier",
                 "property_type": "APPARTEMENT", "area_m2": 90,
                 "amenities": {"wifi": True}},
    "title": "Chambre lumineuse à Gauthier", "description": "Belle chambre.",
    "bed_type": "CHAMBRE_INDIVIDUELLE", "rent": "2200.00",
    "housing_gender": "FEMININ", "furnished": True, "capacity": 3,
}


def _create(client, h=None):
    resp = client.post("/listings", json=PAYLOAD, headers=h or headers())
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_create_requires_auth_and_tenant(client):
    assert client.post("/listings", json=PAYLOAD).status_code in (401, 403)  # sans en-têtes
    assert client.post("/listings", json=PAYLOAD,
                       headers=headers(tenant="semsar")).status_code == 403  # mauvais tenant


def test_mixte_familial_rejected(client):
    resp = client.post("/listings", json={**PAYLOAD, "housing_gender": "MIXTE_FAMILIAL"},
                       headers=headers())
    assert resp.status_code == 422


def test_full_lifecycle_publishes_events(client, db_session):
    lid = _create(client)
    # brouillon : détail public → 404 (ne fuit pas l'existence)
    assert client.get(f"/listings/{lid}", headers=headers()).status_code == 404
    # submit par le propriétaire
    resp = client.post(f"/listings/{lid}/submit", headers=headers())
    assert resp.json()["status"] == "EN_MODERATION"
    # approve refusé au non-superadmin, ok au superadmin
    assert client.post(f"/listings/{lid}/approve", headers=headers()).status_code == 403
    resp = client.post(f"/listings/{lid}/approve", headers=headers(superadmin=True))
    body = resp.json()
    assert body["status"] == "PUBLIEE" and body["published_at"] is not None
    # détail public désormais accessible, sans adresse ni coordonnées
    detail = client.get(f"/listings/{lid}", headers=headers()).json()
    assert detail["title"] == PAYLOAD["title"]
    assert "address" not in detail and "latitude" not in detail
    # événements en outbox
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert "coloc.listing_published" in events
    assert events.count("coloc.listing_status_changed") == 2  # submit + approve


def test_owner_only_updates(client):
    lid = _create(client)
    other = headers(user_id=99)
    assert client.patch(f"/listings/{lid}", json={"rent": "2500.00"}, headers=other).status_code == 403
    resp = client.patch(f"/listings/{lid}", json={"rent": "2500.00"}, headers=headers())
    assert resp.json()["rent"] == 2500.0


def test_not_editable_after_submit(client):
    lid = _create(client)
    client.post(f"/listings/{lid}/submit", headers=headers())
    assert client.patch(f"/listings/{lid}", json={"rent": "2500.00"},
                        headers=headers()).status_code == 409


def test_invalid_transition(client):
    lid = _create(client)  # BROUILLON
    resp = client.post(f"/listings/{lid}/approve", headers=headers(superadmin=True))
    assert resp.status_code == 409  # BROUILLON → PUBLIEE interdit


def test_house_rules_media_roommates(client):
    lid = _create(client)
    resp = client.put(f"/listings/{lid}/house-rules",
                      json={"rules": [{"code": "fumeur", "value": "Non-fumeur"}]},
                      headers=headers())
    assert resp.status_code == 200
    resp = client.post(f"/listings/{lid}/media",
                       json={"url": "/uploads/photos/x.jpg", "position": 0,
                             "media_type": "CHAMBRE"}, headers=headers())
    assert resp.status_code == 201
    resp = client.put(f"/listings/{lid}/roommates",
                      json={"total": 2, "women": 2, "men": 0}, headers=headers())
    assert resp.status_code == 200
    mine = client.get("/me/listings", headers=headers()).json()
    assert len(mine) == 1 and mine[0]["roommates"] == {"total": 2, "women": 2, "men": 0}
```

Run: `python3 -m pytest tests/test_listings.py -v` → FAIL (`No module named 'app.main'`).

- [ ] **Step 3: schemas.py (Pydantic, validation des enums String)**

`services/coloc-listing/app/schemas.py` :

```python
"""Payloads API — portés de m3a-l3achrane (schemas.py), enums validés ici."""
from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator

from .models import BED_TYPES, HOUSING_GENDERS, MEDIA_TYPES, PROPERTY_TYPES


def _validate(value: str, allowed: set[str], label: str) -> str:
    if value not in allowed:
        raise ValueError(f"{label} invalide : {value}")
    return value


class PropertyIn(BaseModel):
    city: str = Field(min_length=1, max_length=80)
    neighborhood: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=300)
    property_type: str
    floor: int | None = None
    area_m2: int | None = Field(default=None, ge=1)
    amenities: dict[str, Any] = Field(default_factory=dict)

    @field_validator("property_type")
    @classmethod
    def _pt(cls, v: str) -> str:
        return _validate(v, PROPERTY_TYPES, "property_type")


class ListingCreateIn(BaseModel):
    property: PropertyIn
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    bed_type: str
    rent: Decimal = Field(gt=0)
    charges_included: bool = False
    charges_amount: Decimal | None = None
    deposit: Decimal | None = None
    currency: str = Field(default="MAD", min_length=3, max_length=3)
    furnished: bool = False
    housing_gender: str
    capacity: int = Field(default=1, ge=1, le=8)
    available_from: date | None = None
    duration_min_months: int | None = Field(default=None, ge=0)
    duration_max_months: int | None = Field(default=None, ge=0)

    @field_validator("bed_type")
    @classmethod
    def _bt(cls, v: str) -> str:
        return _validate(v, BED_TYPES, "bed_type")

    @field_validator("housing_gender")
    @classmethod
    def _hg(cls, v: str) -> str:
        return _validate(v, HOUSING_GENDERS, "housing_gender")


class ListingUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    bed_type: str | None = None
    rent: Decimal | None = Field(default=None, gt=0)
    charges_included: bool | None = None
    charges_amount: Decimal | None = None
    deposit: Decimal | None = None
    furnished: bool | None = None
    capacity: int | None = Field(default=None, ge=1, le=8)
    available_from: date | None = None
    duration_min_months: int | None = Field(default=None, ge=0)
    duration_max_months: int | None = Field(default=None, ge=0)

    @field_validator("bed_type")
    @classmethod
    def _bt(cls, v: str | None) -> str | None:
        return v if v is None else _validate(v, BED_TYPES, "bed_type")


class HouseRuleIn(BaseModel):
    code: str = Field(max_length=40)
    value: str = Field(max_length=120)


class HouseRulesIn(BaseModel):
    rules: list[HouseRuleIn]


class RoommatesIn(BaseModel):
    total: int = Field(ge=0, le=20)
    women: int = Field(ge=0, le=20)
    men: int = Field(ge=0, le=20)
    statuses: dict[str, Any] = Field(default_factory=dict)


class MediaIn(BaseModel):
    url: str = Field(max_length=500)
    position: int = Field(default=0, ge=0)
    media_type: str

    @field_validator("media_type")
    @classmethod
    def _mt(cls, v: str) -> str:
        return _validate(v, MEDIA_TYPES, "media_type")
```

- [ ] **Step 4: events.py + relay.py**

`services/coloc-listing/app/events.py` :

```python
"""Routing keys des événements coloc-listing (exchange semsar.events)."""
LISTING_PUBLISHED = "coloc.listing_published"
LISTING_STATUS_CHANGED = "coloc.listing_status_changed"
```

`services/coloc-listing/app/relay.py` :

```python
"""Relais outbox → RabbitMQ du service coloc-listing.
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

- [ ] **Step 5: main.py**

`services/coloc-listing/app/main.py` :

```python
"""Service coloc-listing — annonces de colocation M3a-L3achrane.

Port du service listing du dépôt initial, conventions mesh : erreurs legacy
{'error': msg}, identité via x-semsar-* (BFF), outbox transactionnel.
Toutes les routes métier exigent le tenant m3a-l3achrane (défense en profondeur —
le BFF route déjà par host/tenant).
"""
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import ColocProperty, CurrentRoommates, HouseRule, Listing, ListingMedia, _now
from .schemas import HouseRulesIn, ListingCreateIn, ListingUpdateIn, MediaIn, RoommatesIn
from .state_machine import EDITABLE_STATUSES, TransitionError, assert_transition

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

TENANT = "m3a-l3achrane"
PUBLICATION_DAYS = 60  # durée de publication par défaut (dépôt initial)


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


class _TenantForbidden(Exception):
    pass


def _require_tenant(request: Request) -> None:
    if request.headers.get("x-semsar-tenant", "semsar") != TENANT:
        raise _TenantForbidden()


@app.exception_handler(_TenantForbidden)
async def _tenant_handler(request: Request, exc: _TenantForbidden) -> JSONResponse:
    return _err("Tenant interdit", 403)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


router = APIRouter(dependencies=[Depends(_require_tenant)])


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def _get(db: Session, listing_id: str) -> Listing | None:
    return db.get(Listing, listing_id)


def _search_doc(listing: Listing) -> dict:
    """Document d'index/événement de publication — cf. « Contrats partagés » du plan.
    Jamais d'adresse ni de coordonnées."""
    p = listing.property
    return {
        "listing_id": listing.id, "title": listing.title, "description": listing.description,
        "city": p.city, "neighborhood": p.neighborhood, "property_type": p.property_type,
        "bed_type": listing.bed_type, "housing_gender": listing.housing_gender,
        "furnished": listing.furnished, "rent": float(listing.rent),
        "currency": listing.currency, "capacity": listing.capacity,
        "available_from": listing.available_from.isoformat() if listing.available_from else None,
        "published_at": listing.published_at.isoformat() if listing.published_at else None,
        "media_urls": [m.url for m in listing.media],
        "rules": [r.value for r in listing.house_rules],
        "amenities": [k for k, v in (p.amenities or {}).items() if v],
        "status": listing.status,
    }


def _change_status(db: Session, listing: Listing, target: str) -> JSONResponse | None:
    """Transition + événement coloc.listing_status_changed dans la même transaction."""
    try:
        assert_transition(listing.status, target)
    except TransitionError:
        return _err(f"Transition interdite : {listing.status} → {target}", 409)
    previous = listing.status
    listing.status = target
    enqueue(db, "coloc_listing", listing.id, events.LISTING_STATUS_CHANGED,
            {"listing_id": listing.id, "previous_status": previous, "new_status": target})
    return None


@router.post("/listings", status_code=201)
def create_listing(body: ListingCreateIn, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    if body.housing_gender == "MIXTE_FAMILIAL":
        # Non-mixité par défaut : contrainte dure (ADR 0006 du dépôt initial).
        return _err("housing_gender MIXTE_FAMILIAL non autorisé", 422)
    prop = ColocProperty(owner_id=uid, city=body.property.city,
                         neighborhood=body.property.neighborhood,
                         address=body.property.address,
                         property_type=body.property.property_type,
                         floor=body.property.floor, area_m2=body.property.area_m2,
                         amenities=body.property.amenities)
    db.add(prop)
    db.flush()
    listing = Listing(property_id=prop.id, owner_id=uid, title=body.title,
                      description=body.description, bed_type=body.bed_type, rent=body.rent,
                      charges_included=body.charges_included, charges_amount=body.charges_amount,
                      deposit=body.deposit, currency=body.currency, furnished=body.furnished,
                      housing_gender=body.housing_gender, capacity=body.capacity,
                      available_from=body.available_from,
                      duration_min_months=body.duration_min_months,
                      duration_max_months=body.duration_max_months)
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.get("/me/listings")
def my_listings(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    rows = db.query(Listing).filter(Listing.owner_id == uid).order_by(Listing.created_at.desc()).all()
    return [listing.to_dict() for listing in rows]


@router.get("/listings/{listing_id}")
def public_detail(listing_id: str, db: Session = Depends(get_db)):
    listing = _get(db, listing_id)
    if listing is None or listing.status != "PUBLIEE":
        return _err("Annonce introuvable", 404)  # ne fuit pas l'existence
    return listing.to_dict()


def _owned_editable(db: Session, listing_id: str, principal: Principal,
                    *, editable_only: bool = False):
    uid = _uid(principal)
    if uid is None:
        return None, _err("Authentification requise", 401)
    listing = _get(db, listing_id)
    if listing is None:
        return None, _err("Annonce introuvable", 404)
    if listing.owner_id != uid:
        return None, _err("Vous n'êtes pas propriétaire de cette annonce", 403)
    if editable_only and listing.status not in EDITABLE_STATUSES:
        return None, _err("Annonce non modifiable dans ce statut", 409)
    return listing, None


@router.patch("/listings/{listing_id}")
def update_listing(listing_id: str, body: ListingUpdateIn,
                   principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal, editable_only=True)
    if err is not None:
        return err
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(listing, field, value)
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.put("/listings/{listing_id}/house-rules")
def put_house_rules(listing_id: str, body: HouseRulesIn,
                    principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal, editable_only=True)
    if err is not None:
        return err
    db.query(HouseRule).filter(HouseRule.listing_id == listing.id).delete()
    for rule in body.rules:
        db.add(HouseRule(listing_id=listing.id, code=rule.code, value=rule.value))
    db.commit()
    db.refresh(listing)
    return listing.to_dict()["house_rules"]


@router.put("/listings/{listing_id}/roommates")
def put_roommates(listing_id: str, body: RoommatesIn,
                  principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal, editable_only=True)
    if err is not None:
        return err
    db.query(CurrentRoommates).filter(CurrentRoommates.listing_id == listing.id).delete()
    db.add(CurrentRoommates(listing_id=listing.id, total=body.total, women=body.women,
                            men=body.men, statuses=body.statuses))
    db.commit()
    db.refresh(listing)
    return listing.to_dict()["roommates"]


@router.post("/listings/{listing_id}/media", status_code=201)
def add_media(listing_id: str, body: MediaIn,
              principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal, editable_only=True)
    if err is not None:
        return err
    media = ListingMedia(listing_id=listing.id, url=body.url, position=body.position,
                         media_type=body.media_type)
    db.add(media)
    db.commit()
    return {"id": media.id, "url": media.url, "position": media.position,
            "media_type": media.media_type}


@router.post("/listings/{listing_id}/submit")
def submit(listing_id: str, principal: Principal = Depends(get_principal),
           db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal)
    if err is not None:
        return err
    err = _change_status(db, listing, "EN_MODERATION")
    if err is not None:
        return err
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.post("/listings/{listing_id}/approve")
def approve(listing_id: str, principal: Principal = Depends(get_principal),
            db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return _err("Modération réservée aux superadmins", 403)
    listing = _get(db, listing_id)
    if listing is None:
        return _err("Annonce introuvable", 404)
    err = _change_status(db, listing, "PUBLIEE")
    if err is not None:
        return err
    now = _now()
    listing.published_at = now
    listing.expires_at = now + timedelta(days=PUBLICATION_DAYS)
    # Deux événements dans la même transaction (comme le dépôt initial) :
    # status_changed (ci-dessus) + published avec le document d'index complet.
    enqueue(db, "coloc_listing", listing.id, events.LISTING_PUBLISHED, _search_doc(listing))
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.post("/listings/{listing_id}/reject")
def reject(listing_id: str, principal: Principal = Depends(get_principal),
           db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return _err("Modération réservée aux superadmins", 403)
    listing = _get(db, listing_id)
    if listing is None:
        return _err("Annonce introuvable", 404)
    err = _change_status(db, listing, "REJETEE")
    if err is not None:
        return err
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


@router.post("/listings/{listing_id}/archive")
def archive(listing_id: str, principal: Principal = Depends(get_principal),
            db: Session = Depends(get_db)):
    listing, err = _owned_editable(db, listing_id, principal)
    if err is not None:
        return err
    err = _change_status(db, listing, "ARCHIVEE")
    if err is not None:
        return err
    db.commit()
    db.refresh(listing)
    return listing.to_dict()


app.include_router(router)
```

- [ ] **Step 6: Vérifier le vert**

Run: `cd services/coloc-listing && python3 -m pytest tests/ -v`
Expected: PASS (state machine + modèles + les 7 tests HTTP).

- [ ] **Step 7: Commit**

```bash
git add services/coloc-listing
git commit -m "feat(coloc-listing): routes CRUD + cycle de vie modéré + événements outbox coloc.*"
```

---

### Task B3: Index OpenSearch coloc + routes de recherche

**Files:**
- Create: `services/search/app/coloc_index.py`
- Modify: `services/search/app/worker.py` (bindings + dispatch coloc)
- Modify: `services/search/app/main.py` (route `GET /listings`, ensure index au startup)
- Test: `services/search/tests/test_coloc_index.py`

**Interfaces:**
- Consumes: événements `coloc.listing_published` (payload = doc du contrat) et `coloc.listing_status_changed`.
- Produces: `COLOC_INDEX = "coloc_listings"`, `ensure_coloc_index(client)`, `index_coloc_listing(client, doc)`, `delete_coloc_listing(client, listing_id)`, `build_coloc_query(...) -> dict`, `search_coloc(client, **criteria) -> dict` (`{"total", "items"}`) ; route publique `GET /listings` sur le service search (le BFF la mappe en B4).

- [ ] **Step 1: Tests du query builder et du doc (échec : module absent)**

`services/search/tests/test_coloc_index.py` :

```python
from app.coloc_index import _index_doc, build_coloc_query


DOC = {"listing_id": "abc", "title": "Chambre à Gauthier", "description": "Belle",
       "city": "Casablanca", "neighborhood": "Gauthier", "property_type": "APPARTEMENT",
       "bed_type": "CHAMBRE_INDIVIDUELLE", "housing_gender": "FEMININ", "furnished": True,
       "rent": 2200.0, "currency": "MAD", "capacity": 3, "available_from": None,
       "published_at": "2026-08-01T12:00:00+00:00", "media_urls": [], "rules": ["Non-fumeur"],
       "amenities": ["wifi"], "status": "PUBLIEE"}


def test_index_doc_builds_fulltext():
    d = _index_doc(DOC)
    assert "Chambre à Gauthier" in d["text"] and "Casablanca" in d["text"]
    assert d["listing_id"] == "abc"


def _filters(query):
    return query["query"]["bool"]["filter"]


def test_query_defaults_published_only():
    q = build_coloc_query()
    assert {"term": {"status": "PUBLIEE"}} in _filters(q)
    assert q["size"] == 20 and q["from"] == 0


def test_query_filters():
    q = build_coloc_query(city="Casablanca", housing_gender="FEMININ",
                          min_rent=1000, max_rent=3000, kind="chambre")
    f = _filters(q)
    assert {"term": {"city": "Casablanca"}} in f
    assert {"term": {"housing_gender": "FEMININ"}} in f
    assert {"range": {"rent": {"gte": 1000.0, "lte": 3000.0}}} in f
    assert {"terms": {"bed_type": ["CHAMBRE_INDIVIDUELLE", "CHAMBRE_PARTAGEE"]}} in f


def test_query_kind_studio_and_residence():
    assert {"bool": {"should": [
        {"term": {"property_type": "STUDIO"}},
        {"term": {"bed_type": "STUDIO_ENTIER"}},
    ], "minimum_should_match": 1}} in _filters(build_coloc_query(kind="studio"))
    assert {"term": {"property_type": "RESIDENCE_ETUDIANTE"}} in _filters(
        build_coloc_query(kind="residence"))


def test_query_sorts():
    assert build_coloc_query(sort="rent_asc")["sort"] == [{"rent": "asc"}]
    assert build_coloc_query(sort="recent")["sort"] == [{"published_at": "desc"}]
    assert build_coloc_query(sort="relevance")["sort"] == ["_score", {"published_at": "desc"}]


def test_query_fulltext():
    q = build_coloc_query(q="gauthier")
    assert q["query"]["bool"]["must"] == [{"match": {"text": "gauthier"}}]
```

Run: `cd services/search && python3 -m pytest tests/test_coloc_index.py -v` → FAIL (import).

- [ ] **Step 2: coloc_index.py**

`services/search/app/coloc_index.py` :

```python
"""Index OpenSearch des annonces de colocation M3a-L3achrane (projection reconstructible).

Alimenté par coloc.listing_published, purgé par coloc.listing_status_changed
(nouveau statut ≠ PUBLIEE). _id = listing_id → idempotent.
"""
from typing import Any

COLOC_INDEX = "coloc_listings"

COLOC_MAPPING: dict[str, Any] = {
    "mappings": {
        "properties": {
            "listing_id": {"type": "keyword"},
            "title": {"type": "text"},
            "description": {"type": "text"},
            "city": {"type": "keyword"},
            "neighborhood": {"type": "keyword"},
            "property_type": {"type": "keyword"},
            "bed_type": {"type": "keyword"},
            "housing_gender": {"type": "keyword"},
            "furnished": {"type": "boolean"},
            "rent": {"type": "double"},
            "currency": {"type": "keyword"},
            "capacity": {"type": "integer"},
            "available_from": {"type": "date"},
            "published_at": {"type": "date"},
            "media_urls": {"type": "keyword"},
            "rules": {"type": "keyword"},
            "amenities": {"type": "keyword"},
            "status": {"type": "keyword"},
            "text": {"type": "text", "analyzer": "standard"},
        }
    }
}

_SORTS: dict[str, list[Any]] = {
    "relevance": ["_score", {"published_at": "desc"}],
    "rent_asc": [{"rent": "asc"}],
    "rent_desc": [{"rent": "desc"}],
    "recent": [{"published_at": "desc"}],
}

# Le front parle en « type d'offre » (chambre|studio|residence) — traduction
# vers les champs du domaine (bed_type/property_type).
_KIND_FILTERS: dict[str, dict[str, Any]] = {
    "chambre": {"terms": {"bed_type": ["CHAMBRE_INDIVIDUELLE", "CHAMBRE_PARTAGEE"]}},
    "studio": {"bool": {"should": [
        {"term": {"property_type": "STUDIO"}},
        {"term": {"bed_type": "STUDIO_ENTIER"}},
    ], "minimum_should_match": 1}},
    "residence": {"term": {"property_type": "RESIDENCE_ETUDIANTE"}},
}


def ensure_coloc_index(client) -> None:
    if not client.indices.exists(index=COLOC_INDEX):
        client.indices.create(index=COLOC_INDEX, body=COLOC_MAPPING)


def _index_doc(doc: dict) -> dict:
    d = dict(doc)
    d["text"] = " ".join(str(part) for part in (
        doc.get("title"), doc.get("description"), doc.get("city"), doc.get("neighborhood"),
    ) if part)
    return d


def index_coloc_listing(client, doc: dict) -> None:
    client.index(index=COLOC_INDEX, id=str(doc["listing_id"]), body=_index_doc(doc), refresh=True)


def delete_coloc_listing(client, listing_id) -> None:
    client.delete(index=COLOC_INDEX, id=str(listing_id), ignore=[404])


def build_coloc_query(*, city: str | None = None, neighborhood: str | None = None,
                      housing_gender: str | None = None, kind: str | None = None,
                      min_rent: float | None = None, max_rent: float | None = None,
                      q: str | None = None, sort: str = "relevance",
                      limit: int = 20, offset: int = 0) -> dict:
    filters: list[dict[str, Any]] = [{"term": {"status": "PUBLIEE"}}]
    if city:
        filters.append({"term": {"city": city}})
    if neighborhood:
        filters.append({"term": {"neighborhood": neighborhood}})
    if housing_gender:
        filters.append({"term": {"housing_gender": housing_gender}})
    if kind in _KIND_FILTERS:
        filters.append(_KIND_FILTERS[kind])
    rent_range: dict[str, float] = {}
    if min_rent is not None:
        rent_range["gte"] = float(min_rent)
    if max_rent is not None:
        rent_range["lte"] = float(max_rent)
    if rent_range:
        filters.append({"range": {"rent": rent_range}})
    must: list[dict[str, Any]] = []
    if q:
        must.append({"match": {"text": q}})
    return {
        "size": limit, "from": offset,
        "query": {"bool": {"must": must or [{"match_all": {}}], "filter": filters}},
        "sort": _SORTS.get(sort, _SORTS["relevance"]),
    }


def search_coloc(client, **criteria) -> dict:
    resp = client.search(index=COLOC_INDEX, body=build_coloc_query(**criteria))
    hits = resp.get("hits", {})
    total = hits.get("total", {})
    return {
        "total": total.get("value", 0) if isinstance(total, dict) else int(total or 0),
        "items": [h["_source"] for h in hits.get("hits", [])],
    }
```

- [ ] **Step 3: Worker — bindings et dispatch coloc (additif)**

Dans `services/search/app/worker.py` :
1. Ajouter l'import : `from . import coloc_index`
2. Après `ensure_index(client)` ajouter : `coloc_index.ensure_coloc_index(client)`
3. Dans `handle(routing_key, payload, _message_id)`, ajouter avant le commentaire final :

```python
        elif routing_key == "coloc.listing_published":
            coloc_index.index_coloc_listing(client, payload)
        elif routing_key == "coloc.listing_status_changed":
            if payload.get("new_status") != "PUBLIEE":
                coloc_index.delete_coloc_listing(client, payload["listing_id"])
```

4. Étendre les bindings : `bindings=["listing.#", "coloc.#"]` (garder `listing.#` intact).

- [ ] **Step 4: Route GET /listings sur le service search**

Dans `services/search/app/main.py` :
1. Ajouter l'import : `from . import coloc_index`
2. Dans le hook de startup existant (celui qui appelle `ensure_index(_client)`), ajouter : `coloc_index.ensure_coloc_index(_client)`
3. Ajouter la route (après les routes properties) :

```python
@app.get("/listings")
def coloc_listings(
    city: str | None = None,
    neighborhood: str | None = None,
    housing_gender: str | None = None,
    kind: str | None = None,
    min_rent: float | None = None,
    max_rent: float | None = None,
    q: str | None = None,
    sort: str = "relevance",
    limit: int = 20,
    offset: int = 0,
):
    """Recherche publique d'annonces de colocation M3a-L3achrane (index coloc_listings)."""
    limit = max(1, min(int(limit), 100))
    offset = max(0, int(offset))
    if housing_gender not in (None, "FEMININ", "MASCULIN"):
        housing_gender = None
    return coloc_index.search_coloc(
        _client, city=city, neighborhood=neighborhood, housing_gender=housing_gender,
        kind=kind, min_rent=min_rent, max_rent=max_rent, q=q, sort=sort,
        limit=limit, offset=offset,
    )
```

- [ ] **Step 5: Vérifier le vert (toute la suite search)**

Run: `cd services/search && python3 -m pytest tests/ -v`
Expected: PASS (nouveaux tests + `test_search.py` existant intact).

- [ ] **Step 6: Commit**

```bash
git add services/search
git commit -m "feat(search): index coloc_listings + consumers coloc.* + route GET /listings"
```

---

### Task B4: Routage BFF + enregistrement mesh

**Files:**
- Modify: `gateway/app/config.py` (après `selling_url`)
- Modify: `gateway/app/main.py` (`_resolve_upstream`, lifespan, liste de fermeture)
- Modify: `scripts/dev-mesh-up.sh` (SVCS, relay, health, env BFF)
- Test: `gateway/tests/test_coloc_routes.py`

**Interfaces:**
- Consumes: routes search `GET /listings` (B3) et coloc-listing (B2).
- Produces: table strangler — `GET /api/v1/listings` → search `/listings` ; toute autre méthode/`/api/v1/listings/*` + `/api/v1/me/listings` → coloc-listing (préfixe `/api/v1` retiré). Service enregistré dans le mesh dev (port **8521**).

- [ ] **Step 1: Tests de routage (échec)**

`gateway/tests/test_coloc_routes.py` :

```python
from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app(**states):
    return SimpleNamespace(state=SimpleNamespace(
        **{name: None for name in ("search", "coloc_listing")}, **states))


def test_get_listings_routes_to_search(monkeypatch):
    monkeypatch.setattr(m.settings, "search_url", "http://s")
    monkeypatch.setattr(m.settings, "coloc_listing_url", "http://c")
    fake = _app(search="SEARCH", coloc_listing="COLOC")
    client, path = _resolve_upstream(fake, "/api/v1/listings", "GET")
    assert client == "SEARCH" and path == "/listings"


def test_listings_writes_and_detail_route_to_coloc_listing(monkeypatch):
    monkeypatch.setattr(m.settings, "search_url", "http://s")
    monkeypatch.setattr(m.settings, "coloc_listing_url", "http://c")
    fake = _app(search="SEARCH", coloc_listing="COLOC")
    assert _resolve_upstream(fake, "/api/v1/listings", "POST") == ("COLOC", "/listings")
    assert _resolve_upstream(fake, "/api/v1/listings/abc123", "GET") == ("COLOC", "/listings/abc123")
    assert _resolve_upstream(fake, "/api/v1/listings/abc123/approve", "POST") == (
        "COLOC", "/listings/abc123/approve")
    assert _resolve_upstream(fake, "/api/v1/me/listings", "GET") == ("COLOC", "/me/listings")


def test_unmapped_when_disabled(monkeypatch):
    monkeypatch.setattr(m.settings, "coloc_listing_url", None)
    monkeypatch.setattr(m.settings, "search_url", None)
    fake = _app()
    client, _ = _resolve_upstream(fake, "/api/v1/listings", "GET")
    assert client is None
```

Run: `cd gateway && python3 -m pytest tests/test_coloc_routes.py -v` → FAIL (`coloc_listing_url` inexistant).

- [ ] **Step 2: config.py**

Dans `gateway/app/config.py`, après `selling_url: str | None = None` :

```python
    coloc_listing_url: str | None = None
```

- [ ] **Step 3: main.py — routage + clients**

Dans `gateway/app/main.py` :

1. Dans `_resolve_upstream`, juste AVANT la ligne finale `# Monolithe décommissionné : plus de repli...` / `return None, path` :

```python
    # M3a-L3achrane (coloc) : la liste publique vient de la projection search ;
    # tout le reste (détail, CRUD, cycle de vie) va au service coloc-listing.
    if settings.search_url and method == "GET" and path == "/api/v1/listings":
        return app.state.search, "/listings"
    if settings.coloc_listing_url and (
        path == "/api/v1/listings"
        or path.startswith("/api/v1/listings/")
        or path == "/api/v1/me/listings"
    ):
        return app.state.coloc_listing, path.replace("/api/v1", "", 1)
```

2. Dans `lifespan`, après `app.state.selling = ...` : `app.state.coloc_listing = _client_or_none(settings.coloc_listing_url)`
3. Ajouter `app.state.coloc_listing,` à la liste du `for client in (...)` de fermeture.

- [ ] **Step 4: dev-mesh-up.sh**

1. Fin de la liste `SVCS` (après `selling:8520`) : ajouter `coloc-listing:8521`.
2. Liste des relais (`for r in listing ... selling`) : ajouter `coloc-listing`.
3. Bloc santé : ajouter `coloc-listing:8521`.
4. Bloc env du BFF : ajouter `COLOC_LISTING_URL=http://localhost:8521`.
(Pas de worker pour coloc-listing — il n'y a pas de consumer ; c'est le worker de `search` qui consomme `coloc.#`.)

- [ ] **Step 5: Vérifier le vert**

Run: `cd gateway && python3 -m pytest tests/ -v`
Expected: PASS (nouveaux + `test_tenant.py` + `test_health.py`), et `bash -n scripts/dev-mesh-up.sh` sans erreur.

- [ ] **Step 6: Commit**

```bash
git add gateway scripts/dev-mesh-up.sh
git commit -m "feat(gateway): routage /listings (search + coloc-listing) + enregistrement mesh :8521"
```

---

### Task B5: Seed de démo + smoke bout-en-bout

**Files:**
- Create: `services/coloc-listing/app/seed_demo.py`
- Create: `tools/coloc_smoke.py`

**Interfaces:**
- Consumes: mesh complet (B1-B4), migration schema.sql appliquée, mesh dev relancé.
- Produces: ≥ 8 annonces PUBLIEE indexées dans `coloc_listings` ; script smoke rejouable validant la chaîne API → outbox → relay → worker → index → recherche.

- [ ] **Step 1: seed_demo.py**

`services/coloc-listing/app/seed_demo.py` :

```python
"""Seed de démo dev — 8 annonces publiées (via la couche modèle + outbox).
    PYTHONPATH=services/coloc-listing DATABASE_URL=postgresql+psycopg://coloc_listing:coloc_listing@localhost:5432/semsar_dev \
        RABBITMQ_URL=... EVENTS_EXCHANGE=semsar.events SERVICE_NAME=coloc-listing python3 -m app.seed_demo
Idempotent : ne fait rien si des listings existent déjà.
"""
from datetime import date, timedelta
from decimal import Decimal

from semsar_events import enqueue

from . import events
from .db import SessionLocal, init_db
from .models import ColocProperty, CurrentRoommates, HouseRule, Listing, ListingMedia, _now

DEMO = [
    ("Chambre lumineuse à Gauthier", "Casablanca", "Gauthier", "APPARTEMENT",
     "CHAMBRE_INDIVIDUELLE", "FEMININ", Decimal("2200.00"), True, 3, ["Non-fumeur", "Calme"]),
    ("Chambre dans villa avec jardin", "Casablanca", "Californie", "VILLA",
     "CHAMBRE_INDIVIDUELLE", "MIXTE_FAMILIAL", Decimal("2800.00"), True, 4, ["Animaux acceptés"]),
    ("Studio meublé proche fac", "Rabat", "Agdal", "STUDIO",
     "STUDIO_ENTIER", "FEMININ", Decimal("3200.00"), True, 1, ["Non-fumeur"]),
    ("Chambre étudiante à Agdal", "Rabat", "Agdal", "APPARTEMENT",
     "CHAMBRE_INDIVIDUELLE", "MASCULIN", Decimal("1800.00"), False, 3, ["Étudiants uniquement"]),
    ("Colocation moderne à Hay Riad", "Rabat", "Hay Riad", "APPARTEMENT",
     "CHAMBRE_INDIVIDUELLE", "FEMININ", Decimal("2500.00"), True, 2, ["Non-fumeur", "Wifi fibre"]),
    ("Chambre en résidence étudiante", "Marrakech", "Guéliz", "RESIDENCE_ETUDIANTE",
     "CHAMBRE_INDIVIDUELLE", "FEMININ", Decimal("1500.00"), True, 6, ["Résidence sécurisée"]),
    ("Chambre partagée centre-ville", "Marrakech", "Médina", "MAISON",
     "CHAMBRE_PARTAGEE", "MASCULIN", Decimal("950.00"), False, 4, ["Court séjour ok"]),
    ("Grande chambre à Maârif", "Casablanca", "Maârif", "APPARTEMENT",
     "CHAMBRE_INDIVIDUELLE", "MASCULIN", Decimal("2400.00"), True, 3, ["Non-fumeur"]),
]

_OWNER_ID = 1  # compte de démo


def _search_doc(listing: Listing) -> dict:
    from .main import _search_doc as doc  # même document que l'API

    return doc(listing)


def seed() -> int:
    init_db()
    db = SessionLocal()
    try:
        if db.query(Listing).count() > 0:
            print("Seed ignoré : des annonces existent déjà.")
            return 0
        now = _now()
        for i, (title, city, hood, ptype, bed, gender, rent, furnished, cap, rules) in enumerate(DEMO):
            # Non-mixité par défaut (contrainte dure du domaine) : le seed la respecte
            # aussi — tout MIXTE_FAMILIAL résiduel des données de démo devient FEMININ.
            gender = "FEMININ" if gender == "MIXTE_FAMILIAL" else gender
            prop = ColocProperty(owner_id=_OWNER_ID, city=city, neighborhood=hood,
                                 property_type=ptype, area_m2=60 + 10 * i,
                                 amenities={"wifi": True, "machine_a_laver": i % 2 == 0})
            db.add(prop); db.flush()
            listing = Listing(
                property_id=prop.id, owner_id=_OWNER_ID, title=title,
                description=f"{title} — colocation vérifiée M3a-L3achrane.",
                bed_type=bed, rent=rent, housing_gender=gender, furnished=furnished,
                capacity=cap, available_from=date.today() + timedelta(days=15 + i),
                status="PUBLIEE", published_at=now, expires_at=now + timedelta(days=60),
            )
            db.add(listing); db.flush()
            for pos in range(2):
                db.add(ListingMedia(listing_id=listing.id, position=pos, media_type="CHAMBRE",
                                    url=f"/uploads/photos/coloc-demo-{i}-{pos}.jpg"))
            for rule in rules:
                db.add(HouseRule(listing_id=listing.id, code=rule.lower().replace(" ", "_")[:40],
                                 value=rule))
            db.add(CurrentRoommates(listing_id=listing.id, total=cap - 1,
                                    women=cap - 1 if gender == "FEMININ" else 0,
                                    men=cap - 1 if gender == "MASCULIN" else 0))
            db.flush()
            db.refresh(listing)
            enqueue(db, "coloc_listing", listing.id, events.LISTING_PUBLISHED,
                    _search_doc(listing))
        db.commit()
        print(f"Seed : {len(DEMO)} annonces publiées (outbox alimentée).")
        return len(DEMO)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
```

- [ ] **Step 2: Appliquer le schéma, relancer le mesh, seeder**

```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -f services/coloc-listing/db/schema.sql
pip install -e "services/coloc-listing[test]"
bash scripts/dev-mesh-up.sh
env SERVICE_NAME=coloc-listing PYTHONPATH=services/coloc-listing \
  DATABASE_URL="postgresql+psycopg://coloc_listing:coloc_listing@localhost:5432/semsar_dev" \
  python3 -m app.seed_demo
sleep 5   # relay + worker indexent
curl -s "http://localhost:8099/api/v1/listings?city=Casablanca" -H "x-tenant: m3a-l3achrane" | head -c 400
```

Expected: seed affiche `8 annonces publiées`, le curl renvoie `{"total": 3, "items": [...]}` (3 annonces Casablanca).

- [ ] **Step 3: tools/coloc_smoke.py**

```python
#!/usr/bin/env python3
"""Smoke bout-en-bout annonces coloc : création → modération → indexation → recherche.

Usage : python3 tools/coloc_smoke.py --bff http://localhost:8099 --coloc http://localhost:8521
Prérequis : mesh monté, schéma coloc_listing appliqué, relay coloc-listing + worker search actifs.
La modération (approve) passe en DIRECT sur le service (en-têtes x-semsar-* forgés,
TRUST_GATEWAY_HEADERS=true en dev) : il n'existe pas encore de compte superadmin
m3a-l3achrane — voir « hors périmètre » du plan.
"""
import argparse
import sys
import time

import requests

M3A = {"x-tenant": "m3a-l3achrane"}
PAYLOAD = {
    "property": {"city": "Fès", "neighborhood": "Ville Nouvelle",
                 "property_type": "APPARTEMENT", "area_m2": 70, "amenities": {"wifi": True}},
    "title": "Smoke — chambre à Fès", "description": "Annonce du smoke test.",
    "bed_type": "CHAMBRE_INDIVIDUELLE", "rent": "1700.00",
    "housing_gender": "FEMININ", "furnished": True, "capacity": 2,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bff", default="http://localhost:8099")
    parser.add_argument("--coloc", default="http://localhost:8521")
    args = parser.parse_args()
    base = args.bff.rstrip("/") + "/api/v1"
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'OK ' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
        if not cond:
            failures.append(name)

    # 1. Compte m3a-l3achrane + création d'annonce via le BFF
    email = f"smoke-coloc-{int(time.time())}@test.ma"
    reg = requests.post(f"{base}/auth/register", headers=M3A, timeout=10,
                        json={"email": email, "password": "smoke-pass-123",
                              "first_name": "Smoke", "last_name": "Coloc"})
    check("register m3a-l3achrane → 201", reg.status_code == 201, reg.text[:200])
    token = reg.json().get("access_token", "")
    auth = {"Authorization": f"Bearer {token}", **M3A}

    r = requests.post(f"{base}/listings", json=PAYLOAD, headers=auth, timeout=10)
    check("POST /listings (BFF) → 201", r.status_code == 201, r.text[:200])
    lid = r.json().get("id", "")

    r = requests.post(f"{base}/listings/{lid}/submit", headers=auth, timeout=10)
    check("submit → EN_MODERATION", r.status_code == 200 and r.json().get("status") == "EN_MODERATION",
          r.text[:200])

    # 2. Modération en direct service (superadmin forgé — dev uniquement)
    admin = {"x-semsar-user-id": "1", "x-semsar-superadmin": "1", "x-semsar-tenant": "m3a-l3achrane"}
    r = requests.post(f"{args.coloc}/listings/{lid}/approve", headers=admin, timeout=10)
    check("approve (superadmin direct) → PUBLIEE",
          r.status_code == 200 and r.json().get("status") == "PUBLIEE", r.text[:200])

    # 3. Détail public via le BFF
    r = requests.get(f"{base}/listings/{lid}", headers=M3A, timeout=10)
    check("GET /listings/{id} public → 200", r.status_code == 200, r.text[:200])
    check("détail sans adresse", "address" not in r.json())

    # 4. Indexation → recherche (relay + worker : on attend jusqu'à 20 s)
    found = False
    for _ in range(20):
        r = requests.get(f"{base}/listings", params={"city": "Fès", "q": "Smoke"},
                         headers=M3A, timeout=10)
        if r.status_code == 200 and any(i["listing_id"] == lid for i in r.json().get("items", [])):
            found = True
            break
        time.sleep(1)
    check("annonce indexée et trouvée via GET /listings", found)

    # 5. Archive → désindexation
    r = requests.post(f"{base}/listings/{lid}/archive", headers=auth, timeout=10)
    check("archive → 200", r.status_code == 200, r.text[:200])
    gone = False
    for _ in range(20):
        r = requests.get(f"{base}/listings", params={"city": "Fès", "q": "Smoke"},
                         headers=M3A, timeout=10)
        if all(i["listing_id"] != lid for i in r.json().get("items", [])):
            gone = True
            break
        time.sleep(1)
    check("annonce désindexée après archivage", gone)

    print("\n" + ("SMOKE COLOC : OK" if not failures else f"SMOKE COLOC : {len(failures)} échec(s)"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Exécuter le smoke**

Run: `python3 tools/coloc_smoke.py`
Expected: 8 checks `OK`, `SMOKE COLOC : OK`.

- [ ] **Step 5: Commit**

```bash
git add services/coloc-listing/app/seed_demo.py tools/coloc_smoke.py
git commit -m "feat(coloc-listing): seed de démo + smoke bout-en-bout création→modération→recherche"
```

---

### Task B6: Front — mappers EN→FR + bascule live recherche/détail

**Files:**
- Create: `frontend-m3a-l3achrane/src/services/mappers.js`
- Create: `frontend-m3a-l3achrane/src/services/mappers.test.mjs`
- Modify: `frontend-m3a-l3achrane/src/services/index.js` (bascule par domaine)
- Modify: `frontend-m3a-l3achrane/.env.development` (`VITE_USE_MOCK=false`)
- Modify: `frontend-m3a-l3achrane/src/surfaces/web/SearchResults.jsx` et `ListingDetail.jsx` (garde `matchPct` absent)

**Interfaces:**
- Consumes: `GET /listings` (`{total, items:[doc]}`) et `GET /listings/{id}` (détail `to_dict`) — contrats de l'en-tête du plan.
- Produces: `mapListingHit(hit) -> {id, titre, ville, quartier, prixMad, photos, matchPct, verifiee, chips}` ; `mapListingDetail(d) -> {…, description, equipements, facts, colocataires}` ; `mapSearchFilters(filtres FR) -> params EN`.

- [ ] **Step 1: Tests des mappers (échec)**

`frontend-m3a-l3achrane/src/services/mappers.test.mjs` :

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { mapListingDetail, mapListingHit, mapSearchFilters } from './mappers.js'

const HIT = {
  listing_id: 'abc', title: 'Chambre à Gauthier', description: 'Belle chambre.',
  city: 'Casablanca', neighborhood: 'Gauthier', property_type: 'APPARTEMENT',
  bed_type: 'CHAMBRE_INDIVIDUELLE', housing_gender: 'FEMININ', furnished: true,
  rent: 2200, currency: 'MAD', capacity: 3, available_from: '2026-09-01',
  published_at: '2026-08-01T12:00:00+00:00',
  media_urls: ['/uploads/photos/a.jpg'], rules: ['Non-fumeur'],
  amenities: ['wifi'], status: 'PUBLIEE',
}

test('mapListingHit traduit le contrat backend vers les clés françaises', () => {
  const l = mapListingHit(HIT)
  assert.equal(l.id, 'abc')
  assert.equal(l.titre, 'Chambre à Gauthier')
  assert.equal(l.ville, 'Casablanca')
  assert.equal(l.quartier, 'Gauthier')
  assert.equal(l.prixMad, 2200)
  assert.deepEqual(l.photos, ['/uploads/photos/a.jpg'])
  assert.equal(l.matchPct, null) // le matching arrive au plan C
  assert.equal(l.verifiee, true) // publiée = passée en modération
  assert.ok(l.chips.includes('Non-fumeur') && l.chips.includes('Meublé') && l.chips.includes('Wifi'))
})

test('mapListingDetail produit equipements, facts et colocataires anonymes', () => {
  const d = mapListingDetail({
    ...HIT, id: 'abc', area_m2: 90, floor: 2,
    media: [{ url: '/uploads/photos/a.jpg', position: 0, media_type: 'CHAMBRE' }],
    house_rules: [{ code: 'fumeur', value: 'Non-fumeur' }],
    roommates: { total: 2, women: 2, men: 0 },
  })
  assert.equal(d.titre, 'Chambre à Gauthier')
  assert.equal(d.description, 'Belle chambre.')
  assert.ok(d.equipements.includes('Wifi'))
  assert.ok(d.facts.some((f) => f.label === 'Surface' && f.value === '90 m²'))
  assert.equal(d.colocataires.length, 2) // agrégat non nominatif → entrées anonymes
  assert.equal(d.colocataires[0].nom, 'Colocataire (F)')
})

test('mapSearchFilters traduit les filtres français en params API', () => {
  assert.deepEqual(
    mapSearchFilters({ ville: 'Rabat', budgetMax: 2500, genre: 'feminin', type: 'chambre', tri: 'prix-asc' }),
    { city: 'Rabat', max_rent: 2500, housing_gender: 'FEMININ', kind: 'chambre', sort: 'rent_asc' },
  )
  assert.deepEqual(mapSearchFilters({}), {})
})
```

Run: `cd frontend-m3a-l3achrane && npm test` → FAIL (module absent).

- [ ] **Step 2: mappers.js**

`frontend-m3a-l3achrane/src/services/mappers.js` :

```js
// Traduction du contrat backend (anglais) vers les clés françaises des composants.
// Fonctions pures — testées par mappers.test.mjs (node --test).

const AMENITY_LABELS = {
  wifi: 'Wifi', machine_a_laver: 'Machine à laver', climatisation: 'Climatisation',
  parking: 'Parking', ascenseur: 'Ascenseur', terrasse: 'Terrasse',
}

const GENDER_PARAMS = { feminin: 'FEMININ', masculin: 'MASCULIN' }
const SORT_PARAMS = { pertinence: 'relevance', 'prix-asc': 'rent_asc', 'prix-desc': 'rent_desc', recent: 'recent' }

const amenityLabel = (code) => AMENITY_LABELS[code] ?? code.replaceAll('_', ' ')

export function buildChips(source) {
  const chips = [...(source.rules ?? [])]
  if (source.furnished) chips.push('Meublé')
  for (const code of source.amenities ?? []) chips.push(amenityLabel(code))
  return chips
}

export function mapListingHit(hit) {
  return {
    id: hit.listing_id,
    titre: hit.title,
    ville: hit.city,
    quartier: hit.neighborhood ?? '',
    prixMad: Math.round(hit.rent),
    photos: hit.media_urls ?? [],
    matchPct: hit.match_pct ?? null, // absent tant que le matching (plan C) n'est pas branché
    verifiee: hit.status === 'PUBLIEE', // publiée = passée en modération
    chips: buildChips(hit),
  }
}

export function mapListingDetail(d) {
  const facts = []
  if (d.area_m2 != null) facts.push({ label: 'Surface', value: `${d.area_m2} m²` })
  if (d.floor != null) facts.push({ label: 'Étage', value: String(d.floor) })
  if (d.capacity != null) facts.push({ label: 'Colocataires', value: String(d.capacity) })
  if (d.available_from) {
    facts.push({ label: 'Disponible', value: new Date(d.available_from).toLocaleDateString('fr-FR') })
  }
  const roommates = d.roommates ?? null
  const colocataires = []
  if (roommates) {
    for (let i = 0; i < roommates.women; i += 1) colocataires.push({ nom: 'Colocataire (F)', avatar: null })
    for (let i = 0; i < roommates.men; i += 1) colocataires.push({ nom: 'Colocataire (H)', avatar: null })
  }
  return {
    id: d.id,
    titre: d.title,
    ville: d.city,
    quartier: d.neighborhood ?? '',
    prixMad: Math.round(d.rent),
    photos: (d.media ?? []).map((m) => m.url),
    matchPct: d.match_pct ?? null,
    verifiee: d.status === 'PUBLIEE',
    chips: buildChips({ rules: (d.house_rules ?? []).map((r) => r.value), furnished: d.furnished, amenities: d.amenities }),
    description: d.description ?? '',
    equipements: (d.amenities ?? []).map(amenityLabel),
    facts,
    colocataires,
  }
}

export function mapSearchFilters(filtres = {}) {
  const params = {}
  if (filtres.ville) params.city = filtres.ville
  if (filtres.quartier) params.neighborhood = filtres.quartier
  if (filtres.budgetMax != null) params.max_rent = filtres.budgetMax
  if (filtres.budgetMin != null) params.min_rent = filtres.budgetMin
  if (GENDER_PARAMS[filtres.genre]) params.housing_gender = GENDER_PARAMS[filtres.genre]
  if (filtres.type) params.kind = filtres.type
  if (filtres.q) params.q = filtres.q
  if (SORT_PARAMS[filtres.tri]) params.sort = SORT_PARAMS[filtres.tri]
  return params
}
```

- [ ] **Step 3: Vérifier le vert des mappers**

Run: `cd frontend-m3a-l3achrane && npm test`
Expected: PASS (mappers + format.test.mjs existant).

- [ ] **Step 4: Façade — bascule live par domaine**

Dans `frontend-m3a-l3achrane/src/services/index.js` :
1. Remplacer la constante globale `USE_MOCK` par :

```js
// Bascule mock/live PAR DOMAINE : VITE_USE_MOCK=true force tout en mock (dev hors-ligne) ;
// sinon, seuls les domaines encore sans backend restent mockés (retirés au fil des plans C/D).
const ALL_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const MOCK_DOMAINS = new Set(
  (import.meta.env.VITE_MOCK_DOMAINS ?? 'profile,partners,messages').split(','),
)
const useMock = (domain) => ALL_MOCK || MOCK_DOMAINS.has(domain)
```

2. Adapter chaque fonction : `listListings`/`getListing` testent `useMock('listings')`, `getCurrentProfile` → `useMock('profile')`, `listPartners` → `useMock('partners')`, `listThreads` → `useMock('messages')`.
3. Brancher le live listings sur les mappers :

```js
import { mapListingDetail, mapListingHit, mapSearchFilters } from './mappers.js'

export async function listListings(filters = {}) {
  if (useMock('listings')) { /* … chemin mock existant inchangé … */ }
  const { data } = await api.get('/listings', { params: mapSearchFilters(filters) })
  return (data.items ?? []).map(mapListingHit)
}

export async function getListing(id) {
  if (useMock('listings')) { /* … chemin mock existant inchangé … */ }
  const { data } = await api.get(`/listings/${id}`)
  return mapListingDetail(data)
}
```

4. `frontend-m3a-l3achrane/.env.development` : passer `VITE_USE_MOCK=false`.

- [ ] **Step 5: Gardes matchPct absent**

Dans `SearchResults.jsx` et `ListingDetail.jsx` (et tout composant passant `matchPct` à `MatchScore`/`CompatibilityRing`) : ne rendre le composant de score QUE si `listing.matchPct != null`. Exemple :

```jsx
{listing.matchPct != null && <MatchScore value={listing.matchPct} />}
```

Vérifier aussi `Dashboard.jsx` (recommandations en `slice(0,3)` sur `listListings()`) : même garde.

- [ ] **Step 6: Validation manuelle contre le mesh + gate front**

```bash
make m3a-l3achrane-lint && (cd frontend-m3a-l3achrane && npm test) && make m3a-l3achrane-build
make m3a-l3achrane-dev   # mesh monté + seed B5 déjà passés
```

Vérifier dans le navigateur (http://localhost:5610) : `/recherche` liste les 8 annonces seedées (filtre ville fonctionnel), clic sur une carte → détail réel (titre, prix, chips, équipements, colocataires anonymes), pas d'anneau de score (matching absent), pas d'erreur console autre que les 404 d'images de démo.

- [ ] **Step 7: Commit**

```bash
git add frontend-m3a-l3achrane
git commit -m "feat(m3a-l3achrane): recherche et détail en données réelles — mappers EN→FR + bascule par domaine"
```

---

### Task B7: Gate final du plan B

- [ ] **Step 1: Backend** — `cd services/coloc-listing && python3 -m pytest tests/ -v` ; `cd services/search && python3 -m pytest tests/ -v` ; `cd gateway && python3 -m pytest tests/ -v` → tout PASS.
- [ ] **Step 2: Smokes** — `python3 tools/tenant_smoke.py` (non-régression plan A) puis `python3 tools/coloc_smoke.py` → OK.
- [ ] **Step 3: Front** — `make m3a-l3achrane-lint`, `npm test`, `make m3a-l3achrane-build` → verts.
- [ ] **Step 4: CI** — pousser et vérifier que les 20 jobs passent + le nouveau job matrice `services/coloc-listing` (ajouter `services/coloc-listing` à la matrice `dir:` de `.github/workflows/ci.yml` dans cette tâche, avec commit `ci: coloc-listing dans la matrice de tests`).
- [ ] **Step 5: Relecture du diff complet** — nommage complet, aucun secret, additif strict (routes semsarout intactes), confidentialité (adresse/coordonnées jamais exposées).

## Hors périmètre (plans suivants, explicites)

- `match_pct` dans les résultats (plan C — le BFF composera search + matching).
- Compte superadmin m3a-l3achrane pour la modération via BFF (aujourd'hui : accès direct service en dev) et UI de modération.
- Upload de médias coloc (URLs seulement ; l'isolation tenant de `/uploads` reste un préalable noté à la revue du plan A).
- UI de création/publication d'annonce côté front (le front est lecture seule sur ce domaine).
- Facettes d'agrégation, pagination UI au-delà de limit/offset, suggestions.
