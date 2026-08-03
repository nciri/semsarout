# Plan C — Profils & matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le profil chercheur (identité affichée, budget/ville, questionnaire lifestyle, favoris) et le score de compatibilité déterministe tournent dans le mesh ; `GET /listings` renvoie un `match_pct` réel aux utilisateurs authentifiés ; le Dashboard du front passe en données réelles avec une page de connexion minimale.

**Architecture:** Deux nouveaux services portés du dépôt initial m3a-l3achrane : `coloc-profile` (:8522) — profils + lifestyle + favoris, consomme `user.*` (tenant m3a-l3achrane) pour créer les profils, émet `coloc.profile_updated` (événement **créé** au port : l'original n'émettait rien) — et `matching` (:8523) — port **verbatim** du `scoring.py` pur (contraintes dures + budget 0.4/lifestyle 0.6 + explications), projections `compatibility_profiles`/`listing_criteria` alimentées par consumers (**à construire** : l'original n'en avait aucun), calcul **paresseux** avec cache `match_scores` invalidé par événements. Le BFF gagne son unique endpoint composite : `GET /api/v1/listings` = search + scores batch (dégradation sans score si matching indisponible).

**Tech Stack:** FastAPI, SQLAlchemy sync, semsar_events, pytest+sqlite, httpx.MockTransport (tests BFF), React/Vite.

**Spec :** `docs/superpowers/specs/2026-08-01-branchement-m3a-l3achrane-backend-design.md` §4.1, §5, §7, §8. **Source du port** : `/home/younes/Documents/work/m3a-l3achrane/services/{profile,matching}` (lecture seule).

## Global Constraints

- Nommage : **`m3a-l3achrane` en entier** ; services `coloc-profile` (rôle/schéma `coloc_profile`, port 8522) et `matching` (rôle/schéma `matching`, port 8523).
- Erreurs legacy `{"error": "<message>"}` ; garde tenant `x-semsar-tenant: m3a-l3achrane` sur les routes métier de coloc-profile (pattern coloc-listing) ; matching n'expose qu'une API interne protégée par `x-internal-token`.
- Identité : `user_id`/`seeker_id` = **BigInteger** (identity semsarout) ; `listing_id` = String(32) (coloc-listing).
- Scoring : port **fidèle** de `scoring.py` (poids par défaut `budget=0.4`, `lifestyle=0.6`, version `default-v1` ; `_GENDER_MATCH = {"FEMME": "FEMININ", "HOMME": "MASCULIN"}` ; budget_fit 1.0→0.5 linéaire ; explications ≤ 4). Adaptation actée : `city_id` porte des **chaînes de villes** (convention plan B), pas des UUID.
- **Pas de pgvector/embeddings** (hors périmètre §10 du spec — l'étage vectoriel ≤15 % n'est pas porté) ; pas de Celery.
- Calcul paresseux : le score se calcule à la première demande et se met en cache dans `match_scores` ; les événements **invalident** (DELETE ciblé), jamais de recalcul global événementiel.
- Référentiel lifestyle **formalisé** (inexistant dans le dépôt initial) — source unique `libs/semsar_common/semsar_common/coloc_referential.py`, partagé par coloc-profile (validation questionnaire), coloc-listing (validation house-rules) et matching (vocabulaire comparé) :

```python
LIFESTYLE_QUESTIONS: dict[str, list[str]] = {
    "tabac": ["non_fumeur", "fumeur"],
    "animaux": ["acceptes", "refuses"],
    "invites": ["souvent", "rarement"],
    "coucher": ["tot", "tard"],
    "menage": ["frequent", "souple"],
}
IMPORTANCE_LEVELS = {"INDIFFERENT", "PREFERENCE", "DECISIF"}
```

- Confidentialité : jamais de PII dans les événements matching ; `coloc.profile_updated` ne porte que les critères de compatibilité (pas de bio, pas de display_name).
- Additif strict pour le produit semsar : la clé `tenant` ajoutée au payload `user.*` est additive (consommateurs `audit`/`identity` tolérants — `user_ro` possède la colonne depuis le plan A).
- Adaptations de portage actées (ne pas « corriger ») : tables `profile_interests`, `saved_searches`, `blocks`, champs `life_status`/`visibility`/`duration_*`/`budget_currency` **non portés** (YAGNI — reviendront avec leurs consommateurs, blocks au plan F) ; `display_name`/`is_verified` **ajoutés** au profil (le front affiche prénom + badge, alimentés par les événements identity).
- Commits : Conventional Commits, un par tâche, sans trailer IA. Aucun secret en dur.

## Contrats partagés entre tâches (source de vérité)

**Événement `coloc.profile_updated`** (émis par coloc-profile C2, consommé par matching C5) :

```json
{"user_id": 7, "gender": "FEMME", "budget_min": 1000.0, "budget_max": 2500.0,
 "city": "Casablanca", "lifestyle": {"tabac": "non_fumeur"},
 "importance": {"tabac": "DECISIF"}, "complete": true}
```
`complete` = `gender`, `budget_max` et `city` tous renseignés (profil scorable). Valeurs nulles possibles sinon.

**Clé additive `house_rules` dans `coloc.listing_published`** (C1) : `{"tabac": "non_fumeur"}` — dict `{code: valeur canonique}` à côté du `rules` existant (liste de valeurs, conservée pour l'index/le front).

**API interne matching** (C4, appelée par le BFF C6) :
`POST /internal/scores` + en-tête `x-internal-token` — corps `{"user_id": 7, "listing_ids": ["abc…"]}` → `{"scores": {"abc…": 87, "def…": null}}` (`null` = hard-fail, profil incomplet ou critères absents — le front n'affiche rien).

**Réponse `GET /me/profile`** (coloc-profile C2, mappée par le front C7) :

```json
{"user_id": 7, "display_name": "Sara", "is_verified": false, "gender": "FEMME",
 "birth_date": null, "city": "Casablanca", "bio": null, "budget_min": 1000.0,
 "budget_max": 2500.0, "move_in_date": "2026-09-01",
 "lifestyle": [{"question_code": "tabac", "value": "non_fumeur", "importance": "DECISIF"}]}
```

**Routes BFF ajoutées** (C6) : `GET/PUT /api/v1/me/profile`, `PUT /api/v1/me/lifestyle`, `GET/POST /api/v1/me/favorites`, `DELETE /api/v1/me/favorites/{listing_id}` → coloc-profile ; `GET /api/v1/listings` devient l'endpoint **composite** (search + scores).

---

### Task C1: Contrats d'événements — tenant dans `user.*`, référentiel lifestyle, `house_rules` dans l'événement publié

**Files:**
- Create: `libs/semsar_common/semsar_common/coloc_referential.py`
- Modify: `services/identity/app/auth.py` (`_user_event_doc`)
- Modify: `services/coloc-listing/app/main.py` (`_search_doc`), `app/schemas.py` (`HouseRuleIn`), `app/seed_demo.py` (codes canoniques)
- Test: `services/identity/tests/test_tenant_auth.py` (ajout), `services/coloc-listing/tests/test_listings.py` (maj)

**Interfaces:**
- Produces: `from semsar_common.coloc_referential import IMPORTANCE_LEVELS, LIFESTYLE_QUESTIONS` ; payload `user.created`/`user.updated` avec clé `"tenant"` ; `_search_doc()["house_rules"] -> dict[str, str]` ; house-rules de coloc-listing validées contre le référentiel (400 sinon) ; seed B5 recodé canonique.

- [ ] **Step 1: Référentiel partagé**

`libs/semsar_common/semsar_common/coloc_referential.py` :

```python
"""Référentiel lifestyle M3a-L3achrane — source unique du vocabulaire partagé.

Le dépôt initial n'avait AUCUN référentiel (codes libres, accord implicite entre
profile/listing/matching). Formalisé au port : coloc-profile valide les réponses,
coloc-listing valide les règles de vie, matching compare les mêmes codes/valeurs.
"""

LIFESTYLE_QUESTIONS: dict[str, list[str]] = {
    "tabac": ["non_fumeur", "fumeur"],
    "animaux": ["acceptes", "refuses"],
    "invites": ["souvent", "rarement"],
    "coucher": ["tot", "tard"],
    "menage": ["frequent", "souple"],
}

IMPORTANCE_LEVELS = {"INDIFFERENT", "PREFERENCE", "DECISIF"}
```

- [ ] **Step 2: Test identity — tenant dans le payload d'événement (rouge)**

Ajouter à `services/identity/tests/test_tenant_auth.py` :

```python
def test_user_event_carries_tenant(client, db_session):
    from semsar_events import OutboxEvent
    from sqlalchemy import select

    client.post("/auth/register", json=_REG, headers=_M3A)
    row = db_session.scalars(select(OutboxEvent).where(
        OutboxEvent.event_type == "user.created")).first()
    assert row is not None
    assert row.payload["tenant"] == "m3a-l3achrane"
```

Run: `cd services/identity && python3 -m pytest tests/test_tenant_auth.py -v` → FAIL (`KeyError: 'tenant'`).

- [ ] **Step 3: Implémenter — une ligne dans `_user_event_doc`**

Dans `services/identity/app/auth.py`, fonction `_user_event_doc`, ajouter dans le dict retourné (après `"email": u.email,`) :

```python
        "tenant": u.tenant,
```

Run: `python3 -m pytest tests/ -v` → PASS (10 tests).

- [ ] **Step 4: coloc-listing — `house_rules` dans `_search_doc` + validation référentiel (rouge d'abord)**

Dans `services/coloc-listing/tests/test_listings.py` :
1. Remplacer, dans `test_house_rules_media_roommates`, le payload house-rules par :

```python
    resp = client.put(f"/listings/{lid}/house-rules",
                      json={"rules": [{"code": "tabac", "value": "non_fumeur"}]},
                      headers=headers())
    assert resp.status_code == 200
    resp = client.put(f"/listings/{lid}/house-rules",
                      json={"rules": [{"code": "inconnu", "value": "x"}]},
                      headers=headers())
    assert resp.status_code == 400  # hors référentiel
```

2. Ajouter à la fin de `test_full_lifecycle_publishes_events` (après les asserts d'événements) :

```python
    published = db_session.scalars(select(OutboxEvent).where(
        OutboxEvent.event_type == "coloc.listing_published")).first()
    assert published.payload["house_rules"] == {}  # dict {code: valeur} présent
```

Run → FAIL. Implémentation :

3. `services/coloc-listing/app/schemas.py` — dans `HouseRuleIn`, remplacer le corps par :

```python
class HouseRuleIn(BaseModel):
    code: str = Field(max_length=40)
    value: str = Field(max_length=120)

    @field_validator("value")
    @classmethod
    def _known(cls, v: str, info):
        # La validation croisée code+valeur se fait dans la route (erreur legacy 400).
        return v
```

et dans `services/coloc-listing/app/main.py`, route `put_house_rules`, ajouter avant la suppression/réinsertion :

```python
    from semsar_common.coloc_referential import LIFESTYLE_QUESTIONS

    for rule in body.rules:
        allowed = LIFESTYLE_QUESTIONS.get(rule.code)
        if allowed is None or rule.value not in allowed:
            return _err(f"Règle de vie hors référentiel : {rule.code}={rule.value}", 400)
```

4. `services/coloc-listing/app/main.py`, `_search_doc` — ajouter la clé (après `"rules": ...`) :

```python
        "house_rules": {r.code: r.value for r in listing.house_rules},
```

Run: `python3 -m pytest tests/ -v` → PASS (21 tests).

- [ ] **Step 5: Seed B5 recodé canonique**

Dans `services/coloc-listing/app/seed_demo.py` : remplacer, dans `DEMO`, chaque liste de règles (dernier élément des tuples) par des **paires canoniques**, et la boucle d'insertion. Nouvelles valeurs de la colonne rules dans `DEMO` (ordre des 8 annonces) :

```python
    [("tabac", "non_fumeur"), ("menage", "frequent")],
    [("animaux", "acceptes")],
    [("tabac", "non_fumeur")],
    [("invites", "rarement")],
    [("tabac", "non_fumeur"), ("coucher", "tot")],
    [("invites", "rarement"), ("menage", "frequent")],
    [("invites", "souvent")],
    [("tabac", "non_fumeur")],
]
```

et remplacer la boucle `for rule in rules:` par :

```python
            for code, value in rules:
                db.add(HouseRule(listing_id=listing.id, code=code, value=value))
```

- [ ] **Step 6: Reseed la base dev (les annonces existantes gardent les anciens codes)**

```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -c \
  "TRUNCATE coloc_listing.house_rules, coloc_listing.listing_media, coloc_listing.current_roommates, coloc_listing.listings, coloc_listing.properties, coloc_listing.outbox CASCADE;"
curl -s -XDELETE "http://localhost:9200/coloc_listings" >/dev/null
env SERVICE_NAME=coloc-listing PYTHONPATH=services/coloc-listing \
  DATABASE_URL="postgresql+psycopg://coloc_listing:coloc_listing@localhost:5432/semsar_dev" \
  python3 -m app.seed_demo
```

Expected: `Seed : 8 annonces publiées` (l'index se repeuple via relay+worker au prochain run du mesh — vérifié en C8).

- [ ] **Step 7: Commit**

```bash
git add libs/semsar_common services/identity services/coloc-listing
git commit -m "feat(coloc): référentiel lifestyle partagé + tenant dans user.* + house_rules dans l'événement publié"
```

---

### Task C2: Service coloc-profile — modèles + routes + émission d'événements

**Files:**
- Create: `services/coloc-profile/pyproject.toml`, `db/schema.sql`, `.env.example`, `README.md`, `app/__init__.py`, `app/db.py`, `app/models.py`, `app/schemas.py`, `app/main.py`, `app/relay.py`
- Test: `services/coloc-profile/tests/conftest.py`, `tests/test_profile.py`

**Interfaces:**
- Consumes: référentiel C1 ; `semsar_events.enqueue` ; `semsar_auth.get_principal`.
- Produces: routes `GET/PUT /me/profile`, `PUT /me/lifestyle`, `GET/POST /me/favorites`, `DELETE /me/favorites/{listing_id}` (contrat « Réponse GET /me/profile » de l'en-tête) ; événement `coloc.profile_updated` (contrat de l'en-tête) émis par les deux PUT ; fonction `ensure_profile(db, user_id) -> Profile` et `_profile_event_doc(profile) -> dict` réutilisées par le worker C3.

- [ ] **Step 1: Config du service** — mêmes patrons que coloc-listing :

`services/coloc-profile/pyproject.toml` : copier celui de coloc-listing en remplaçant name par `"semsar-coloc-profile"` et description par `"M3a-L3achrane — service coloc-profile (profils chercheurs, lifestyle, favoris)."`.

`services/coloc-profile/db/schema.sql` :

```sql
-- Service coloc-profile — rôle + schéma dédiés (PostgreSQL NATIF, ADR-0002).
CREATE ROLE coloc_profile LOGIN PASSWORD 'coloc_profile';
CREATE SCHEMA IF NOT EXISTS coloc_profile AUTHORIZATION coloc_profile;
ALTER ROLE coloc_profile SET search_path = coloc_profile;
GRANT ALL ON SCHEMA coloc_profile TO coloc_profile;
```

`services/coloc-profile/.env.example` : copier celui de coloc-listing en remplaçant `SERVICE_NAME=coloc-profile` et le rôle dans DATABASE_URL par `coloc_profile:coloc_profile`.

`services/coloc-profile/README.md` :

```markdown
# coloc-profile — profils chercheurs M3a-L3achrane

Port du service `profile` du dépôt initial (conventions mesh). Port :8522.
Profil + questionnaire lifestyle (référentiel `semsar_common.coloc_referential`)
+ favoris. Créé automatiquement à l'inscription (consumer `user.*`, tenant
m3a-l3achrane). Émet `coloc.profile_updated` (consommé par matching).

    psql "$ADMIN" -f db/schema.sql
    uvicorn app.main:app --port 8522
    python -m app.relay ; python -m app.worker
```

`app/db.py` : copier celui de coloc-listing en remplaçant le fallback par `postgresql+psycopg://coloc_profile:coloc_profile@localhost:5432/semsar`.

- [ ] **Step 2: conftest + tests (rouge)**

`services/coloc-profile/tests/conftest.py` : copier intégralement `services/coloc-listing/tests/conftest.py` (fixtures `db_session`, `client`, helper `headers()` — mêmes en-têtes x-semsar-*).

`services/coloc-profile/tests/test_profile.py` :

```python
from sqlalchemy import select

from semsar_events import OutboxEvent

from tests.conftest import headers


def test_get_profile_autocreates_empty(client):
    resp = client.get("/me/profile", headers=headers(user_id=7))
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_id"] == 7 and body["gender"] is None and body["lifestyle"] == []


def test_tenant_and_auth_guards(client):
    assert client.get("/me/profile").status_code in (401, 403)
    assert client.get("/me/profile", headers=headers(tenant="semsar")).status_code == 403


def test_put_profile_validates_and_emits(client, db_session):
    resp = client.put("/me/profile", headers=headers(),
                      json={"gender": "FEMME", "city": "Casablanca",
                            "budget_min": "1000.00", "budget_max": "2500.00"})
    assert resp.status_code == 200
    assert resp.json()["gender"] == "FEMME"
    # budget incohérent → 400
    assert client.put("/me/profile", headers=headers(),
                      json={"budget_min": "3000.00", "budget_max": "2500.00"}).status_code == 400
    # genre inconnu → 400
    assert client.put("/me/profile", headers=headers(),
                      json={"gender": "AUTRE"}).status_code == 400
    row = db_session.scalars(select(OutboxEvent).where(
        OutboxEvent.event_type == "coloc.profile_updated")).first()
    assert row is not None
    assert row.payload["gender"] == "FEMME" and row.payload["complete"] is True
    assert "display_name" not in row.payload  # jamais de PII dans l'événement


def test_put_lifestyle_replaces_and_validates(client, db_session):
    ok = {"answers": [
        {"question_code": "tabac", "value": "non_fumeur", "importance": "DECISIF"},
        {"question_code": "coucher", "value": "tot", "importance": "PREFERENCE"},
    ]}
    resp = client.put("/me/lifestyle", json=ok, headers=headers())
    assert resp.status_code == 200 and len(resp.json()) == 2
    # remplacement complet
    resp = client.put("/me/lifestyle", headers=headers(),
                      json={"answers": [{"question_code": "tabac", "value": "fumeur",
                                         "importance": "PREFERENCE"}]})
    assert [a["value"] for a in resp.json()] == ["fumeur"]
    # hors référentiel → 400
    assert client.put("/me/lifestyle", headers=headers(),
                      json={"answers": [{"question_code": "regime", "value": "x",
                                         "importance": "PREFERENCE"}]}).status_code == 400
    events = db_session.scalars(select(OutboxEvent.event_type)).all()
    assert events.count("coloc.profile_updated") == 2


def test_favorites_idempotent_cycle(client):
    h = headers(user_id=9)
    assert client.post("/me/favorites", json={"listing_id": "a" * 32}, headers=h).status_code == 204
    assert client.post("/me/favorites", json={"listing_id": "a" * 32}, headers=h).status_code == 204
    favs = client.get("/me/favorites", headers=h).json()
    assert len(favs) == 1 and favs[0]["listing_id"] == "a" * 32
    assert client.delete(f"/me/favorites/{'a' * 32}", headers=h).status_code == 204
    assert client.get("/me/favorites", headers=h).json() == []
```

Run: `pip install -e "services/coloc-profile[test]"` puis `cd services/coloc-profile && python3 -m pytest tests/ -v` → FAIL (modules absents).

- [ ] **Step 3: models.py**

`services/coloc-profile/app/models.py` :

```python
"""Modèles coloc-profile (schéma `coloc_profile`) — portés de m3a-l3achrane.

Adaptations actées : user_id BigInteger (identity semsarout), city en chaîne,
display_name/is_verified ajoutés (alimentés par les événements user.*),
tables interests/saved_searches/blocks et champs life_status/visibility non portés
(YAGNI — voir plan C). PII (display_name, bio) jamais dans les événements.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .db import Base

GENDERS = {"FEMME", "HOMME"}


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_profiles_user_id"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    user_id = Column(BigInteger, nullable=False, index=True)
    display_name = Column(String(80))
    is_verified = Column(Boolean, default=False, nullable=False)
    gender = Column(String(10))          # FEMME | HOMME
    birth_date = Column(Date)
    city = Column(String(80))
    bio = Column(String(2000))
    budget_min = Column(Numeric(12, 2))
    budget_max = Column(Numeric(12, 2))
    move_in_date = Column(Date)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    lifestyle_answers = relationship("LifestyleAnswer", cascade="all, delete-orphan",
                                     lazy="selectin")

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id, "display_name": self.display_name,
            "is_verified": self.is_verified, "gender": self.gender,
            "birth_date": self.birth_date.isoformat() if self.birth_date else None,
            "city": self.city, "bio": self.bio,
            "budget_min": float(self.budget_min) if self.budget_min is not None else None,
            "budget_max": float(self.budget_max) if self.budget_max is not None else None,
            "move_in_date": self.move_in_date.isoformat() if self.move_in_date else None,
            "lifestyle": [{"question_code": a.question_code, "value": a.value,
                           "importance": a.importance} for a in self.lifestyle_answers],
        }


class LifestyleAnswer(Base):
    __tablename__ = "lifestyle_answers"
    __table_args__ = (UniqueConstraint("profile_id", "question_code",
                                       name="uq_lifestyle_answers_profile_question"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    profile_id = Column(String(32), ForeignKey("profiles.id"), nullable=False, index=True)
    question_code = Column(String(40), nullable=False)
    value = Column(String(60), nullable=False)
    importance = Column(String(12), default="PREFERENCE", nullable=False)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "listing_id", name="uq_favorites_user_listing"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    user_id = Column(BigInteger, nullable=False, index=True)
    listing_id = Column(String(32), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 4: schemas.py**

`services/coloc-profile/app/schemas.py` :

```python
"""Payloads API coloc-profile — référentiel lifestyle partagé (semsar_common)."""
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class ProfileIn(BaseModel):
    """Mise à jour partielle (exclude_unset) — validations métier dans la route."""

    gender: str | None = None
    birth_date: date | None = None
    city: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=2000)
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    move_in_date: date | None = None


class LifestyleAnswerIn(BaseModel):
    question_code: str = Field(max_length=40)
    value: str = Field(max_length=60)
    importance: str = "PREFERENCE"


class LifestyleAnswersIn(BaseModel):
    answers: list[LifestyleAnswerIn]


class FavoriteIn(BaseModel):
    listing_id: str = Field(min_length=1, max_length=32)
```

- [ ] **Step 5: main.py + relay.py**

`services/coloc-profile/app/relay.py` : copier celui de coloc-listing (docstring adaptée « service coloc-profile »).

`services/coloc-profile/app/main.py` :

```python
"""Service coloc-profile — profils chercheurs M3a-L3achrane.

Port du service profile du dépôt initial, conventions mesh. Le profil est créé
par le consumer user.* (worker) à l'inscription ; GET /me/profile le crée aussi
à la volée (ensure) pour les comptes antérieurs au consumer. Les deux PUT
émettent coloc.profile_updated (projection matching) — événement créé au port,
l'original n'émettait rien. PII jamais dans les événements.
"""
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_common.coloc_referential import IMPORTANCE_LEVELS, LIFESTYLE_QUESTIONS
from semsar_events import enqueue

from .db import get_db, init_db
from .models import GENDERS, Favorite, LifestyleAnswer, Profile
from .schemas import FavoriteIn, LifestyleAnswersIn, ProfileIn

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

TENANT = "m3a-l3achrane"
PROFILE_UPDATED = "coloc.profile_updated"


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


def ensure_profile(db: Session, user_id: int) -> Profile:
    """Crée le profil vide s'il n'existe pas (idempotent) — utilisé par les routes et le worker."""
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if profile is None:
        profile = Profile(user_id=user_id)
        db.add(profile)
        db.flush()
    return profile


def _profile_event_doc(profile: Profile) -> dict:
    """Payload coloc.profile_updated — critères de compatibilité SEULEMENT (pas de PII)."""
    lifestyle = {a.question_code: a.value for a in profile.lifestyle_answers}
    importance = {a.question_code: a.importance for a in profile.lifestyle_answers}
    complete = bool(profile.gender and profile.budget_max is not None and profile.city)
    return {
        "user_id": profile.user_id, "gender": profile.gender,
        "budget_min": float(profile.budget_min) if profile.budget_min is not None else None,
        "budget_max": float(profile.budget_max) if profile.budget_max is not None else None,
        "city": profile.city, "lifestyle": lifestyle, "importance": importance,
        "complete": complete,
    }


def _emit_updated(db: Session, profile: Profile) -> None:
    enqueue(db, "coloc_profile", profile.user_id, PROFILE_UPDATED, _profile_event_doc(profile))


@router.get("/me/profile")
def get_profile(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    profile = ensure_profile(db, uid)
    db.commit()
    return profile.to_dict()


@router.put("/me/profile")
def put_profile(body: ProfileIn, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    data = body.model_dump(exclude_unset=True)
    if "gender" in data and data["gender"] is not None and data["gender"] not in GENDERS:
        return _err(f"Genre invalide : {data['gender']}", 400)
    profile = ensure_profile(db, uid)
    merged_min = data.get("budget_min", profile.budget_min)
    merged_max = data.get("budget_max", profile.budget_max)
    if merged_min is not None and merged_max is not None and merged_min > merged_max:
        return _err("budget_min supérieur à budget_max", 400)
    for field, value in data.items():
        setattr(profile, field, value)
    _emit_updated(db, profile)
    db.commit()
    db.refresh(profile)
    return profile.to_dict()


@router.put("/me/lifestyle")
def put_lifestyle(body: LifestyleAnswersIn, principal: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    for a in body.answers:
        allowed = LIFESTYLE_QUESTIONS.get(a.question_code)
        if allowed is None or a.value not in allowed:
            return _err(f"Réponse hors référentiel : {a.question_code}={a.value}", 400)
        if a.importance not in IMPORTANCE_LEVELS:
            return _err(f"Importance invalide : {a.importance}", 400)
    profile = ensure_profile(db, uid)
    db.query(LifestyleAnswer).filter(LifestyleAnswer.profile_id == profile.id).delete()
    db.flush()
    for a in body.answers:
        db.add(LifestyleAnswer(profile_id=profile.id, question_code=a.question_code,
                               value=a.value, importance=a.importance))
    db.flush()
    db.refresh(profile)
    _emit_updated(db, profile)
    db.commit()
    db.refresh(profile)
    return profile.to_dict()["lifestyle"]


@router.get("/me/favorites")
def list_favorites(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    rows = db.query(Favorite).filter(Favorite.user_id == uid).order_by(
        Favorite.created_at.desc()).all()
    return [{"listing_id": f.listing_id, "created_at": f.created_at.isoformat()} for f in rows]


@router.post("/me/favorites", status_code=204)
def add_favorite(body: FavoriteIn, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    exists = db.query(Favorite).filter(Favorite.user_id == uid,
                                       Favorite.listing_id == body.listing_id).first()
    if exists is None:  # idempotent
        db.add(Favorite(user_id=uid, listing_id=body.listing_id))
        db.commit()
    return Response(status_code=204)


@router.delete("/me/favorites/{listing_id}", status_code=204)
def remove_favorite(listing_id: str, principal: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    db.query(Favorite).filter(Favorite.user_id == uid,
                              Favorite.listing_id == listing_id).delete()
    db.commit()
    return Response(status_code=204)


app.include_router(router)
```

- [ ] **Step 6: Vérifier le vert**

Run: `cd services/coloc-profile && python3 -m pytest tests/ -v`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add services/coloc-profile
git commit -m "feat(coloc-profile): profils + lifestyle référencé + favoris + événement coloc.profile_updated"
```

---

### Task C3: Worker coloc-profile — création des profils depuis `user.*`

**Files:**
- Create: `services/coloc-profile/app/worker.py`
- Test: `services/coloc-profile/tests/test_worker.py`

**Interfaces:**
- Consumes: événements `user.created`/`user.updated` avec clé `tenant` (C1) ; `ensure_profile` (C2).
- Produces: handler `_handle(routing_key, payload, message_id)` idempotent (table `processed_message`) — profils créés/mis à jour (display_name, is_verified) UNIQUEMENT pour le tenant `m3a-l3achrane`.

- [ ] **Step 1: Tests du handler (rouge)**

`services/coloc-profile/tests/test_worker.py` :

```python
from app.models import Profile
from app.worker import _handle_with_session


def _payload(uid=7, tenant="m3a-l3achrane", **extra):
    return {"id": uid, "tenant": tenant, "first_name": "Sara", "is_verified": False, **extra}


def test_user_created_m3a_creates_profile(db_session):
    _handle_with_session(db_session, "user.created", _payload(), "m1")
    p = db_session.query(Profile).filter_by(user_id=7).one()
    assert p.display_name == "Sara" and p.is_verified is False


def test_user_created_semsar_ignored(db_session):
    _handle_with_session(db_session, "user.created", _payload(tenant="semsar"), "m2")
    assert db_session.query(Profile).count() == 0


def test_user_updated_syncs_verification(db_session):
    _handle_with_session(db_session, "user.created", _payload(), "m3")
    _handle_with_session(db_session, "user.updated",
                         _payload(is_verified=True, first_name="Sara B."), "m4")
    p = db_session.query(Profile).filter_by(user_id=7).one()
    assert p.is_verified is True and p.display_name == "Sara B."


def test_idempotent_by_message_id(db_session):
    _handle_with_session(db_session, "user.created", _payload(), "same")
    _handle_with_session(db_session, "user.created", _payload(), "same")
    assert db_session.query(Profile).count() == 1
```

Run → FAIL (`No module named 'app.worker'`).

- [ ] **Step 2: worker.py (patron geo : dédup ProcessedMessage)**

`services/coloc-profile/app/worker.py` :

```python
"""Consumer coloc-profile — crée/synchronise les profils depuis les événements user.*.

Seuls les comptes du tenant m3a-l3achrane produisent un profil (la clé `tenant`
du payload est posée par identity depuis le plan C). Idempotent par message_id.
    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal
from .main import ensure_profile
from .models import ProcessedMessage

TENANT = "m3a-l3achrane"


def _handle_with_session(db, routing_key: str, payload: dict, message_id: str) -> None:
    if message_id and db.get(ProcessedMessage, message_id) is not None:
        return
    if routing_key in ("user.created", "user.updated") \
            and payload.get("tenant") == TENANT and payload.get("id") is not None:
        profile = ensure_profile(db, int(payload["id"]))
        if payload.get("first_name"):
            profile.display_name = payload["first_name"]
        profile.is_verified = bool(payload.get("is_verified", False))
    if message_id:
        db.add(ProcessedMessage(message_id=message_id))
    db.commit()


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        _handle_with_session(db, routing_key, payload, message_id)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    consumer = EventConsumer(settings.rabbitmq_url, service_name=settings.service_name,
                             bindings=["user.#"], exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Vérifier le vert puis committer**

Run: `cd services/coloc-profile && python3 -m pytest tests/ -v` → PASS (9 tests).

```bash
git add services/coloc-profile
git commit -m "feat(coloc-profile): worker user.* — profils créés par tenant m3a-l3achrane"
```

---

### Task C4: Service matching — scoring porté + calcul paresseux + API interne

**Files:**
- Create: `services/matching/pyproject.toml`, `db/schema.sql`, `.env.example`, `README.md`, `app/__init__.py`, `app/db.py`, `app/scoring.py`, `app/models.py`, `app/service.py`, `app/main.py`
- Test: `services/matching/tests/conftest.py`, `tests/test_scoring.py`, `tests/test_service.py`, `tests/test_api.py`

**Interfaces:**
- Consumes: rien à l'exécution (projections remplies par C5 ; tests remplissent en direct).
- Produces: module pur `app/scoring.py` (`SeekerCriteria`, `ListingCriteria`, `Weights`, `MatchResult`, `evaluate`) ; `get_scores(db, seeker_id: int, listing_ids: list[str]) -> dict[str, int | None]` (calcul paresseux + cache `match_scores`) ; `POST /internal/scores` (contrat de l'en-tête, garde `x-internal-token`).

- [ ] **Step 1: Config** — `pyproject.toml` (name `"semsar-matching"`, description `"M3a-L3achrane — service matching (compatibilité déterministe, calcul paresseux)."`, mêmes dépendances que coloc-profile), `db/schema.sql` (rôle/schéma `matching`, même gabarit), `.env.example` (SERVICE_NAME=matching, rôle `matching:matching`, + `INTERNAL_TOKEN=change-me-internal`), `app/db.py` (fallback `postgresql+psycopg://matching:matching@localhost:5432/semsar`), `README.md` :

```markdown
# matching — compatibilité M3a-L3achrane

Port du service matching du dépôt initial : scoring déterministe pur
(contraintes dures + budget 0.4/lifestyle 0.6 + explications ≤ 4, AUCUN LLM).
Étage vectoriel (pgvector, ≤15 %) NON porté (hors périmètre spec §10).
Calcul PARESSEUX : score calculé à la première demande (API interne appelée
par le BFF), mis en cache dans match_scores, invalidé par événements
(worker : coloc.profile_updated, coloc.listing_published/status_changed).

    psql "$ADMIN" -f db/schema.sql
    uvicorn app.main:app --port 8523
    python -m app.worker
```

- [ ] **Step 2: scoring.py — port verbatim**

`services/matching/app/scoring.py` : recopier **intégralement** le fichier
`/home/younes/Documents/work/m3a-l3achrane/services/matching/src/matching_service/domain/scoring.py`
avec exactement deux adaptations : (1) dans le docstring de module, remplacer la dernière phrase (« La similarité vectorielle… module pur. ») par :

```python
La similarité vectorielle du dépôt initial (pgvector, ≤15 %) n'est pas portée
(hors périmètre spec §10). `city_id` porte des chaînes de villes (convention mesh).
```

(2) supprimer la ligne d'import `from enum import StrEnum` UNIQUEMENT si elle devient inutilisée — elle reste utilisée par `Importance`, donc en pratique le fichier est copié tel quel. Tout le reste (dataclasses, `_GENDER_MATCH`, `_hard_failures`, `_budget_fit`, `_lifestyle_fit`, `_explanations`, `evaluate`, défauts `budget=0.4`/`lifestyle=0.6`) est **byte-fidèle**.

- [ ] **Step 3: Tests scoring (rouge puis vert) — comportements clés du port**

`services/matching/tests/test_scoring.py` :

```python
from decimal import Decimal

from app.scoring import ListingCriteria, SeekerCriteria, Weights, evaluate

W = Weights(version="test")


def _seeker(**over):
    base = dict(gender="FEMME", budget_min=Decimal("1000"), budget_max=Decimal("2500"),
                city_id="Casablanca", lifestyle={}, importance={})
    base.update(over)
    return SeekerCriteria(**base)


def _listing(**over):
    base = dict(listing_id="l1", housing_gender="FEMININ", rent=Decimal("2000"),
                city_id="Casablanca", capacity=3, house_rules={})
    base.update(over)
    return ListingCriteria(**base)


def test_hard_constraints():
    assert evaluate(_seeker(), _listing(housing_gender="MASCULIN"), W).hard_failures == ["genre-logement"]
    assert evaluate(_seeker(), _listing(rent=Decimal("2600")), W).hard_failures == ["budget"]
    assert evaluate(_seeker(), _listing(city_id="Rabat"), W).hard_failures == ["ville"]
    r = evaluate(_seeker(lifestyle={"tabac": "non_fumeur"}, importance={"tabac": "DECISIF"}),
                 _listing(house_rules={"tabac": "fumeur"}), W)
    assert r.hard_failures == ["decisif:tabac"] and r.score == 0


def test_score_and_weights():
    # loyer au budget_min → budget_fit 1.0 ; aucune préférence comparable → lifestyle_fit 1.0
    assert evaluate(_seeker(), _listing(rent=Decimal("1000")), W).score == 100
    # loyer au budget_max → budget_fit 0.5 → 0.4*0.5 + 0.6*1.0 = 0.8
    assert evaluate(_seeker(), _listing(rent=Decimal("2500")), W).score == 80
    # préférence en conflit → lifestyle_fit 0 → 0.4*1.0 = 0.4
    r = evaluate(_seeker(lifestyle={"coucher": "tot"}, importance={"coucher": "PREFERENCE"}),
                 _listing(rent=Decimal("1000"), house_rules={"coucher": "tard"}), W)
    assert r.score == 40


def test_explanations_max_four_and_content():
    r = evaluate(_seeker(lifestyle={"coucher": "tot", "tabac": "non_fumeur"},
                         importance={"coucher": "PREFERENCE", "tabac": "PREFERENCE"}),
                 _listing(house_rules={"coucher": "tot", "tabac": "fumeur"}), W)
    assert r.hard_pass and len(r.explanations) <= 4
    assert any("Budget compatible" in e for e in r.explanations)
    assert any("coucher" in e for e in r.explanations)      # atout
    assert any("vigilance" in e for e in r.explanations)     # tabac en conflit
```

Run après Step 2 : `cd services/matching && python3 -m pytest tests/test_scoring.py -v` → PASS (le port verbatim doit passer ces tests sans modification ; s'ils échouent, le port n'est pas fidèle — corriger le PORT, pas les tests).

- [ ] **Step 4: models.py**

`services/matching/app/models.py` :

```python
"""Modèles matching (schéma `matching`) — portés SANS pgvector (hors périmètre).

Projections locales (compatibility_profiles, listing_criteria) alimentées par le
worker (C5) ; scores en cache (match_scores) calculés paresseusement, invalidés
par événements. seeker_id = id identity (BigInteger), listing_id = hex coloc-listing.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, BigInteger, Boolean, Column, DateTime, Integer, Numeric, String, UniqueConstraint,
)

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MatchingWeights(Base):
    """Pondérations versionnées (jamais en dur) — format weights = {"budget": x, "lifestyle": y}."""

    __tablename__ = "matching_weights"
    __table_args__ = (UniqueConstraint("version", name="uq_matching_weights_version"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    version = Column(String(40), nullable=False)
    weights = Column(JSON, nullable=False)
    active = Column(Boolean, default=False, nullable=False)


class CompatibilityProfile(Base):
    """Instantané des critères d'un chercheur (projection de coloc.profile_updated)."""

    __tablename__ = "compatibility_profiles"
    __table_args__ = (UniqueConstraint("seeker_id", name="uq_compatibility_profiles_seeker"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    seeker_id = Column(BigInteger, nullable=False, index=True)
    gender = Column(String(10), nullable=False)
    budget_min = Column(Numeric(12, 2))
    budget_max = Column(Numeric(12, 2), nullable=False)
    city = Column(String(80), nullable=False, index=True)
    lifestyle = Column(JSON, default=dict, nullable=False)
    importance = Column(JSON, default=dict, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class ListingCriteriaRow(Base):
    """Instantané des critères d'une annonce (projection de coloc.listing_published)."""

    __tablename__ = "listing_criteria"
    __table_args__ = (UniqueConstraint("listing_id", name="uq_listing_criteria_listing"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    listing_id = Column(String(32), nullable=False, index=True)
    housing_gender = Column(String(20), nullable=False)
    rent = Column(Numeric(12, 2), nullable=False)
    city = Column(String(80), nullable=False, index=True)
    capacity = Column(Integer, default=1, nullable=False)
    house_rules = Column(JSON, default=dict, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class MatchScore(Base):
    """Cache chercheur × annonce (generate-once / render-many)."""

    __tablename__ = "match_scores"
    __table_args__ = (UniqueConstraint("seeker_id", "listing_id", name="uq_match_scores_pair"),)

    id = Column(String(32), primary_key=True, default=_uuid)
    seeker_id = Column(BigInteger, nullable=False, index=True)
    listing_id = Column(String(32), nullable=False, index=True)
    score = Column(Integer, nullable=False)
    hard_pass = Column(Boolean, nullable=False)
    explanations = Column(JSON, default=dict, nullable=False)
    weights_version = Column(String(40), nullable=False)
    computed_at = Column(DateTime(timezone=True), default=_now, nullable=False)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 5: Tests du calcul paresseux (rouge)**

`services/matching/tests/test_service.py` :

```python
from decimal import Decimal

from app.models import CompatibilityProfile, ListingCriteriaRow, MatchScore
from app.service import get_scores


def _fill(db, *, seeker=True, listings=("l1",)):
    if seeker:
        db.add(CompatibilityProfile(seeker_id=7, gender="FEMME", budget_min=Decimal("1000"),
                                    budget_max=Decimal("2500"), city="Casablanca",
                                    lifestyle={"tabac": "non_fumeur"},
                                    importance={"tabac": "DECISIF"}))
    for lid in listings:
        db.add(ListingCriteriaRow(listing_id=lid, housing_gender="FEMININ",
                                  rent=Decimal("2000"), city="Casablanca", capacity=3,
                                  house_rules={"tabac": "non_fumeur"}))
    db.commit()


def test_lazy_compute_and_cache(db_session):
    _fill(db_session)
    scores = get_scores(db_session, 7, ["l1"])
    assert isinstance(scores["l1"], int) and 0 < scores["l1"] <= 100
    cached = db_session.query(MatchScore).filter_by(seeker_id=7, listing_id="l1").one()
    assert cached.hard_pass is True and cached.weights_version == "default-v1"
    # 2e appel : lit le cache (même valeur, pas de nouvelle ligne)
    assert get_scores(db_session, 7, ["l1"]) == scores
    assert db_session.query(MatchScore).count() == 1


def test_hard_fail_cached_as_null(db_session):
    _fill(db_session, listings=())
    db_session.add(ListingCriteriaRow(listing_id="l2", housing_gender="MASCULIN",
                                      rent=Decimal("2000"), city="Casablanca", capacity=3,
                                      house_rules={}))
    db_session.commit()
    scores = get_scores(db_session, 7, ["l2"])
    assert scores["l2"] is None
    assert db_session.query(MatchScore).filter_by(listing_id="l2").one().hard_pass is False


def test_no_profile_returns_all_null_without_compute(db_session):
    _fill(db_session, seeker=False)
    assert get_scores(db_session, 99, ["l1"]) == {"l1": None}
    assert db_session.query(MatchScore).count() == 0


def test_unknown_listing_null(db_session):
    _fill(db_session)
    assert get_scores(db_session, 7, ["absent"]) == {"absent": None}
```

`services/matching/tests/conftest.py` : copier celui de coloc-profile (fixtures `db_session` + `client`, sans helper headers — ajouter en bas) :

```python
INTERNAL = {"x-internal-token": "change-me-internal"}
```

et en tête de fichier, avant les imports d'app : `os.environ.setdefault("INTERNAL_TOKEN", "change-me-internal")`.

Run → FAIL (`No module named 'app.service'`).

- [ ] **Step 6: service.py**

`services/matching/app/service.py` :

```python
"""Calcul paresseux des scores — cache match_scores, invalidation par le worker.

get_scores : pour chaque paire (seeker, listing) demandée, lit le cache ; sinon
calcule depuis les projections et persiste (generate-once / render-many). Un
hard-fail est aussi mis en cache (hard_pass=False) et rendu comme None. Sans
profil scorable (gender/budget_max/city manquants) : tout None, aucun calcul.
"""
from decimal import Decimal

from sqlalchemy.orm import Session

from .models import CompatibilityProfile, ListingCriteriaRow, MatchScore, MatchingWeights
from .scoring import ListingCriteria, SeekerCriteria, Weights, evaluate


def active_weights(db: Session) -> Weights:
    """Pondérations actives, ou le défaut versionné du dépôt initial (0.4/0.6)."""
    row = db.query(MatchingWeights).filter(MatchingWeights.active.is_(True)).first()
    if row is None:
        return Weights(version="default-v1")
    return Weights(version=row.version, budget=float(row.weights["budget"]),
                   lifestyle=float(row.weights["lifestyle"]))


def _seeker_criteria(p: CompatibilityProfile) -> SeekerCriteria:
    return SeekerCriteria(
        gender=p.gender,
        budget_min=Decimal(str(p.budget_min)) if p.budget_min is not None else Decimal("0"),
        budget_max=Decimal(str(p.budget_max)), city_id=p.city,
        lifestyle=dict(p.lifestyle or {}), importance=dict(p.importance or {}),
    )


def get_scores(db: Session, seeker_id: int, listing_ids: list[str]) -> dict[str, int | None]:
    result: dict[str, int | None] = {lid: None for lid in listing_ids}
    if not listing_ids:
        return result
    profile = db.query(CompatibilityProfile).filter(
        CompatibilityProfile.seeker_id == seeker_id).first()
    if profile is None:
        return result

    cached = db.query(MatchScore).filter(MatchScore.seeker_id == seeker_id,
                                         MatchScore.listing_id.in_(listing_ids)).all()
    by_listing = {c.listing_id: c for c in cached}
    missing = [lid for lid in listing_ids if lid not in by_listing]

    if missing:
        weights = active_weights(db)
        seeker = _seeker_criteria(profile)
        rows = db.query(ListingCriteriaRow).filter(
            ListingCriteriaRow.listing_id.in_(missing)).all()
        for row in rows:
            outcome = evaluate(seeker, ListingCriteria(
                listing_id=row.listing_id, housing_gender=row.housing_gender,
                rent=Decimal(str(row.rent)), city_id=row.city, capacity=row.capacity,
                house_rules=dict(row.house_rules or {})), weights)
            score = MatchScore(seeker_id=seeker_id, listing_id=row.listing_id,
                               score=outcome.score, hard_pass=outcome.hard_pass,
                               explanations={"reasons": outcome.explanations},
                               weights_version=weights.version)
            db.add(score)
            by_listing[row.listing_id] = score
        db.commit()

    for lid, cached_row in by_listing.items():
        result[lid] = cached_row.score if cached_row.hard_pass else None
    return result
```

- [ ] **Step 7: Tests API interne (rouge) puis main.py**

`services/matching/tests/test_api.py` :

```python
from decimal import Decimal

from app.models import CompatibilityProfile, ListingCriteriaRow

from tests.conftest import INTERNAL


def test_internal_token_required(client):
    resp = client.post("/internal/scores", json={"user_id": 7, "listing_ids": ["x"]})
    assert resp.status_code == 403


def test_scores_endpoint(client, db_session):
    db_session.add(CompatibilityProfile(seeker_id=7, gender="FEMME",
                                        budget_min=Decimal("1000"), budget_max=Decimal("2500"),
                                        city="Casablanca", lifestyle={}, importance={}))
    db_session.add(ListingCriteriaRow(listing_id="l1", housing_gender="FEMININ",
                                      rent=Decimal("1000"), city="Casablanca", capacity=2,
                                      house_rules={}))
    db_session.commit()
    resp = client.post("/internal/scores", headers=INTERNAL,
                       json={"user_id": 7, "listing_ids": ["l1", "absent"]})
    assert resp.status_code == 200
    assert resp.json() == {"scores": {"l1": 100, "absent": None}}
```

`services/matching/app/main.py` :

```python
"""Service matching — API interne de scores (appelée par le BFF uniquement).

Aucune route publique : le BFF compose GET /listings avec ces scores. Garde
x-internal-token (patron geo). Projections alimentées par app/worker.py.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .db import get_db, init_db
from .service import get_scores

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


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


class ScoresIn(BaseModel):
    user_id: int
    listing_ids: list[str] = Field(max_length=200)


@app.post("/internal/scores", include_in_schema=False)
def internal_scores(body: ScoresIn, x_internal_token: str = Header(default=""),
                    db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    return {"scores": get_scores(db, body.user_id, body.listing_ids)}
```

- [ ] **Step 8: Vérifier le vert puis committer**

Run: `pip install -e "services/matching[test]" && cd services/matching && python3 -m pytest tests/ -v` → PASS (10 tests).

```bash
git add services/matching
git commit -m "feat(matching): scoring porté verbatim + calcul paresseux en cache + API interne /internal/scores"
```

---

### Task C5: Worker matching — projections et invalidation

**Files:**
- Create: `services/matching/app/worker.py`
- Test: `services/matching/tests/test_worker.py`

**Interfaces:**
- Consumes: `coloc.profile_updated` (contrat C2), `coloc.listing_published` (avec `house_rules` C1), `coloc.listing_status_changed`.
- Produces: handler `_handle_with_session(db, routing_key, payload, message_id)` — upsert des projections + **invalidation ciblée** du cache (`DELETE match_scores` du chercheur ou de l'annonce).

- [ ] **Step 1: Tests (rouge)**

`services/matching/tests/test_worker.py` :

```python
from decimal import Decimal

from app.models import CompatibilityProfile, ListingCriteriaRow, MatchScore
from app.worker import _handle_with_session

PROFILE = {"user_id": 7, "gender": "FEMME", "budget_min": 1000.0, "budget_max": 2500.0,
           "city": "Casablanca", "lifestyle": {"tabac": "non_fumeur"},
           "importance": {"tabac": "DECISIF"}, "complete": True}
PUBLISHED = {"listing_id": "l1", "housing_gender": "FEMININ", "rent": 2000.0,
             "city": "Casablanca", "capacity": 3, "house_rules": {"tabac": "non_fumeur"},
             "title": "T", "status": "PUBLIEE"}


def _score(db, seeker=7, listing="l1"):
    db.add(MatchScore(seeker_id=seeker, listing_id=listing, score=80, hard_pass=True,
                      explanations={}, weights_version="default-v1"))
    db.commit()


def test_profile_updated_upserts_and_invalidates(db_session):
    _score(db_session)
    _handle_with_session(db_session, "coloc.profile_updated", PROFILE, "m1")
    p = db_session.query(CompatibilityProfile).filter_by(seeker_id=7).one()
    assert p.city == "Casablanca" and p.lifestyle == {"tabac": "non_fumeur"}
    assert db_session.query(MatchScore).count() == 0  # cache du chercheur invalidé
    # mise à jour (upsert, pas de doublon)
    _handle_with_session(db_session, "coloc.profile_updated", {**PROFILE, "city": "Rabat"}, "m2")
    assert db_session.query(CompatibilityProfile).count() == 1
    assert db_session.query(CompatibilityProfile).one().city == "Rabat"


def test_incomplete_profile_removes_projection(db_session):
    _handle_with_session(db_session, "coloc.profile_updated", PROFILE, "m1")
    _handle_with_session(db_session, "coloc.profile_updated",
                         {**PROFILE, "gender": None, "complete": False}, "m2")
    assert db_session.query(CompatibilityProfile).count() == 0


def test_listing_published_upserts_and_invalidates(db_session):
    _score(db_session, seeker=8)
    _handle_with_session(db_session, "coloc.listing_published", PUBLISHED, "m1")
    row = db_session.query(ListingCriteriaRow).filter_by(listing_id="l1").one()
    assert row.rent == Decimal("2000") and row.house_rules == {"tabac": "non_fumeur"}
    assert db_session.query(MatchScore).count() == 0  # cache de l'annonce invalidé


def test_status_changed_removes_criteria_and_scores(db_session):
    _handle_with_session(db_session, "coloc.listing_published", PUBLISHED, "m1")
    _score(db_session)
    _handle_with_session(db_session, "coloc.listing_status_changed",
                         {"listing_id": "l1", "previous_status": "PUBLIEE",
                          "new_status": "ARCHIVEE"}, "m2")
    assert db_session.query(ListingCriteriaRow).count() == 0
    assert db_session.query(MatchScore).count() == 0


def test_idempotent(db_session):
    _handle_with_session(db_session, "coloc.listing_published", PUBLISHED, "same")
    _handle_with_session(db_session, "coloc.listing_published", PUBLISHED, "same")
    assert db_session.query(ListingCriteriaRow).count() == 1
```

Run → FAIL (`No module named 'app.worker'`).

- [ ] **Step 2: worker.py**

`services/matching/app/worker.py` :

```python
"""Consumer matching — projections + invalidation ciblée du cache de scores.

coloc.profile_updated  → upsert compatibility_profiles (delete si non scorable)
                          + DELETE match_scores du chercheur.
coloc.listing_published → upsert listing_criteria + DELETE match_scores de l'annonce.
coloc.listing_status_changed (≠ PUBLIEE) → DELETE criteria + scores de l'annonce.
Idempotent par message_id.    python -m app.worker
"""
from decimal import Decimal

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal
from .models import CompatibilityProfile, ListingCriteriaRow, MatchScore, ProcessedMessage


def _handle_with_session(db, routing_key: str, payload: dict, message_id: str) -> None:
    if message_id and db.get(ProcessedMessage, message_id) is not None:
        return

    if routing_key == "coloc.profile_updated":
        seeker_id = int(payload["user_id"])
        db.query(MatchScore).filter(MatchScore.seeker_id == seeker_id).delete()
        existing = db.query(CompatibilityProfile).filter(
            CompatibilityProfile.seeker_id == seeker_id).first()
        if not payload.get("complete"):
            if existing is not None:
                db.delete(existing)
        else:
            row = existing or CompatibilityProfile(seeker_id=seeker_id)
            row.gender = payload["gender"]
            row.budget_min = Decimal(str(payload["budget_min"])) \
                if payload.get("budget_min") is not None else None
            row.budget_max = Decimal(str(payload["budget_max"]))
            row.city = payload["city"]
            row.lifestyle = payload.get("lifestyle") or {}
            row.importance = payload.get("importance") or {}
            db.add(row)

    elif routing_key == "coloc.listing_published":
        listing_id = payload["listing_id"]
        db.query(MatchScore).filter(MatchScore.listing_id == listing_id).delete()
        row = db.query(ListingCriteriaRow).filter(
            ListingCriteriaRow.listing_id == listing_id).first() \
            or ListingCriteriaRow(listing_id=listing_id)
        row.housing_gender = payload["housing_gender"]
        row.rent = Decimal(str(payload["rent"]))
        row.city = payload["city"]
        row.capacity = int(payload.get("capacity") or 1)
        row.house_rules = payload.get("house_rules") or {}
        db.add(row)

    elif routing_key == "coloc.listing_status_changed":
        if payload.get("new_status") != "PUBLIEE":
            listing_id = payload["listing_id"]
            db.query(MatchScore).filter(MatchScore.listing_id == listing_id).delete()
            db.query(ListingCriteriaRow).filter(
                ListingCriteriaRow.listing_id == listing_id).delete()

    if message_id:
        db.add(ProcessedMessage(message_id=message_id))
    db.commit()


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        _handle_with_session(db, routing_key, payload, message_id)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    consumer = EventConsumer(settings.rabbitmq_url, service_name=settings.service_name,
                             bindings=["coloc.#"], exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Vérifier le vert puis committer**

Run: `cd services/matching && python3 -m pytest tests/ -v` → PASS (15 tests).

```bash
git add services/matching
git commit -m "feat(matching): worker coloc.* — projections + invalidation ciblée du cache"
```

---

### Task C6: BFF — routes profil + endpoint composite `GET /listings` + mesh

**Files:**
- Modify: `gateway/app/config.py` (2 champs), `gateway/app/main.py` (routes + composite + `_merge_match_scores`), `gateway/tests/test_coloc_routes.py` (maj), `scripts/dev-mesh-up.sh`
- Test: `gateway/tests/test_composite_listings.py`

**Interfaces:**
- Consumes: coloc-profile (:8522), matching `/internal/scores` (:8523), search `/listings` (B3).
- Produces: `GET /api/v1/listings` composite (spécifique, déclaré AVANT le catch-all `proxy()` — l'ordre d'enregistrement Starlette fait foi) ; routes `/api/v1/me/profile`, `/api/v1/me/lifestyle`, `/api/v1/me/favorites*` → coloc-profile ; helper pur `_merge_match_scores(items: list[dict], scores: dict) -> None`.

- [ ] **Step 1: Tests (rouge)**

Dans `gateway/tests/test_coloc_routes.py` :
1. **Supprimer** `test_get_listings_routes_to_search` (le GET liste est désormais composite, il n'atteint plus `_resolve_upstream`).
2. Ajouter :

```python
def test_profile_routes_to_coloc_profile(monkeypatch):
    monkeypatch.setattr(m.settings, "coloc_profile_url", "http://p")
    fake = SimpleNamespace(state=SimpleNamespace(coloc_profile="PROFILE"))
    assert _resolve_upstream(fake, "/api/v1/me/profile", "GET") == ("PROFILE", "/me/profile")
    assert _resolve_upstream(fake, "/api/v1/me/lifestyle", "PUT") == ("PROFILE", "/me/lifestyle")
    assert _resolve_upstream(fake, "/api/v1/me/favorites", "POST") == ("PROFILE", "/me/favorites")
    assert _resolve_upstream(fake, "/api/v1/me/favorites/abc", "DELETE") == (
        "PROFILE", "/me/favorites/abc")
```

Nouveau `gateway/tests/test_composite_listings.py` :

```python
import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import _merge_match_scores, app


def test_merge_match_scores_pure():
    items = [{"listing_id": "a"}, {"listing_id": "b"}, {"listing_id": "c"}]
    _merge_match_scores(items, {"a": 87, "b": None})
    assert items[0]["match_pct"] == 87
    assert "match_pct" not in items[1]  # null → clé absente (le front masque)
    assert "match_pct" not in items[2]


def _mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://mock")


@pytest.fixture
def composite_env(monkeypatch):
    def search_handler(request):
        return httpx.Response(200, json={"total": 1, "items": [{"listing_id": "l1"}]})

    def matching_handler(request):
        assert request.headers.get("x-internal-token") == "tok"
        return httpx.Response(200, json={"scores": {"l1": 91}})

    monkeypatch.setattr(m.settings, "internal_token", "tok")
    with TestClient(app) as client:
        app.state.search = _mock_client(search_handler)
        app.state.matching = _mock_client(matching_handler)
        yield client


def test_composite_anonymous_no_scores(composite_env):
    resp = composite_env.get("/api/v1/listings", headers={"x-tenant": "m3a-l3achrane"})
    assert resp.status_code == 200
    assert "match_pct" not in resp.json()["items"][0]


def test_composite_authenticated_enriches(composite_env, monkeypatch):
    async def fake_ident(app_, auth):
        return {"user_id": 7, "tenant": "m3a-l3achrane"} if auth else None

    monkeypatch.setattr(m, "_resolve_identity", fake_ident)
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    resp = composite_env.get("/api/v1/listings", headers={"Authorization": "Bearer x"})
    assert resp.json()["items"][0]["match_pct"] == 91


def test_composite_degrades_when_matching_down(composite_env, monkeypatch):
    async def fake_ident(app_, auth):
        return {"user_id": 7, "tenant": "m3a-l3achrane"}

    def broken(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(m, "_resolve_identity", fake_ident)
    monkeypatch.setattr(m, "_resolve_tenant", lambda headers, host: "m3a-l3achrane")
    composite_env.app.state.matching = _mock_client(broken)
    resp = composite_env.get("/api/v1/listings", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200  # la recherche ne tombe JAMAIS à cause du score
    assert "match_pct" not in resp.json()["items"][0]
```

Run: `cd gateway && python3 -m pytest tests/ -v` → FAIL.

- [ ] **Step 2: config.py** — après `coloc_listing_url` :

```python
    coloc_profile_url: str | None = None
    matching_url: str | None = None
    # Jeton interne partagé (appels BFF → APIs internes des services, ex. matching).
    internal_token: str = ""
```

(Si un champ `internal_token` existe déjà dans GatewaySettings, ne pas le dupliquer.)

- [ ] **Step 3: main.py**

1. Dans `_resolve_upstream`, dans le bloc coloc ajouté au plan B : **supprimer** la règle `if settings.search_url and method == "GET" and path == "/api/v1/listings": ...` (remplacée par le composite) et ajouter après le bloc coloc-listing :

```python
    if settings.coloc_profile_url and (
        path in ("/api/v1/me/profile", "/api/v1/me/lifestyle", "/api/v1/me/favorites")
        or path.startswith("/api/v1/me/favorites/")
    ):
        return app.state.coloc_profile, path.replace("/api/v1", "", 1)
```

2. Lifespan : ajouter `app.state.coloc_profile = _client_or_none(settings.coloc_profile_url)` et `app.state.matching = _client_or_none(settings.matching_url)` ; les ajouter aussi à la liste de fermeture.

3. Helper + endpoint composite — à insérer **AVANT** la définition de `proxy()` (l'ordre d'enregistrement des routes fait foi) :

```python
def _merge_match_scores(items: list, scores: dict) -> None:
    """Injecte match_pct quand un score existe ; null/absent → clé absente (front masque)."""
    for item in items:
        score = scores.get(item.get("listing_id"))
        if score is not None:
            item["match_pct"] = score


@app.get("/api/v1/listings", include_in_schema=False)
async def coloc_listings_composite(request: Request) -> Response:
    """Unique endpoint composite du BFF : recherche coloc + scores de compatibilité.

    Anonyme → résultats sans score. Authentifié (tenant m3a-l3achrane) → enrichit
    chaque annonce d'un match_pct via l'API interne matching. matching indisponible
    → dégradation : résultats SANS score, jamais d'échec de la recherche (spec §8).
    """
    app_ = request.app
    if app_.state.search is None:
        return Response(content=b'{"error":"Not found"}', status_code=404,
                        media_type="application/json")
    tenant = _resolve_tenant(request.headers, request.headers.get("host", ""))
    ident = await _resolve_identity(app_, request.headers.get("authorization"))
    if ident and ident.get("tenant", "semsar") != tenant:
        return Response(content=b'{"error":"Tenant mismatch"}', status_code=403,
                        media_type="application/json")
    url = "/listings" + (f"?{request.url.query}" if request.url.query else "")
    upstream = await app_.state.search.request(
        "GET", url, headers={"x-semsar-tenant": tenant})
    if upstream.status_code != 200 or ident is None or app_.state.matching is None:
        return Response(content=upstream.content, status_code=upstream.status_code,
                        media_type="application/json")
    data = upstream.json()
    ids = [i.get("listing_id") for i in data.get("items", []) if i.get("listing_id")]
    scores: dict = {}
    if ids:
        try:
            r = await app_.state.matching.request(
                "POST", "/internal/scores",
                json={"user_id": ident["user_id"], "listing_ids": ids},
                headers={"x-internal-token": settings.internal_token})
            if r.status_code == 200:
                scores = r.json().get("scores", {})
        except Exception:  # noqa: BLE001 — dégradation sans score
            scores = {}
    _merge_match_scores(data.get("items", []), scores)
    return JSONResponse(data)
```

(Import à compléter en tête de fichier si absent : `from fastapi.responses import JSONResponse`.)

- [ ] **Step 4: dev-mesh-up.sh**

1. `SVCS` : ajouter `coloc-profile:8522 matching:8523` après `coloc-listing:8521`.
2. Relais (`for r in …`) : ajouter `coloc-profile` (émet profile_updated). matching n'émet rien — pas de relay.
3. Workers (`for w in …`) : ajouter `coloc-profile matching`.
4. Santé : ajouter `coloc-profile:8522 matching:8523`.
5. Env BFF : ajouter `COLOC_PROFILE_URL=http://localhost:8522 MATCHING_URL=http://localhost:8523` (INTERNAL_TOKEN déjà présent).

- [ ] **Step 5: Vérifier le vert puis committer**

Run: `cd gateway && python3 -m pytest tests/ -v` → PASS ; `bash -n scripts/dev-mesh-up.sh` → OK.

```bash
git add gateway scripts/dev-mesh-up.sh
git commit -m "feat(gateway): routes profil + endpoint composite GET /listings avec match_pct (dégradation sans score)"
```

---

### Task C7: Front — connexion, profil réel, labels lifestyle

**Files:**
- Create: `frontend-m3a-l3achrane/src/surfaces/web/Connexion.jsx`
- Modify: `frontend-m3a-l3achrane/src/App.jsx` (route `/connexion`), `src/surfaces/app/AppLayout.jsx` (garde auth), `src/services/index.js` (profil live), `src/services/mappers.js` (+`mapProfile`, labels lifestyle), `src/services/mappers.test.mjs` (+tests)
- Test: `src/services/mappers.test.mjs`

**Interfaces:**
- Consumes: `GET /me/profile` (contrat C2) via BFF ; `POST /auth/login`/`/auth/register` (identity, plan A) ; format localStorage `auth-storage` = `{"state": {"accessToken": "...", "refreshToken": "..."}}` (déjà lu par `api.js`).
- Produces: `mapProfile(p) -> {prenom, avatar, verifiee, lifestyle: [labels FR], recherche: {ville, budgetMad, dispo}}` ; `LIFESTYLE_LABELS` réutilisé par `buildChips` (les règles canoniques s'affichent en français) ; page `/connexion` ; `/espace` redirige vers `/connexion` sans jeton.

- [ ] **Step 1: Tests mappers (rouge)**

Ajouter à `frontend-m3a-l3achrane/src/services/mappers.test.mjs` :

```js
import { mapProfile } from './mappers.js'

test('mapProfile traduit le profil backend en clés françaises', () => {
  const p = mapProfile({
    user_id: 7, display_name: 'Sara', is_verified: true, gender: 'FEMME',
    city: 'Casablanca', bio: null, budget_min: 1000, budget_max: 2500,
    move_in_date: '2026-09-01',
    lifestyle: [
      { question_code: 'tabac', value: 'non_fumeur', importance: 'DECISIF' },
      { question_code: 'coucher', value: 'tot', importance: 'PREFERENCE' },
    ],
  })
  assert.equal(p.prenom, 'Sara')
  assert.equal(p.verifiee, true)
  assert.deepEqual(p.lifestyle, ['Non-fumeur', 'Couche-tôt'])
  assert.deepEqual(p.recherche, { ville: 'Casablanca', budgetMad: 2500, dispo: '01/09/2026' })
})

test('mapProfile tolère le profil vide', () => {
  const p = mapProfile({ user_id: 7, display_name: null, is_verified: false,
                         gender: null, city: null, budget_min: null, budget_max: null,
                         move_in_date: null, lifestyle: [] })
  assert.equal(p.prenom, '')
  assert.deepEqual(p.lifestyle, [])
  assert.deepEqual(p.recherche, { ville: '', budgetMad: null, dispo: '' })
})

test('buildChips affiche les règles canoniques en français', () => {
  const l = mapListingHit({ ...HIT, rules: ['non_fumeur'], amenities: [] })
  assert.ok(l.chips.includes('Non-fumeur'))
})
```

Run: `npm test` → FAIL.

- [ ] **Step 2: mappers.js — labels + mapProfile**

Dans `frontend-m3a-l3achrane/src/services/mappers.js` :
1. Ajouter après `AMENITY_LABELS` :

```js
// Valeurs canoniques du référentiel lifestyle (semsar_common.coloc_referential) → libellés FR.
const LIFESTYLE_LABELS = {
  non_fumeur: 'Non-fumeur', fumeur: 'Fumeur accepté',
  acceptes: 'Animaux acceptés', refuses: 'Sans animaux',
  souvent: 'Invités bienvenus', rarement: 'Invités occasionnels',
  tot: 'Couche-tôt', tard: 'Couche-tard',
  frequent: 'Ménage fréquent', souple: 'Ménage souple',
}

const lifestyleLabel = (value) => LIFESTYLE_LABELS[value] ?? value.replaceAll('_', ' ')
```

2. Dans `buildChips`, remplacer `const chips = [...(source.rules ?? [])]` par :

```js
  const chips = (source.rules ?? []).map(lifestyleLabel)
```

3. Ajouter en fin de fichier :

```js
export function mapProfile(p) {
  return {
    prenom: p.display_name ?? '',
    avatar: null,
    verifiee: Boolean(p.is_verified),
    lifestyle: (p.lifestyle ?? []).map((a) => lifestyleLabel(a.value)),
    recherche: {
      ville: p.city ?? '',
      budgetMad: p.budget_max != null ? Math.round(p.budget_max) : null,
      dispo: p.move_in_date ? new Date(p.move_in_date).toLocaleDateString('fr-FR') : '',
    },
  }
}
```

Run: `npm test` → PASS.

- [ ] **Step 3: Façade — profil live**

Dans `frontend-m3a-l3achrane/src/services/index.js` :
1. `MOCK_DOMAINS` défaut : remplacer `'profile,partners,messages'` par `'partners,messages'`.
2. `getCurrentProfile` :

```js
import { mapListingDetail, mapListingHit, mapProfile, mapSearchFilters } from './mappers.js'

export async function getCurrentProfile() {
  if (isMocked('profile')) { /* … chemin mock existant inchangé … */ }
  const { data } = await api.get('/me/profile')
  return mapProfile(data)
}
```

- [ ] **Step 4: Page /connexion (formulaire : étoile rouge sur les champs requis, jamais de « (optionnel) »)**

`frontend-m3a-l3achrane/src/surfaces/web/Connexion.jsx` :

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '@/services/api.js'
import { Button, Card, Input } from '@/ds'

// Règle canonique des formulaires : champ requis ⇒ étoile rouge après le label.
const requiredStar = <span style={{ color: 'var(--color-danger, #d33)' }} aria-hidden> *</span>

function persistSession(data) {
  localStorage.setItem('auth-storage', JSON.stringify({
    state: { accessToken: data.access_token, refreshToken: data.refresh_token },
  }))
}

export default function Connexion() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | register
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register'
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : form
      const { data } = await api.post(path, payload)
      persistSession(data)
      navigate('/espace')
    } catch (err) {
      setError(err.response?.data?.error ?? 'Connexion impossible — réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>
          {mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </h1>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>Prénom{requiredStar}
                <Input value={form.first_name} onChange={set('first_name')} required />
              </label>
              <label>Nom{requiredStar}
                <Input value={form.last_name} onChange={set('last_name')} required />
              </label>
            </>
          )}
          <label>Email{requiredStar}
            <Input type="email" value={form.email} onChange={set('email')} required />
          </label>
          <label>Mot de passe{requiredStar}
            <Input type="password" value={form.password} onChange={set('password')} required />
          </label>
          {error && <p role="alert" style={{ color: 'var(--color-danger, #d33)' }}>{error}</p>}
          <Button type="submit" disabled={busy}>
            {mode === 'login' ? 'Se connecter' : "S'inscrire"}
          </Button>
        </form>
        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                         marginTop: 12, textDecoration: 'underline' }}>
          {mode === 'login' ? 'Pas encore de compte ? Créer un compte'
                            : 'Déjà un compte ? Se connecter'}
        </button>
      </Card>
    </div>
  )
}
```

(Adapter les imports `@/ds` aux exports réels du design system — `Button`, `Card`, `Input` existent dans `src/ds/index.js` ; si `label` imbriqué casse le style des Input, empiler label + Input avec un `div` par champ, en gardant l'étoile.)

- [ ] **Step 5: Route + garde auth**

1. `src/App.jsx` : ajouter la route lazy `/connexion` sous `WebLayout` (même patron que `/recherche`) :

```jsx
const Connexion = lazy(() => import('./surfaces/web/Connexion.jsx'))
// … dans les enfants de WebLayout :
<Route path="connexion" element={<Connexion />} />
```

2. `src/surfaces/app/AppLayout.jsx` : au montage, rediriger si aucun jeton :

```jsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
// … dans le composant :
  const navigate = useNavigate()
  useEffect(() => {
    let token = null
    try {
      token = JSON.parse(localStorage.getItem('auth-storage'))?.state?.accessToken ?? null
    } catch { /* stockage corrompu = non connecté */ }
    if (!token) navigate('/connexion', { replace: true })
  }, [navigate])
```

- [ ] **Step 6: Validation manuelle + gate front**

```bash
make m3a-l3achrane-lint && (cd frontend-m3a-l3achrane && npm test) && make m3a-l3achrane-build
```

Puis contre le mesh (relancé en C8 si besoin) : `/espace` sans jeton → redirection `/connexion` ; inscription → Dashboard avec « Bonjour <prénom> » réel ; `/recherche` connecté → scores affichés sur les annonces compatibles.

- [ ] **Step 7: Commit**

```bash
git add frontend-m3a-l3achrane
git commit -m "feat(m3a-l3achrane): page connexion + profil réel (mapProfile, labels lifestyle) + garde auth /espace"
```

---

### Task C8: Seed/smoke bout-en-bout + gate + CI

**Files:**
- Create: `tools/profile_matching_smoke.py`
- Modify: `.github/workflows/ci.yml` (matrice + `services/coloc-profile`, `services/matching`)

**Interfaces:**
- Consumes: mesh complet C1-C7 (schémas `coloc_profile` et `matching` appliqués, mesh relancé, seed B recodé).
- Produces: preuve rejouable du parcours profil → scores → invalidation ; CI verte.

- [ ] **Step 1: Appliquer les schémas + relancer + reseeder l'index**

```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -f services/coloc-profile/db/schema.sql
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -f services/matching/db/schema.sql
pip install -e "services/coloc-profile[test]" -e "services/matching[test]"
bash scripts/dev-mesh-up.sh
```

**⚠️ Ordre critique — reseeder APRÈS le lancement du worker matching.** Les événements
`coloc.listing_published` relayés avant le premier démarrage du worker matching sont
perdus (la file `matching.events` n'existait pas encore) : `listing_criteria` resterait
vide et aucun score ne sortirait. Donc, une fois le mesh relancé (worker matching actif),
purger et reseeder pour ré-émettre les événements :

```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -c \
  "TRUNCATE coloc_listing.house_rules, coloc_listing.listing_media, coloc_listing.current_roommates, coloc_listing.listings, coloc_listing.properties, coloc_listing.outbox CASCADE;"
curl -s -XDELETE "http://localhost:9200/coloc_listings" >/dev/null
env SERVICE_NAME=coloc-listing PYTHONPATH=services/coloc-listing \
  DATABASE_URL="postgresql+psycopg://coloc_listing:coloc_listing@localhost:5432/semsar_dev" \
  python3 -m app.seed_demo
sleep 8   # relay → worker search (index) + worker matching (listing_criteria)
curl -s "http://localhost:8099/api/v1/listings?city=Casablanca" -H "x-tenant: m3a-l3achrane" | head -c 120
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -c \
  "SELECT count(*) FROM matching.listing_criteria;"
```

Expected: `total: 3` côté recherche et `count = 8` côté projections matching.

- [ ] **Step 2: Smoke**

`tools/profile_matching_smoke.py` :

```python
#!/usr/bin/env python3
"""Smoke profil & matching : inscription → profil → lifestyle → scores → invalidation.

Usage : python3 tools/profile_matching_smoke.py --bff http://localhost:8099
Prérequis : mesh complet (plans A/B/C), annonces de démo seedées (codes canoniques).
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
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'OK ' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
        if not cond:
            failures.append(name)

    def get_scores(auth):
        for _ in range(20):
            r = requests.get(f"{base}/listings", params={"city": "Casablanca"},
                             headers=auth, timeout=10)
            items = r.json().get("items", [])
            if any("match_pct" in i for i in items):
                return items
            time.sleep(1)
        return items

    email = f"smoke-match-{int(time.time())}@test.ma"
    reg = requests.post(f"{base}/auth/register", headers=M3A, timeout=10,
                        json={"email": email, "password": "smoke-pass-123",
                              "first_name": "Nadia", "last_name": "Smoke"})
    check("register → 201", reg.status_code == 201, reg.text[:200])
    auth = {"Authorization": f"Bearer {reg.json().get('access_token', '')}", **M3A}

    # Profil créé par le worker user.* (attendre) puis GET
    profile = None
    for _ in range(15):
        r = requests.get(f"{base}/me/profile", headers=auth, timeout=10)
        if r.status_code == 200:
            profile = r.json()
            break
        time.sleep(1)
    check("GET /me/profile → 200", profile is not None)
    check("display_name synchronisé par le worker", (profile or {}).get("display_name") == "Nadia")

    # Profil scorable + lifestyle
    r = requests.put(f"{base}/me/profile", headers=auth, timeout=10,
                     json={"gender": "FEMME", "city": "Casablanca",
                           "budget_min": "1000.00", "budget_max": "2500.00"})
    check("PUT /me/profile → 200", r.status_code == 200, r.text[:200])
    r = requests.put(f"{base}/me/lifestyle", headers=auth, timeout=10,
                     json={"answers": [{"question_code": "tabac", "value": "non_fumeur",
                                        "importance": "DECISIF"}]})
    check("PUT /me/lifestyle → 200", r.status_code == 200, r.text[:200])

    # Scores réels sur la recherche authentifiée (Casablanca FEMININ ≤ 2500 → match)
    items = get_scores(auth)
    scored = [i for i in items if "match_pct" in i]
    check("au moins une annonce avec match_pct", len(scored) >= 1)
    check("scores entiers 1-100", all(isinstance(i["match_pct"], int)
                                      and 0 < i["match_pct"] <= 100 for i in scored))
    # L'anonyme ne voit aucun score
    r = requests.get(f"{base}/listings", params={"city": "Casablanca"}, headers=M3A, timeout=10)
    check("anonyme sans match_pct", all("match_pct" not in i for i in r.json().get("items", [])))

    # Favoris
    lid = items[0]["listing_id"]
    check("POST favori → 204", requests.post(f"{base}/me/favorites", json={"listing_id": lid},
                                             headers=auth, timeout=10).status_code == 204)
    favs = requests.get(f"{base}/me/favorites", headers=auth, timeout=10).json()
    check("favori listé", any(f["listing_id"] == lid for f in favs))
    check("DELETE favori → 204", requests.delete(f"{base}/me/favorites/{lid}",
                                                 headers=auth, timeout=10).status_code == 204)

    # Invalidation : déménager à Rabat → les scores Casablanca disparaissent (hard-fail ville)
    requests.put(f"{base}/me/profile", json={"city": "Rabat"}, headers=auth, timeout=10)
    gone = False
    for _ in range(20):
        r = requests.get(f"{base}/listings", params={"city": "Casablanca"},
                         headers=auth, timeout=10)
        if all("match_pct" not in i for i in r.json().get("items", [])):
            gone = True
            break
        time.sleep(1)
    check("invalidation après changement de ville", gone)

    print("\n" + ("SMOKE PROFIL/MATCHING : OK" if not failures
                  else f"SMOKE PROFIL/MATCHING : {len(failures)} échec(s)"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
```

Run: `python3 tools/profile_matching_smoke.py` → 12 checks OK.

- [ ] **Step 3: CI + gate global**

1. `.github/workflows/ci.yml`, matrice `dir:` : ajouter `- services/coloc-profile` (après coloc-listing) et `- services/matching` (après marketplace, ordre alphabétique).
2. Gate : suites `coloc-listing`, `coloc-profile`, `matching`, `search`, `gateway`, `identity` vertes ; `tenant_smoke`, `coloc_smoke`, `profile_matching_smoke` OK ; front lint/test/build verts.

- [ ] **Step 4: Commit + push + PR**

```bash
git add tools/profile_matching_smoke.py .github/workflows/ci.yml
git commit -m "test(coloc): smoke profil/matching bout-en-bout + services C dans la matrice CI"
git push
```

Vérifier la CI (23 jobs) puis revue finale de branche (subagent) avant PR.

## Hors périmètre (plans suivants, explicites)

- Étage vectoriel du matching (pgvector/embeddings, ≤15 %) et poids par POI/trajet/âge — absents aussi du code initial.
- Contraintes dures « date d'entrée, vérification exigée, blocages, sanctions » (spec initiale §8.2) — arrivent avec leurs domaines (E/F).
- UI du questionnaire lifestyle (PUT /me/lifestyle est servi mais le front n'a pas encore d'écran d'édition — itération front dédiée).
- Tables `saved_searches`, `blocks`, `profile_interests` (blocks → plan F).
- `GET /me/matches` public (liste des recommandations triées) — le Dashboard actuel se contente de l'enrichissement de la recherche.
- Affichage des explications de score (le backend les persiste, le front ne les montre pas encore).
