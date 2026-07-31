# Plan P1-3 — Interception & messagerie médiée

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer `messaging` en fil bidirectionnel (Conversation/Message), migrer l'existant `BuyerMessage`, et masquer le contact des demandeurs/propriétaires sur les annonces particulier (contact jamais en clair avant conclusion).

**Architecture:** `services/messaging` passe d'un `BuyerMessage` unidirectionnel à `Conversation` + `Message` (identifiants d'utilisateur opaques, aucun champ de contact). Un worker amorce un fil sur `rental.application.received` (location) et `sale.inquiry.created` (vente, émis au Plan P1-5). `listing` renvoie **403** sur `reveal-phone` pour annonces particulier et **dépollue** `listing.contacted` (pas d'email/téléphone en clair) ; `rental` retire les coordonnées de `_application_dict` et du payload `rental.application.received`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, `semsar_events` consumer, pytest + SQLite en mémoire.

## Global Constraints

- **Aucun champ de contact** (email/téléphone) dans `Conversation`/`Message` : seuls des `*_party` = uid identity opaques.
- Le contact réel n'est **jamais** exposé via l'API tant que la commission de conclusion n'est pas réglée.
- Masquage limité aux annonces **particulier / promoteur-direct** (`owner_id` set, `agency_id` nul) ; annonces d'agence **inchangées**.
- Migration `BuyerMessage` → `Conversation`/`Message` **intégrale et idempotente**, pas de double écriture.
- Conventional Commits ; pas d'attribution IA ; gate qualité vert avant « done ».

---

### Task 1 : Nouveau modèle Conversation/Message

**Files:**
- Modify: `services/messaging/app/models.py`
- Create: `services/messaging/db/migrate_conversation.sql`
- Test: `services/messaging/tests/conftest.py`, `services/messaging/tests/test_models.py`

**Interfaces:**
- Produces: modèles `Conversation` (id, property_id, owner_party, requester_party, context_type, context_ref_id, status, created_at, updated_at ; unique `(property_id, requester_party, context_type)`) et `Message` (id, conversation_id, sender_party, body, created_at, read_at). `ListingRO`/`ProcessedMessage` conservés. `BuyerMessage` **conservé** jusqu'à la migration (Task 4), puis supprimé.

- [ ] **Step 1 : conftest** (`services/messaging/tests/conftest.py`) — même patron que commission (SQLite + override `get_db`/`get_principal`) :

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal

from app import models  # noqa: F401
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


def make_client(db_session, uid="10", roles=("buyer",)):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub=uid, roles=list(roles), agency_id=None, is_superadmin=False, features=[], claims={})
    return TestClient(app)


@pytest.fixture
def client(db_session):
    c = make_client(db_session)
    with c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 2 : Test qui échoue** (`tests/test_models.py`)

```python
from app import models


def test_conversation_and_message_tables(db_session):
    conv = models.Conversation(property_id=1, owner_party=5, requester_party=10,
                               context_type="rental_application", context_ref_id=99, status="open")
    db_session.add(conv)
    db_session.flush()
    db_session.add(models.Message(conversation_id=conv.id, sender_party=10, body="Bonjour"))
    db_session.commit()
    assert db_session.query(models.Message).count() == 1
    assert conv.id is not None
```

- [ ] **Step 3 : Lancer, échec attendu** (`Conversation` inexistant).

- [ ] **Step 4 : Modifier `services/messaging/app/models.py`** — ajouter (garder `BuyerMessage`, `ListingRO`, `ProcessedMessage` pour l'instant) :

```python
from sqlalchemy import ForeignKey, UniqueConstraint  # compléter les imports


class Conversation(Base):
    __tablename__ = "conversation"
    __table_args__ = (UniqueConstraint("property_id", "requester_party", "context_type",
                                       name="uq_conversation_thread"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, nullable=False, index=True)
    owner_party = Column(Integer, index=True)       # propriétaire (uid opaque)
    requester_party = Column(Integer, index=True)   # candidat / acheteur (uid opaque)
    context_type = Column(String(30), nullable=False)   # rental_application | sale_inquiry | legacy
    context_ref_id = Column(Integer)
    status = Column(String(20), default="open")     # open | closed | archived
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {"id": self.id, "property_id": self.property_id, "owner_party": self.owner_party,
                "requester_party": self.requester_party, "context_type": self.context_type,
                "context_ref_id": self.context_ref_id, "status": self.status,
                "created_at": self.created_at.isoformat() if self.created_at else None}


class Message(Base):
    __tablename__ = "message"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversation.id"), nullable=False, index=True)
    sender_party = Column(Integer, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime)

    def to_dict(self) -> dict:
        return {"id": self.id, "conversation_id": self.conversation_id,
                "sender_party": self.sender_party, "body": self.body,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "read_at": self.read_at.isoformat() if self.read_at else None}
```

- [ ] **Step 5 : Migration SQL** (`services/messaging/db/migrate_conversation.sql`) :

```sql
-- Messagerie bidirectionnelle : nouvelles tables (les données legacy sont migrées par script Python).
CREATE TABLE IF NOT EXISTS messaging.conversation (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL,
    owner_party INTEGER,
    requester_party INTEGER,
    context_type VARCHAR(30) NOT NULL,
    context_ref_id INTEGER,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    CONSTRAINT uq_conversation_thread UNIQUE (property_id, requester_party, context_type)
);
CREATE INDEX IF NOT EXISTS ix_conversation_property ON messaging.conversation (property_id);
CREATE TABLE IF NOT EXISTS messaging.message (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES messaging.conversation(id),
    sender_party INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    read_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_message_conversation ON messaging.message (conversation_id);
```

- [ ] **Step 6 : Lancer les tests** → PASS.

- [ ] **Step 7 : Commit**

```bash
git add services/messaging
git commit -m "feat(messaging): modèle Conversation/Message bidirectionnel"
```

---

### Task 2 : Endpoints de messagerie bidirectionnelle

**Files:**
- Modify: `services/messaging/app/main.py`
- Test: `services/messaging/tests/test_conversations.py`

**Interfaces:**
- Produces (auth requise, tout rôle) :
  - `GET /messaging/conversations` → fils où l'utilisateur est `owner_party` OU `requester_party`.
  - `GET /messaging/conversations/{id}` → `{conversation, messages:[...]}` (403 si non participant) ; marque lus les messages reçus.
  - `POST /messaging/conversations/{id}/messages` `{body}` → 201, `sender_party` = utilisateur courant (403 si non participant).

- [ ] **Step 1 : Test qui échoue** (`tests/test_conversations.py`)

```python
from app import models
from tests.conftest import make_client


def _seed(db_session):
    conv = models.Conversation(property_id=1, owner_party=5, requester_party=10,
                               context_type="rental_application", context_ref_id=1, status="open")
    db_session.add(conv)
    db_session.commit()
    return conv.id


def test_participant_can_post_and_list(db_session):
    cid = _seed(db_session)
    buyer = make_client(db_session, uid="10")
    r = buyer.post(f"/messaging/conversations/{cid}/messages", json={"body": "Bonjour"})
    assert r.status_code == 201
    r2 = buyer.get("/messaging/conversations")
    assert any(c["id"] == cid for c in r2.json()["conversations"])
    app_overrides_cleanup()


def test_non_participant_forbidden(db_session):
    cid = _seed(db_session)
    intruder = make_client(db_session, uid="99")
    r = intruder.get(f"/messaging/conversations/{cid}")
    assert r.status_code == 403
    app_overrides_cleanup()


def app_overrides_cleanup():
    from app.main import app
    app.dependency_overrides.clear()
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Réécrire les endpoints de `services/messaging/app/main.py`** — remplacer les 3 endpoints `buyer/messages` par :

```python
from .models import Conversation, Message


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def _is_participant(conv: Conversation, uid: int) -> bool:
    return uid in (conv.owner_party, conv.requester_party)


@app.get("/messaging/conversations")
def list_conversations(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.sub:
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    q = (db.query(Conversation)
         .filter((Conversation.owner_party == uid) | (Conversation.requester_party == uid))
         .order_by(Conversation.updated_at.desc()))
    return {"conversations": [c.to_dict() for c in q.all()]}


@app.get("/messaging/conversations/{conversation_id}")
def get_conversation(conversation_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    uid = _uid(principal)
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return _err("Conversation introuvable", 404)
    if not _is_participant(conv, uid):
        return _err("Accès refusé", 403)
    msgs = (db.query(Message).filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at).all())
    for m in msgs:
        if m.sender_party != uid and m.read_at is None:
            m.read_at = datetime.utcnow()
    db.commit()
    return {"conversation": conv.to_dict(), "messages": [m.to_dict() for m in msgs]}


@app.post("/messaging/conversations/{conversation_id}/messages", status_code=201)
async def post_message(conversation_id: int, request: Request,
                       principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return _err("Conversation introuvable", 404)
    if not _is_participant(conv, uid):
        return _err("Accès refusé", 403)
    data = await _json(request)
    body = (data.get("body") or "").strip()
    if not body:
        return _err("Message vide", 400)
    m = Message(conversation_id=conversation_id, sender_party=uid, body=body)
    conv.updated_at = datetime.utcnow()
    db.add(m)
    db.commit()
    return {"message": m.to_dict()}
```
(Conserver `_err`, `_json` existants. Supprimer les anciens endpoints `list_messages`/`send_message`/`get_message` qui référencent `BuyerMessage`.)

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/messaging
git commit -m "feat(messaging): endpoints de conversation bidirectionnelle (participants only)"
```

---

### Task 3 : Worker — amorçage de fil sur candidature/demande d'achat

**Files:**
- Modify: `services/messaging/app/worker.py`
- Test: `services/messaging/tests/test_worker_seed.py`

**Interfaces:**
- Consumes: `rental.application.received` `{id, applicant_user_id, owner_id, property_id}` → Conversation `rental_application` ; `sale.inquiry.created` `{id, buyer_party, seller_party, property_id}` (émis au Plan P1-5) → Conversation `sale_inquiry`. Conserve la projection `listing.#` → `listing_ro`. **Idempotent** via `ProcessedMessage` + unicité du fil.

- [ ] **Step 1 : Test qui échoue** (`tests/test_worker_seed.py`)

```python
from app import models
from app.worker import _handle


def test_application_received_opens_conversation(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    _handle("rental.application.received",
            {"id": 55, "applicant_user_id": 10, "owner_id": 5, "property_id": 1}, "ta:55")
    conv = db_session.query(models.Conversation).filter_by(context_ref_id=55).first()
    assert conv is not None
    assert conv.owner_party == 5 and conv.requester_party == 10
    assert conv.context_type == "rental_application"


def test_seed_idempotent(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    p = {"id": 55, "applicant_user_id": 10, "owner_id": 5, "property_id": 1}
    _handle("rental.application.received", p, "ta:55")
    _handle("rental.application.received", p, "ta:55")
    assert db_session.query(models.Conversation).filter_by(context_ref_id=55).count() == 1
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Réécrire `services/messaging/app/worker.py`** :

```python
"""Consumer messaging — projette listing_ro et amorce les fils médiés.

    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import Conversation, ListingRO, ProcessedMessage


def _open_thread(db, context_type, context_ref_id, property_id, owner_party, requester_party) -> None:
    exists = (db.query(Conversation)
              .filter(Conversation.property_id == property_id,
                      Conversation.requester_party == requester_party,
                      Conversation.context_type == context_type).first())
    if exists is None:
        db.add(Conversation(property_id=property_id, owner_party=owner_party,
                            requester_party=requester_party, context_type=context_type,
                            context_ref_id=context_ref_id, status="open"))


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "listing.deleted":
            ro = db.get(ListingRO, payload.get("id"))
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            if db.get(ListingRO, payload.get("id")) is None:
                db.add(ListingRO(id=payload.get("id")))
        elif routing_key == "rental.application.received":
            _open_thread(db, "rental_application", payload.get("id"), payload.get("property_id"),
                         payload.get("owner_id"), payload.get("applicant_user_id"))
        elif routing_key == "sale.inquiry.created":
            _open_thread(db, "sale_inquiry", payload.get("id"), payload.get("property_id"),
                         payload.get("seller_party"), payload.get("buyer_party"))
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
        bindings=["listing.#", "rental.application.received", "sale.inquiry.created"],
        exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/messaging
git commit -m "feat(messaging): amorçage de fil médié sur candidature / demande d'achat"
```

---

### Task 4 : Migration des `BuyerMessage` legacy + suppression du modèle

**Files:**
- Create: `services/messaging/migrate_buyer_message.py`
- Modify: `services/messaging/app/models.py` (supprimer `BuyerMessage` après migration)
- Test: `services/messaging/tests/test_migration.py`

**Interfaces:**
- Produces: `migrate_buyer_message(db) -> int` — pour chaque `BuyerMessage`, crée (idempotemment) une `Conversation` `context_type="legacy"` (owner_party inconnu → `None`, requester_party = buyer_id) + un `Message` (sender=buyer_id, body=message). Renvoie le nombre migré.

- [ ] **Step 1 : Test qui échoue** (`tests/test_migration.py`) — nécessite `BuyerMessage` encore présent :

```python
from app import models
from migrate_buyer_message import migrate_buyer_message


def test_legacy_message_migrated(db_session):
    db_session.add(models.BuyerMessage(buyer_id=10, property_id=1, subject="Info",
                                       message="Bonjour", buyer_email="a@b.c", buyer_phone="06"))
    db_session.commit()
    n = migrate_buyer_message(db_session)
    assert n == 1
    conv = db_session.query(models.Conversation).filter_by(context_type="legacy").first()
    assert conv.requester_party == 10
    msg = db_session.query(models.Message).filter_by(conversation_id=conv.id).first()
    assert msg.body == "Bonjour"
    # ré-exécution idempotente
    assert migrate_buyer_message(db_session) == 0
```

- [ ] **Step 2 : Lancer, échec attendu** (`migrate_buyer_message` inexistant).

- [ ] **Step 3 : Créer `services/messaging/migrate_buyer_message.py`** :

```python
"""Migration idempotente BuyerMessage → Conversation/Message (legacy).

    python migrate_buyer_message.py   # utilise DATABASE_URL
"""
from app.db import SessionLocal
from app.models import BuyerMessage, Conversation, Message


def migrate_buyer_message(db) -> int:
    migrated = 0
    for bm in db.query(BuyerMessage).order_by(BuyerMessage.id).all():
        conv = (db.query(Conversation)
                .filter(Conversation.property_id == bm.property_id,
                        Conversation.requester_party == bm.buyer_id,
                        Conversation.context_type == "legacy").first())
        if conv is None:
            conv = Conversation(property_id=bm.property_id, owner_party=None,
                                requester_party=bm.buyer_id, context_type="legacy",
                                context_ref_id=bm.id, status="open", created_at=bm.created_at)
            db.add(conv)
            db.flush()
            db.add(Message(conversation_id=conv.id, sender_party=bm.buyer_id,
                           body=bm.message, created_at=bm.created_at))
            migrated += 1
    db.commit()
    return migrated


if __name__ == "__main__":
    s = SessionLocal()
    try:
        print(f"migrés: {migrate_buyer_message(s)}")
    finally:
        s.close()
```

- [ ] **Step 4 : Lancer le test** → PASS.

> **Décision (unique, non ambiguë)** : `BuyerMessage` est **conservé en modèle legacy read-only** — plus aucun endpoint (supprimés en Task 2), mais le modèle et sa table survivent pour l'audit et pour que la migration puisse les lire. **Ne PAS supprimer** le modèle `BuyerMessage`. Ordre d'exploitation prod : appliquer `migrate_conversation.sql` → lancer `python migrate_buyer_message.py` (idempotent). Le test de migration reste donc valide en permanence.

- [ ] **Step 5 : Commit**

```bash
git add services/messaging
git commit -m "feat(messaging): migration BuyerMessage → Conversation/Message (legacy read-only)"
```

---

### Task 5 : `listing` — masquage du contact sur annonces particulier

**Files:**
- Modify: `services/listing/app/main.py` (`reveal_phone`, `contact_property`)
- Test: `services/listing/tests/test_contact_masking.py`

**Interfaces:**
- Produces: helper `_is_particulier(p) -> bool` (`p.owner_id and not p.agency_id`). `reveal-phone` → 403 si particulier. `contact_property` sur particulier → émet `listing.contacted` **sans** `email`/`phone` (payload dépollué) ; annonces d'agence inchangées.

- [ ] **Step 1 : Test qui échoue** (`services/listing/tests/test_contact_masking.py`) — nécessite un conftest DB (créer sur le modèle commission si absent) :

```python
from app import models


def test_reveal_phone_forbidden_for_particulier(client, db_session):
    db_session.add(models.Property(id=1, title="T", owner_id=5, agency_id=None))
    db_session.commit()
    r = client.post("/properties/1/reveal-phone", json={})
    assert r.status_code == 403


def test_agency_reveal_phone_still_works(client, db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "_fetch_contact_phone", lambda p: "0600000000")
    db_session.add(models.Property(id=2, title="T", owner_id=None, agency_id=9))
    db_session.commit()
    r = client.post("/properties/2/reveal-phone", json={})
    assert r.status_code == 200
    assert r.json()["phone"] == "0600000000"
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Ajouter le helper + garde** dans `services/listing/app/main.py` :

```python
def _is_particulier(p) -> bool:
    return bool(p.owner_id) and not p.agency_id
```

Dans `reveal_phone`, juste après `if p is None: return _err("Not found", 404)` :
```python
    if _is_particulier(p):
        return _err("Contact via la messagerie de la plateforme (annonce particulier).", 403)
```

Dans `contact_property`, remplacer l'appel `_contact_payload(...)` par une version dépolluée pour les particuliers :
```python
    payload = _contact_payload(p, data, data.get("source") or "contact_form")
    if _is_particulier(p):
        payload["email"] = None
        payload["phone"] = None
        payload["source"] = "mediated"
    enqueue(db, "property", p.id, events.LISTING_CONTACTED, payload)
```

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/listing
git commit -m "feat(listing): masquer le contact sur annonces particulier (reveal-phone 403 + payload dépollué)"
```

---

### Task 6 : `rental` — dépolluer la candidature (coordonnées non exposées)

**Files:**
- Modify: `services/rental/app/main.py` (`_application_dict`, payload `submit_application`)
- Test: `services/rental/tests/test_application_masking.py`

**Interfaces:**
- Produces: `_application_dict` masque `applicant_email`/`applicant_phone` pour le **propriétaire particulier** (bien avec `owner_id`) ; le payload `rental.application.received` **retire** `applicant_email`/`applicant_name` et **ajoute** `applicant_user_id` + `owner_id` (requis par le worker messaging, Task 3). Les coordonnées **restent en base** (colonnes inchangées).

- [ ] **Step 1 : Test qui échoue** (`services/rental/tests/test_application_masking.py`)

```python
from app import main


def test_application_event_payload_has_no_contact_but_has_parties():
    # construit le payload comme dans submit_application (extraction de la logique en helper)
    payload = main._application_event_payload(app_id=1, applicant_user_id=10, owner_id=5,
                                              property_id=2, property_title="T")
    assert "applicant_email" not in payload
    assert "applicant_name" not in payload
    assert payload["applicant_user_id"] == 10
    assert payload["owner_id"] == 5
```

- [ ] **Step 2 : Lancer, échec attendu** (`_application_event_payload` inexistant).

- [ ] **Step 3 : Extraire le payload en helper + dépolluer** dans `services/rental/app/main.py` :

```python
def _application_event_payload(app_id, applicant_user_id, owner_id, property_id, property_title) -> dict:
    return {"id": app_id, "applicant_user_id": applicant_user_id, "owner_id": owner_id,
            "property_id": property_id, "property_title": property_title}
```

Dans `submit_application`, remplacer le bloc `enqueue(... APPLICATION_RECEIVED ...)` par :
```python
    enqueue(db, "tenant_application", a.id, events.APPLICATION_RECEIVED,
            _application_event_payload(a.id, a.applicant_user_id, a.owner_id, a.property_id,
                                       prop.get("title")))
```
(Faire de même dans `create_application_for_client` si elle émet `APPLICATION_RECEIVED` avec des coordonnées.)

Dans `_application_dict`, masquer côté propriétaire particulier — remplacer les deux lignes de contact :
```python
        "applicant_email": a.applicant_email if a.agency_id else None,
        "applicant_phone": a.applicant_phone if a.agency_id else None,
```
(le back-office **agence** garde le contact pour son CRM ; le particulier passe par la messagerie.)

- [ ] **Step 4 : Lancer les tests** (le nouveau + smoke existants) → PASS.

Run: `cd services/rental && python -m pytest tests/ -v`

- [ ] **Step 5 : Commit**

```bash
git add services/rental
git commit -m "feat(rental): interception — candidature sans coordonnées en clair (payload + dict)"
```

---

### Task 7 : Enregistrement mesh (messaging déjà présent — vérifs)

**Files:**
- Modify: `scripts/dev-mesh-up.sh` (s'assurer que `messaging` est dans la boucle `worker` ; il l'est déjà d'après l'inventaire — vérifier)
- Modify: `gateway/app/main.py` (routage `/api/v1/messaging/*` si absent)

- [ ] **Step 1 : Vérifier le routage BFF de messaging**

Run: `grep -n "messaging" gateway/app/main.py gateway/app/config.py scripts/dev-mesh-up.sh`
Expected: `messaging` est déjà lancé (worker) et a `MESSAGING_URL`. Si le routage `/api/v1/messaging` / `/api/v1/buyer/messages` n'est pas mappé aux nouveaux endpoints, ajouter dans `_resolve_upstream` :
```python
    if settings.messaging_url and path.startswith("/api/v1/messaging"):
        return app.state.messaging, path.replace("/api/v1", "", 1)
```

- [ ] **Step 2 : Appliquer la migration + relancer**

Run:
```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -f services/messaging/db/migrate_conversation.sql
bash scripts/dev-mesh-up.sh
curl -s localhost:8510/health
```
Expected: `{"status":"ok","service":"messaging"}`.

- [ ] **Step 3 : Commit**

```bash
git add scripts/dev-mesh-up.sh gateway
git commit -m "chore(mesh): router /api/v1/messaging vers le service messaging"
```

---

## Self-Review

- **Couverture spec** : §4.1 (Conversation/Message, party opaques) → Task 1 ; endpoints → Task 2 ; §4.3 (amorçage) → Task 3 ; migration BuyerMessage → Task 4 ; §4.2 pt1-2 (listing reveal-phone 403 + contact dépollué) → Task 5 ; §4.2 pt3 (_application_dict + event) → Task 6.
- **Placeholders** : aucun.
- **Cohérence des types** : le payload `rental.application.received` produit en Task 6 (`applicant_user_id`, `owner_id`, `property_id`) correspond exactement aux clés lues par le worker messaging Task 3 ; `sale.inquiry.created` (`buyer_party`, `seller_party`, `property_id`) est produit au Plan P1-5 avec ces clés.
