# Score de confiance réel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le badge « Vérifié » tautologique (`is_verified` jamais vérifié) par un vrai palier de confiance (`none|verified|verified_experience`) calculé depuis KYC + transactions conclues + fraude confirmée + suspension, affiché sur les deux frontends.

**Architecture:** Nouvelle table `trust_level` dans le service `trust-safety` (déjà propriétaire de la modération), alimentée par un nouveau consumer RabbitMQ (`app/worker.py`) écoutant `identity.kyc.verified`, `commission.settled`, `sale.compromis.signed`, `rental.lease.signed`. Downgrade immédiat câblé directement dans les endpoints existants de suspension/résolution de signalement (pas d'événement supplémentaire nécessaire). Lecture via un endpoint public `GET /trust/{entity_type}/{entity_id}` (proxy BFF direct) et un endpoint interne batché `GET /internal/trust/batch` (consommé par `agency` pour éviter le N+1 sur les listes).

**Tech Stack:** FastAPI, SQLAlchemy, `semsar_events` (EventConsumer/enqueue), RabbitMQ topic exchange `semsar.events`, React + react-i18next (les deux frontends).

**Spec:** `docs/superpowers/specs/2026-08-30-score-confiance-design.md`

## Global Constraints

- Paliers binaires par critère (`none|verified|verified_experience`), pas de score pondéré 0-100.
- Suspension et fraude confirmée forcent `level=none` immédiatement, sans lissage.
- KYC est porté par `user_id` ; la résolution agence passe par `Agency.owner_id`.
- `entity_type` ∈ `{"user","agency"}` — même vocabulaire que `ModerationStatus` existant.
- i18n FR + AR obligatoire pour tout nouveau libellé (tests `noHardcodedText`), devise/format inchangés.
- Pas d'attribution IA dans les commits ; Conventional Commits.
- Validation licence/RC/ICE et score par annonce : **hors périmètre** (itération 2).

---

### Task 1: `trust-safety` — modèle `TrustLevel` + calcul + downgrade suspension/fraude

**Files:**
- Modify: `services/trust-safety/app/models.py`
- Modify: `services/trust-safety/app/main.py`
- Create: `services/trust-safety/tests/test_trust_level.py`

**Interfaces:**
- Produces: `TrustLevel(entity_type: str, entity_id: int, level: str, deal_count: int, updated_at)` ORM model, PK composite `(entity_type, entity_id)`.
- Produces: `upsert_trust_level(db, entity_type, entity_id, *, min_level=None, force_level=None, increment_deals=False) -> TrustLevel` — helper used by this task, the worker (Task 2) and the resolve-report/suspend paths.
  - `min_level` : ne fait monter le palier que si le palier cible est "supérieur" (`none < verified < verified_experience`), ne redescend jamais.
  - `force_level` : impose le palier (utilisé par suspension/fraude → `"none"`), prioritaire sur `min_level`.
  - `increment_deals=True` : `deal_count += 1` ; si le palier courant est déjà `verified`, il devient `verified_experience`.
- Consumes: rien (base de la feature).

- [ ] **Step 1: Write the failing test**

```python
# services/trust-safety/tests/test_trust_level.py
from app.models import TrustLevel
from app.main import upsert_trust_level


def test_upsert_creates_verified(db_session):
    row = upsert_trust_level(db_session, "user", 42, min_level="verified")
    db_session.commit()
    assert row.level == "verified"
    assert row.deal_count == 0


def test_upsert_never_downgrades_via_min_level(db_session):
    upsert_trust_level(db_session, "user", 42, min_level="verified")
    upsert_trust_level(db_session, "user", 42, increment_deals=True)
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "user", "entity_id": 42})
    assert row.level == "verified_experience"
    assert row.deal_count == 1
    # un increment_deals sans min_level ne doit jamais redescendre en dessous de verified_experience
    upsert_trust_level(db_session, "user", 42, min_level="verified")
    db_session.commit()
    assert row.level == "verified_experience"


def test_force_level_downgrades_immediately(db_session):
    upsert_trust_level(db_session, "agency", 7, min_level="verified")
    upsert_trust_level(db_session, "agency", 7, force_level="none")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 7})
    assert row.level == "none"


def test_read_endpoint_defaults_to_none(client):
    resp = client.get("/trust/agency/999")
    assert resp.status_code == 200
    assert resp.json() == {"level": "none", "deal_count": 0}


def test_batch_endpoint_requires_internal_token(client):
    resp = client.get("/internal/trust/batch?entity_type=agency&ids=1,2")
    assert resp.status_code == 403


def test_batch_endpoint_returns_map(client, internal_headers, db_session):
    upsert_trust_level(db_session, "agency", 1, min_level="verified")
    db_session.commit()
    resp = client.get("/internal/trust/batch?entity_type=agency&ids=1,2", headers=internal_headers)
    assert resp.status_code == 200
    body = resp.json()["items"]
    assert body["1"] == {"level": "verified", "deal_count": 0}
    assert body["2"] == {"level": "none", "deal_count": 0}


def test_suspend_forces_level_none(client, superadmin_headers, db_session, monkeypatch):
    upsert_trust_level(db_session, "agency", 7, min_level="verified")
    db_session.commit()
    # httpx.post vers AGENCY_URL est mocké pour renvoyer 200 (patron déjà utilisé par
    # test_moderation.py existant du service — réutiliser le même fixture/mock).
    import httpx as _httpx
    monkeypatch.setattr(_httpx, "post", lambda *a, **k: _FakeResp(200, {"agency": {"id": 7}}))
    client.post("/admin/accounts/agencies/7/suspend", headers=superadmin_headers)
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 7})
    assert row.level == "none"


def test_resolve_fraud_report_forces_level_none(client, superadmin_headers, db_session):
    from app.models import Report
    upsert_trust_level(db_session, "agency", 3, min_level="verified")
    report = Report(tenant="semsarout", reporter_id=1, target_type="agency",
                     target_id="3", reason="fraud", status="open")
    db_session.add(report)
    db_session.commit()
    client.post(f"/admin/reports/{report.id}/resolve", headers=superadmin_headers)
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 3})
    assert row.level == "none"
```

Réutiliser les fixtures existantes (`db_session`, `client`, `internal_headers`,
`superadmin_headers`, `_FakeResp`) de `services/trust-safety/tests/conftest.py` /
`test_moderation.py` — ne pas les redéfinir si elles existent déjà sous un autre
nom : lire `services/trust-safety/tests/conftest.py` et `test_moderation.py`
avant d'écrire ce test pour matcher les noms exacts.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/trust-safety && python3 -m pytest tests/test_trust_level.py -v`
Expected: FAIL (ImportError — `TrustLevel`/`upsert_trust_level` n'existent pas encore, endpoints 404).

- [ ] **Step 3: Add `TrustLevel` model**

In `services/trust-safety/app/models.py`, add:

```python
LEVEL_ORDER = {"none": 0, "verified": 1, "verified_experience": 2}


class TrustLevel(Base):
    __tablename__ = "trust_level"

    entity_type = Column(String(10), primary_key=True)  # user | agency
    entity_id = Column(BigInteger, primary_key=True)
    level = Column(String(20), nullable=False, default="none", server_default="none")
    deal_count = Column(Integer, nullable=False, default=0, server_default="0")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {"level": self.level, "deal_count": self.deal_count}


class ProcessedMessage(Base):
    __tablename__ = "processed_message"

    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 4: Add `upsert_trust_level` + endpoints in `main.py`**

Add import `from .models import LEVEL_ORDER, TrustLevel` (garder les imports
existants `REPORT_STATUSES, AdminAction, ModerationStatus, Report`).

```python
def upsert_trust_level(db: Session, entity_type: str, entity_id: int, *,
                       min_level: str | None = None, force_level: str | None = None,
                       increment_deals: bool = False) -> TrustLevel:
    row = db.get(TrustLevel, {"entity_type": entity_type, "entity_id": entity_id})
    if row is None:
        row = TrustLevel(entity_type=entity_type, entity_id=entity_id, level="none", deal_count=0)
        db.add(row)
        db.flush()
    if increment_deals:
        row.deal_count += 1
        if row.level == "verified":
            row.level = "verified_experience"
    if min_level is not None and LEVEL_ORDER[min_level] > LEVEL_ORDER[row.level]:
        row.level = min_level
    if force_level is not None:
        row.level = force_level
    return row


@app.get("/trust/{entity_type}/{entity_id}")
def get_trust(entity_type: str, entity_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.get(TrustLevel, {"entity_type": entity_type, "entity_id": entity_id})
    return row.to_dict() if row is not None else {"level": "none", "deal_count": 0}


@app.get("/internal/trust/batch", include_in_schema=False)
def internal_trust_batch(entity_type: str, ids: str, x_internal_token: str = Header(default=""),
                         db: Session = Depends(get_db)) -> dict:
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
    rows = db.query(TrustLevel).filter(
        TrustLevel.entity_type == entity_type, TrustLevel.entity_id.in_(id_list)).all()
    by_id = {r.entity_id: r.to_dict() for r in rows}
    return {"items": {str(i): by_id.get(i, {"level": "none", "deal_count": 0}) for i in id_list}}
```

Wire the downgrade in `_moderate` (after `_apply_moderation(...)` call, still inside
`if 200 <= resp.status_code < 300:` block):

```python
        if hidden:
            upsert_trust_level(db, entity_type, entity_id, force_level="none")
```

Wire fraud downgrade in `resolve_report` (before `db.commit()`, after
`enqueue(...)`):

```python
    if report.reason == "fraud" and report.target_type in ("agency", "profile", "user"):
        entity_type = "agency" if report.target_type == "agency" else "user"
        if report.target_id.isdigit():
            upsert_trust_level(db, entity_type, int(report.target_id), force_level="none")
```

Also add `"agency"` to `TARGET_TYPES` in `services/trust-safety/app/models.py`
(currently `{"listing", "profile", "message"}` → `{"listing", "profile", "message", "agency"}`)
so `ReportCreateIn` accepts a report targeting an agency directly.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd services/trust-safety && python3 -m pytest tests/test_trust_level.py -v`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Run the full service test suite (no regression)**

Run: `cd services/trust-safety && python3 -m pytest tests/ -v`
Expected: PASS (existing `test_moderation.py`, `test_reports.py` unaffected).

- [ ] **Step 7: Commit**

```bash
git add services/trust-safety/app/models.py services/trust-safety/app/main.py services/trust-safety/tests/test_trust_level.py
git commit -m "feat(trust-safety): score de confiance réel (trust_level) + downgrade suspension/fraude"
```

---

### Task 2: `trust-safety` — worker événementiel (KYC + transactions conclues)

**Files:**
- Create: `services/trust-safety/app/worker.py`
- Create: `services/trust-safety/tests/test_worker.py`

**Interfaces:**
- Consumes: `upsert_trust_level` (Task 1), `ProcessedMessage` model (Task 1), `SessionLocal` from `services/trust-safety/app/db.py`.
- Produces: `_handle(routing_key: str, payload: dict, message_id: str) -> None` — même signature que `services/coloc-profile/app/worker.py::_handle`, appelée par `EventConsumer.run`.

- [ ] **Step 1: Write the failing test**

```python
# services/trust-safety/tests/test_worker.py
from app.worker import _handle_with_session
from app.models import ProcessedMessage, TrustLevel


def test_kyc_verified_upserts_user(db_session):
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 5}, "mid-1")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "user", "entity_id": 5})
    assert row.level == "verified"
    assert db_session.get(ProcessedMessage, "mid-1") is not None


def test_kyc_verified_is_idempotent(db_session):
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 5}, "mid-2")
    db_session.commit()
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 5}, "mid-2")
    db_session.commit()  # ne doit pas planter (re-upsert no-op, message déjà traité)


def test_kyc_verified_propagates_to_owned_agencies(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "_owned_agency_ids", lambda user_id: [11, 12] if user_id == 5 else [])
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 5}, "mid-owner-1")
    db_session.commit()
    assert db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 11}).level == "verified"
    assert db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 12}).level == "verified"


def test_deal_concluded_increments_agency(db_session):
    _handle_with_session(db_session, "commission.settled", {"agency_id": 9}, "mid-3")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 9})
    assert row.level == "none"  # pas de KYC → pas de badge malgré le deal
    assert row.deal_count == 1


def test_deal_concluded_promotes_to_experience_when_already_verified(db_session):
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 1}, "mid-4")
    db_session.commit()
    _handle_with_session(db_session, "commission.settled", {"agency_id": 1}, "mid-5")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 1})
    assert row.level == "verified_experience"
    assert row.deal_count == 1


def test_lease_signed_falls_back_to_user_for_particulier(db_session):
    _handle_with_session(db_session, "rental.lease.signed", {"account_id": 77}, "mid-6")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "user", "entity_id": 77})
    assert row.deal_count == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/trust-safety && python3 -m pytest tests/test_worker.py -v`
Expected: FAIL (`ModuleNotFoundError: app.worker`).

- [ ] **Step 3: Write `app/worker.py`**

```python
"""Consumer trust-safety — calcule trust_level depuis KYC + transactions conclues.
Propage le KYC d'un utilisateur aux agences qu'il possède (`Agency.owner_id`),
via l'endpoint interne `GET /internal/agencies?owner_id=` du service `agency`.

    python -m app.worker
"""
import os

import httpx

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal
from .main import upsert_trust_level
from .models import ProcessedMessage

_DEAL_EVENTS = {"commission.settled", "sale.compromis.signed", "rental.lease.signed"}
AGENCY_URL = os.environ.get("AGENCY_URL", "http://localhost:8512")


def _owned_agency_ids(user_id: int) -> list[int]:
    try:
        resp = httpx.get(
            f"{AGENCY_URL}/internal/agencies", params={"owner_id": user_id},
            headers={"x-internal-token": get_settings().internal_token}, timeout=5.0,
        )
        if resp.status_code != 200:
            return []
        return [a["id"] for a in resp.json().get("agencies", [])]
    except httpx.HTTPError:
        return []


def _deal_entity(payload: dict) -> tuple[str, int] | None:
    if payload.get("agency_id"):
        return "agency", int(payload["agency_id"])
    for key in ("account_id", "owner_id"):
        if payload.get(key):
            return "user", int(payload[key])
    return None


def _handle_with_session(db, routing_key: str, payload: dict, message_id: str) -> None:
    if message_id and db.get(ProcessedMessage, message_id) is not None:
        return
    if routing_key == "identity.kyc.verified" and payload.get("user_id") is not None:
        user_id = int(payload["user_id"])
        upsert_trust_level(db, "user", user_id, min_level="verified")
        for agency_id in _owned_agency_ids(user_id):
            upsert_trust_level(db, "agency", agency_id, min_level="verified")
    elif routing_key in _DEAL_EVENTS:
        target = _deal_entity(payload)
        if target is not None:
            upsert_trust_level(db, target[0], target[1], increment_deals=True)
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
    consumer = EventConsumer(
        settings.rabbitmq_url, service_name=settings.service_name,
        bindings=["identity.kyc.verified", "commission.settled",
                 "sale.compromis.signed", "rental.lease.signed"],
        exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/trust-safety && python3 -m pytest tests/test_worker.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add services/trust-safety/app/worker.py services/trust-safety/tests/test_worker.py
git commit -m "feat(trust-safety): worker événementiel KYC + transactions conclues"
```

---

### Task 3: `agency` — résolution owner→agences + client trust batché + `to_dict` enrichi

**Files:**
- Modify: `services/agency/app/main.py`
- Create: `services/agency/app/trust_client.py`
- Modify: `services/agency/app/models.py`
- Create/Modify: `services/agency/tests/test_trust.py`

**Interfaces:**
- Produces: `trust_client.batch(agency_ids: list[int]) -> dict[int, dict]` (clés = id agence, valeurs `{"level": str, "deal_count": int}`, défaut `{"level":"none","deal_count":0}` si le service est indisponible).
- Modify: `Agency.to_dict(self, properties_count=0, trust=None)` — `trust` optionnel, défaut `{"level":"none","deal_count":0}` si `None`, fusionné dans le dict retourné sous les clés `trust_level`/`deal_count`.
- Consumes: `GET /internal/trust/batch` (Task 1, service trust-safety), `TRUST_SAFETY_URL` (nouvelle env var, patron `LISTING_URL` dans `listing_client.py`).

- [ ] **Step 1: Write the failing test**

```python
# services/agency/tests/test_trust.py
from app.trust_client import batch


def test_batch_returns_defaults_on_error(monkeypatch):
    import httpx

    def _raise(*a, **k):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(httpx, "get", _raise)
    result = batch([1, 2])
    assert result == {1: {"level": "none", "deal_count": 0}, 2: {"level": "none", "deal_count": 0}}


def test_batch_parses_response(monkeypatch):
    import httpx

    class _Resp:
        status_code = 200
        def json(self):
            return {"items": {"1": {"level": "verified", "deal_count": 3}, "2": {"level": "none", "deal_count": 0}}}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp())
    result = batch([1, 2])
    assert result[1] == {"level": "verified", "deal_count": 3}


def test_get_agency_includes_trust(client, db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "trust_client", type("T", (), {"batch": staticmethod(lambda ids: {i: {"level": "verified", "deal_count": 2} for i in ids})}))
    from app.models import Agency
    a = Agency(name="Test", slug="test-agency", email="a@example.com", is_verified=True)
    db_session.add(a)
    db_session.commit()
    resp = client.get(f"/agencies/{a.slug}")
    body = resp.json()["agency"]
    assert body["trust_level"] == "verified"
    assert body["deal_count"] == 2
```

Vérifier les noms exacts de fixtures (`client`, `db_session`) dans
`services/agency/tests/conftest.py` avant d'écrire ce fichier.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/agency && python3 -m pytest tests/test_trust.py -v`
Expected: FAIL (`ModuleNotFoundError: app.trust_client`).

- [ ] **Step 3: Write `app/trust_client.py`**

```python
"""Score de confiance des agences via l'endpoint interne batché de trust-safety."""
import os

import httpx

from semsar_common import get_settings

TRUST_SAFETY_URL = os.environ.get("TRUST_SAFETY_URL", "http://localhost:8511")
_DEFAULT = {"level": "none", "deal_count": 0}


def batch(agency_ids: list[int]) -> dict[int, dict]:
    if not agency_ids:
        return {}
    defaults = {i: dict(_DEFAULT) for i in agency_ids}
    try:
        resp = httpx.get(
            f"{TRUST_SAFETY_URL}/internal/trust/batch",
            params={"entity_type": "agency", "ids": ",".join(str(i) for i in agency_ids)},
            headers={"x-internal-token": get_settings().internal_token},
            timeout=5.0,
        )
        if resp.status_code != 200:
            return defaults
        items = resp.json().get("items", {})
        return {i: items.get(str(i), dict(_DEFAULT)) for i in agency_ids}
    except httpx.HTTPError:
        return defaults
```

- [ ] **Step 4: Extend `Agency.to_dict` in `app/models.py`**

Add `trust` param, defaulting to `None`, and two keys to the returned dict
(insert right after the `is_verified` line — see current model at
`services/agency/app/models.py:45-53`):

```python
    def to_dict(self, properties_count: int = 0, trust: dict | None = None) -> dict:
        trust = trust or {"level": "none", "deal_count": 0}
        return {
            "id": self.id, "name": self.name, "slug": self.slug,
            "description": self.description, "email": self.email, "phone": self.phone,
            "website": self.website, "address": self.address, "city": self.city,
            "postal_code": self.postal_code, "logo_url": self.logo_url,
            "cover_image_url": self.cover_image_url, "is_verified": self.is_verified,
            "trust_level": trust["level"], "deal_count": trust["deal_count"],
            "properties_count": properties_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            # ... (garder le reste des champs existants inchangé)
        }
```

- [ ] **Step 5: Wire into `main.py` (`list_agencies`, `get_agency`, `my_agency`) + owner filter**

Add `from . import trust_client` to imports. In `list_agencies`, after
`counts = _counts(db, [a.id for a in items])`, add
`trust = trust_client.batch([a.id for a in items])` and change the return line to
`a.to_dict(properties_count=counts.get(a.id, 0), trust=trust.get(a.id))`.
Same pattern (single-id batch call) in `get_agency` and `my_agency`.

Add `owner_id` filter to the existing `internal_agencies` endpoint
(`services/agency/app/main.py:214-221`):

```python
@app.get("/internal/agencies", include_in_schema=False)
def internal_agencies(request: Request, owner_id: int | None = None, db: Session = Depends(get_db)):
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    q = db.query(Agency)
    if owner_id is not None:
        q = q.filter(Agency.owner_id == owner_id)
    rows = q.all()
    return {"agencies": [{"id": a.id, "name": a.name, "email": a.email,
                          "status": _mod_state(a), "owner_id": a.owner_id} for a in rows]}
```

(Ce filtre `owner_id` est consommé par `services/trust-safety/app/worker.py`
— Task 2 — pour propager le KYC d'un utilisateur aux agences qu'il possède.
Faire Task 3 avant Task 2 si l'ordre d'exécution est strict, ou s'assurer que
le worker ne tourne pas encore en dev tant que ce filtre n'est pas livré —
sans lui `_owned_agency_ids` renvoie simplement une liste vide, dégradation
propre, pas d'erreur.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd services/agency && python3 -m pytest tests/ -v`
Expected: PASS (nouveaux tests + suite existante sans régression).

- [ ] **Step 7: Commit**

```bash
git add services/agency/app/trust_client.py services/agency/app/main.py services/agency/app/models.py services/agency/tests/test_trust.py
git commit -m "feat(agency): expose le score de confiance réel dans les payloads agence"
```

---

### Task 4: Gateway + dev-mesh — câblage `/api/v1/trust*`

**Files:**
- Modify: `gateway/app/main.py`
- Modify: `scripts/dev-mesh-up.sh`

**Interfaces:**
- Consumes: `app.state.trust_safety` (déjà présent), `settings.trust_safety_url` (déjà présent).

- [ ] **Step 1: Add routing rule**

In `gateway/app/main.py`, right after the existing trust-safety `/admin/accounts/*`
rule (around line 414-418), add:

```python
    if settings.trust_safety_url and path.startswith("/api/v1/trust/"):
        return app.state.trust_safety, path.replace("/api/v1", "", 1)
```

- [ ] **Step 2: Verify manually (no automated gateway route test exists for this pattern — follow precedent)**

Run: `grep -c "path.startswith(\"/api/v1/trust/\")" gateway/app/main.py`
Expected: `1`

- [ ] **Step 3: Add worker loop to dev mesh**

In `scripts/dev-mesh-up.sh`, find the existing worker-loop block(s) (search for
`app.worker` invocations, e.g. the `coloc-profile` one) and add an equivalent
loop for `trust-safety`:

```bash
(cd services/trust-safety && python3 -m app.worker) &
```

placed alongside the other `python3 -m app.worker` background loops (same
section as the existing relay loops, matching the file's existing style
exactly — read the surrounding 20 lines before inserting to match indentation
and comment conventions).

- [ ] **Step 4: Commit**

```bash
git add gateway/app/main.py scripts/dev-mesh-up.sh
git commit -m "feat(gateway): route /api/v1/trust vers trust-safety + worker dev-mesh"
```

---

### Task 5: Frontend semsarout — `TrustBadge` + branchement agences

**Files:**
- Create: `frontend/src/components/common/TrustBadge.jsx`
- Modify: `frontend/src/pages/AgencyDetail.jsx`
- Modify: `frontend/src/pages/AgencyList.jsx`
- Modify: `frontend/src/locales/fr/public.json`
- Modify: `frontend/src/locales/ar/public.json`

**Interfaces:**
- Produces: `TrustBadge({ level, dealCount, size })` — `level` ∈ `"none"|"verified"|"verified_experience"`. Rend `null` si `"none"`.
- Consumes: `agency.trust_level` / `agency.deal_count` déjà présents dans le payload `GET /agencies*` (Task 3, aucun nouvel appel réseau côté front — les pages consomment déjà `agency` via `propertyService.js`/appels existants).

- [ ] **Step 1: Add i18n keys**

In `frontend/src/locales/fr/public.json`, under the existing `agencyDetail`/
`agencyList` namespaces (voir clés `verifiedBadge`/`verifiedShort`/`verifiedFull`
déjà présentes), add:

```json
"trustVerified": "Identité vérifiée",
"trustExperience": "Vérifié · {{count}} transaction conclue via semsarout",
"trustExperience_other": "Vérifié · {{count}} transactions conclues via semsarout"
```

Mirror in `frontend/src/locales/ar/public.json`:

```json
"trustVerified": "هوية موثقة",
"trustExperience": "موثّق · {{count}} صفقة أُنجزت عبر semsarout",
"trustExperience_other": "موثّق · {{count}} صفقات أُنجزت عبر semsarout"
```

(Vérifier les clés voisines exactes dans les deux fichiers avant d'insérer —
respecter la structure de namespace existante `public:agencyDetail.*` /
`public:agencyList.*`.)

- [ ] **Step 2: Write `TrustBadge.jsx`**

```jsx
import { useTranslation } from 'react-i18next'
import { FiShield } from 'react-icons/fi'

export default function TrustBadge({ level, dealCount = 0, size = 'md' }) {
  const { t } = useTranslation()
  if (level === 'none') return null
  const label = level === 'verified_experience'
    ? t('public:agencyDetail.trustExperience', { count: dealCount })
    : t('public:agencyDetail.trustVerified')
  const cls = size === 'sm' ? 'text-xs' : 'text-sm'
  return (
    <span className={`inline-flex items-center gap-1 badge-success ${cls}`}>
      <FiShield className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}
```

- [ ] **Step 3: Wire into `AgencyDetail.jsx`**

Replace the block at `frontend/src/pages/AgencyDetail.jsx:125-127`
(`{agency.is_verified && (...)}`) with:

```jsx
              <TrustBadge level={agency.trust_level} dealCount={agency.deal_count} />
```

Add `import TrustBadge from '../components/common/TrustBadge'` at the top.

- [ ] **Step 4: Wire into `AgencyList.jsx`**

Replace both `{agency.is_verified && (...)}` blocks
(`frontend/src/pages/AgencyList.jsx:252-254` and `:319-321`) with
`<TrustBadge level={agency.trust_level} dealCount={agency.deal_count} size="sm" />`.
Add the same import.

- [ ] **Step 5: Manual verification**

Run: `cd frontend && npm run build`
Expected: build succeeds, no missing-key warnings for the new i18n strings.

Run: `cd frontend && npm test -- noHardcodedText` (or the project's exact i18n
lint test command — check `package.json` `scripts` for the precise name)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/TrustBadge.jsx frontend/src/pages/AgencyDetail.jsx frontend/src/pages/AgencyList.jsx frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(frontend): remplace le badge vérifié tautologique par le vrai score de confiance"
```

---

### Task 6: Frontend m3a-l3achrane — `VerifiedBadge` branché sur le vrai score

**Files:**
- Modify: `frontend-m3a-l3achrane/src/services/index.js`
- Modify: `frontend-m3a-l3achrane/src/surfaces/web/ListingDetail.jsx`
- Modify: `frontend-m3a-l3achrane/src/ds/listing/ListingCard.jsx`
- Modify: `frontend-m3a-l3achrane/src/surfaces/app/Securite.jsx`
- Modify: `frontend-m3a-l3achrane/src/surfaces/backoffice/BackOffice.jsx`

**Interfaces:**
- Produces: `getTrust(entityType, entityId) -> Promise<{level, deal_count}>` in `services/index.js` (appel `GET /api/v1/trust/{entityType}/{entityId}`, patron des fonctions API existantes du même fichier — lire les 20 premières lignes de `services/index.js` pour matcher le style d'appel HTTP exact avant d'ajouter).
- Consumes: `VerifiedBadge({ level: "full"|"partial"|"none", ... })` (composant existant, inchangé, `frontend-m3a-l3achrane/src/ds/trust/VerifiedBadge.jsx`).

- [ ] **Step 1: Add `getTrust` to `services/index.js`**

Lire le fichier d'abord pour repérer le patron exact des autres fonctions
(`getListing`, `createReport`, etc.) et l'imiter exactement (base URL, gestion
d'erreur, format de retour). Ajouter :

```js
export function getTrust(entityType, entityId) {
  return apiGet(`/trust/${entityType}/${entityId}`)  // remplacer `apiGet` par le
                                                       // helper HTTP réellement
                                                       // utilisé dans ce fichier
}
```

(Le nom du helper HTTP interne — `apiGet`, `http.get`, `client.get`, etc. — doit
être copié depuis une fonction voisine existante, pas deviné.)

- [ ] **Step 2: `ListingDetail.jsx` — palier réel au lieu de `listing.verifiee`**

`listing.verifiee` (ligne 155) vient du payload `getListing` — vérifier s'il
porte déjà `agency_id`/`owner_id`. Si oui, remplacer le rendu conditionnel par
un state chargé via `getTrust('agency', listing.agency_id)` (ou `'user'` si
`listing.owner_id` sans agence, patron bail particulier de la spec) au
`useEffect` existant qui charge déjà `getListing`. Mapper
`level` → `full` (verified_experience) / `partial` (verified) / ne pas
afficher (none), en remplaçant `listing.verifiee &&` par `trust?.level !== 'none' &&`.

- [ ] **Step 3: `ListingCard.jsx` — idem en carte compacte**

Le composant reçoit déjà un prop `verified` (booléen, ligne 38) — élargir en
`level` (string) passé par l'appelant (page de résultats de recherche, à
identifier via `grep -rn "ListingCard" frontend-m3a-l3achrane/src/surfaces`)
qui doit déjà avoir `listing.trust_level` dans son payload de recherche
(composite BFF `/listings`, vérifier `services/coloc-listing` — si absent côté
recherche, laisser `ListingCard` en `verified` booléen pour ce livrable et
noter l'écart dans le commit : le score par annonce individuelle est hors
périmètre, cf. spec, seul `ListingDetail` (profil agence complet) a le vrai
palier).

- [ ] **Step 4: `Securite.jsx` — palier de l'utilisateur courant**

Remplacer `level="full"` (codé en dur, ligne 143) par un fetch
`getTrust('user', currentUserId)` au montage (patron `useEffect` déjà utilisé
ailleurs dans ce fichier pour `blockedUsers` — l'imiter).

- [ ] **Step 5: `BackOffice.jsx` — liste utilisateurs modération**

Remplacer `level={u.is_verified ? 'full' : 'none'}` (ligne 677) par un batch
`getTrust` par utilisateur affiché (ou, si la liste est déjà chargée via un
endpoint composite back-office, ajouter `trust_level` à ce payload côté
`internal_kyc_queue`-like source plutôt que N appels front — décision à
prendre en lisant le endpoint réel consommé par cette liste avant de coder ;
ne pas faire N requêtes séquentielles au montage sans confirmation que la
liste est courte, typiquement < 20 lignes de modération).

- [ ] **Step 6: Manual verification (dev mesh + browser)**

Run: `bash scripts/dev-mesh-up.sh` (si pas déjà démarré)
Puis, dans le navigateur : ouvrir une fiche annonce m3a-l3achrane dont l'agence
a un utilisateur KYC-vérifié en local (utiliser le seed existant ou vérifier un
KYC via `POST /internal/kyc/{id}/verify` avec le token interne) → le badge
`VerifiedBadge` doit apparaître avec le bon libellé.

- [ ] **Step 7: i18n + lint**

Run: `cd frontend-m3a-l3achrane && npm run build && npm test`
Expected: build + tests passent, parité FR/AR intacte (aucune nouvelle chaîne
codée en dur introduite par ce livrable — les libellés `trust.verified` etc.
existent déjà).

- [ ] **Step 8: Commit**

```bash
git add frontend-m3a-l3achrane/src/services/index.js frontend-m3a-l3achrane/src/surfaces/web/ListingDetail.jsx frontend-m3a-l3achrane/src/ds/listing/ListingCard.jsx frontend-m3a-l3achrane/src/surfaces/app/Securite.jsx frontend-m3a-l3achrane/src/surfaces/backoffice/BackOffice.jsx
git commit -m "feat(m3a-frontend): VerifiedBadge branché sur le vrai score de confiance"
```

---

## Self-Review Notes

- **Spec coverage** : paliers (Task 1) ✓, résolution agence↔KYC par `owner_id`
  (Task 2, via `_owned_agency_ids` + le filtre `internal_agencies?owner_id=`
  ajouté en Task 3) ✓ — corrigé après une première passe incomplète du plan qui
  ne propageait le KYC qu'au niveau `user`.
- **Downgrade suspension/fraude** (Task 1) ✓, **lecture publique + batch**
  (Task 1) ✓, **front semsarout** (Task 5) ✓ complet.
- **Front m3a-l3achrane (Task 6) : livré partiellement, écart assumé
  découvert à l'implémentation** — seul `Securite.jsx` (badge de l'utilisateur
  courant) est branché sur le vrai score. Non fait, et pourquoi :
  - `ListingDetail.jsx` (bloc hôte "Hajar B.") : entièrement mocké en dur,
    aucune donnée réelle de propriétaire n'existe sur cette page (commentaire
    dans le code : `GET /listings/:id` n'expose pas `owner_id`). Brancher un
    vrai score nécessiterait d'abord d'exposer `owner_id` côté
    `coloc-listing` — hors spec, à traiter comme chantier séparé.
  - `ListingDetail.jsx` (`listing.verifiee`) et `ListingCard.jsx`
    (`verified`) : ce booléen signifie en réalité "annonce publiée"
    (`status === 'PUBLIEE'`), pas "identité vérifiée" — aucun rapport avec le
    score de confiance, laissé intact à dessein.
  - `BackOffice.jsx` (liste de modération utilisateurs) : `u.is_verified`
    est un vrai champ backend, mais brancher un vrai score par ligne
    nécessiterait soit N requêtes séquentielles au montage (mauvais pour une
    liste potentiellement longue), soit un nouvel endpoint BFF batché
    (`/api/v1/trust/batch`, non spec-é) — laissé inchangé plutôt que de créer
    une régression de perf ou un faux branchement.
- **Hors périmètre confirmé non traité** : licence/RC/ICE, score par annonce
  individuelle, pondération sur rejet KYC répété.
