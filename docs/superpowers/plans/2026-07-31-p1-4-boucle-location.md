# Plan P1-4 — Boucle location bout-en-bout (bail particulier + gate commission)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un propriétaire **particulier** de conclure et e-signer un bail depuis « Mon espace », en passant par le **gate commission** (paiement CMI avant signature dès la 2e affaire), et émettre `rental.lease.signed` portant l'`account_id` du propriétaire.

**Architecture:** `Lease` gagne `owner_id` + `tenant_user_id` (bail particulier, sans agence ni mandat). Un parcours particulier (`/gestion-locative/owner/leases*`) crée le bail à partir d'une candidature acceptée, puis lance la e-signature 3a9dSign (via `semsar_signing`, Plan P1-1) **après** un appel **fail-closed** au gate `commission` (Plan P1-2). La complétion (polling existant) émet `rental.lease.signed` avec `account_id = owner_id`, que le worker commission finalise.

**Tech Stack:** FastAPI, SQLAlchemy, `semsar_signing`, `httpx` (appel gate), pytest + SQLite.

## Global Constraints

- Le gate est **fail-closed** : toute erreur d'appel à `commission` empêche le lancement de la signature.
- Ordre imposé : **paiement d'abord** (si BLOCKED) → **signature ensuite**.
- La commission ne concerne que le **particulier / promoteur-direct** : le parcours agence existant reste inchangé et n'appelle **jamais** le gate.
- `rental.lease.signed` doit porter `account_id` = `owner_id` (None pour un bail d'agence — sans effet côté commission).
- Conventional Commits ; pas d'attribution IA ; gate qualité vert avant « done ».
- **Dépend de** : Plan P1-1 (`semsar_signing`) et Plan P1-2 (`commission` déployé, gate + void).

---

### Task 1 : `Lease` — bail particulier (owner_id / tenant_user_id) + account_id dans l'event

**Files:**
- Modify: `services/rental/app/models.py` (Lease : `owner_id`, `tenant_user_id`)
- Modify: `services/rental/app/main.py` (`_emit_lease` : `account_id`)
- Create: `services/rental/db/migrate_particulier_lease.sql`
- Test: `services/rental/tests/test_lease_owner.py` (+ conftest DB si absent)

**Interfaces:**
- Produces: `Lease.owner_id` (Integer, nullable, index), `Lease.tenant_user_id` (Integer, nullable). `_emit_lease` ajoute `"account_id": l.owner_id` au payload.

- [ ] **Step 1 : Test qui échoue** (`tests/test_lease_owner.py`)

```python
from app import models, main


def test_lease_has_owner_columns(db_session):
    l = models.Lease(property_id=1, owner_id=5, tenant_user_id=10, reference="B-1", status="draft")
    db_session.add(l)
    db_session.commit()
    assert l.owner_id == 5 and l.tenant_user_id == 10


def test_emit_lease_payload_has_account_id(db_session):
    captured = {}
    import app.main as m
    m_enqueue = m.enqueue
    try:
        m.enqueue = lambda db, at, aid, et, payload: captured.update(payload)
        l = models.Lease(id=7, property_id=1, owner_id=5, reference="B-2", status="active")
        m._emit_lease(db_session, l, "rental.lease.signed")
    finally:
        m.enqueue = m_enqueue
    assert captured["account_id"] == 5
```

- [ ] **Step 2 : Lancer, échec attendu** (colonnes absentes).

- [ ] **Step 3 : Ajouter les colonnes** à `Lease` (`services/rental/app/models.py`, dans la classe `Lease`) :

```python
    owner_id = Column(Integer, index=True)       # bail de particulier (sans agence)
    tenant_user_id = Column(Integer)             # locataire = utilisateur (pas un crm.Client)
```

- [ ] **Step 4 : Ajouter `account_id` au payload** dans `_emit_lease` (`services/rental/app/main.py`) — ajouter la clé au dict :

```python
        "agency_id": l.agency_id, "account_id": l.owner_id,
```

- [ ] **Step 5 : Migration SQL** (`services/rental/db/migrate_particulier_lease.sql`) :

```sql
ALTER TABLE rental.lease ADD COLUMN IF NOT EXISTS owner_id INTEGER;
ALTER TABLE rental.lease ADD COLUMN IF NOT EXISTS tenant_user_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_lease_owner ON rental.lease (owner_id);
```

- [ ] **Step 6 : Lancer les tests** → PASS.

- [ ] **Step 7 : Commit**

```bash
git add services/rental
git commit -m "feat(rental): bail particulier (owner_id/tenant_user_id) + account_id dans l'event"
```

---

### Task 2 : Client gate commission (fail-closed) dans rental

**Files:**
- Create: `services/rental/app/commission_client.py`
- Test: `services/rental/tests/test_commission_client.py`

**Interfaces:**
- Produces:
  - `commission_client.gate(account_id, deal_type, source_ref) -> dict` (`{state, billable, invoice_ref, pay_url}`) — lève `CommissionUnavailable` sur toute erreur réseau/HTTP (fail-closed).
  - `commission_client.void(deal_type, source_ref) -> None`.
  - `commission_client.CommissionUnavailable(Exception)`.

- [ ] **Step 1 : Test qui échoue** (`tests/test_commission_client.py`)

```python
import app.commission_client as cc


def test_gate_raises_on_network_error(monkeypatch):
    def boom(*a, **k):
        raise cc.httpx.HTTPError("down")
    monkeypatch.setattr(cc.httpx, "get", boom)
    try:
        cc.gate(5, "rental", 1)
        assert False, "doit lever"
    except cc.CommissionUnavailable:
        pass


def test_gate_returns_json(monkeypatch):
    class _R:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {"state": "OPEN", "billable": False}
    monkeypatch.setattr(cc.httpx, "get", lambda *a, **k: _R())
    assert cc.gate(5, "rental", 1)["state"] == "OPEN"
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Créer `services/rental/app/commission_client.py`** :

```python
"""Appel synchrone au gate commission — fail-closed (toute erreur = indisponible)."""
import os

import httpx

_COMMISSION_URL = os.environ.get("COMMISSION_URL", "http://localhost:8519")


class CommissionUnavailable(Exception):
    pass


def gate(account_id: int, deal_type: str, source_ref: int) -> dict:
    try:
        r = httpx.get(f"{_COMMISSION_URL}/internal/commission/gate",
                      params={"account_id": account_id, "deal_type": deal_type, "source_ref": source_ref},
                      timeout=6.0)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        raise CommissionUnavailable(str(e)) from e


def void(deal_type: str, source_ref: int) -> None:
    try:
        httpx.post(f"{_COMMISSION_URL}/internal/commission/void",
                   json={"deal_type": deal_type, "source_ref": source_ref}, timeout=6.0)
    except httpx.HTTPError:
        pass  # best-effort
```

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/rental
git commit -m "feat(rental): client gate commission (fail-closed)"
```

---

### Task 3 : Création du bail particulier depuis une candidature acceptée

**Files:**
- Modify: `services/rental/app/main.py` (endpoint `POST /gestion-locative/owner/leases`)
- Test: `services/rental/tests/test_owner_lease_create.py`

**Interfaces:**
- Produces: `POST /gestion-locative/owner/leases` `{application_id, rent_amount, charges_amount?, deposit_amount?, start_date?, end_date?}` → 201. Vérifie que la candidature appartient au propriétaire courant (`application.owner_id == uid`) et est `accepted`. Crée `Lease(owner_id=uid, property_id, tenant_user_id=application.applicant_user_id, status="draft")`.

- [ ] **Step 1 : Test qui échoue** (`tests/test_owner_lease_create.py`)

```python
from app import models
from tests.conftest import make_owner_client  # helper à ajouter au conftest (principal uid=5)


def test_owner_creates_lease_from_accepted_application(db_session):
    db_session.add(models.TenantApplication(id=1, property_id=2, owner_id=5,
                                            applicant_user_id=10, status="accepted"))
    db_session.commit()
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases",
                    json={"application_id": 1, "rent_amount": 4500})
    assert r.status_code == 201
    lease = db_session.query(models.Lease).first()
    assert lease.owner_id == 5 and lease.tenant_user_id == 10 and lease.status == "draft"


def test_owner_cannot_use_others_application(db_session):
    db_session.add(models.TenantApplication(id=2, property_id=2, owner_id=99,
                                            applicant_user_id=10, status="accepted"))
    db_session.commit()
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases", json={"application_id": 2, "rent_amount": 4500})
    assert r.status_code in (403, 404)
```

Ajouter au conftest rental un `make_owner_client(db_session, uid)` qui override `get_principal` avec `Principal(sub=uid, roles=["buyer"], agency_id=None, ...)`.

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Implémenter l'endpoint** (`services/rental/app/main.py`) :

```python
@app.post("/gestion-locative/owner/leases", status_code=201)
async def create_owner_lease(request: Request, principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    if not principal.sub:
        return err("Authentification requise.", 401)
    uid = int(principal.sub)
    data = await json_body(request)
    app_id = data.get("application_id")
    ta = db.get(TenantApplication, app_id) if app_id else None
    if ta is None or ta.owner_id != uid:
        return err("Candidature introuvable.", 404)
    if ta.status != "accepted":
        return err("La candidature doit être acceptée avant d'établir le bail.", 400)
    if not data.get("rent_amount"):
        return err("rent_amount requis.", 400)
    l = Lease(owner_id=uid, property_id=ta.property_id, tenant_user_id=ta.applicant_user_id,
              reference=f"BP-{uid}-{ta.id}", status="draft",
              rent_amount=data.get("rent_amount"), charges_amount=data.get("charges_amount"),
              deposit_amount=data.get("deposit_amount"),
              start_date=_parse_date(data.get("start_date")), end_date=_parse_date(data.get("end_date")))
    db.add(l)
    db.commit()
    return _lease_dict(l)
```
(Réutiliser le helper de parsing de date existant du fichier ; s'il n'existe pas sous ce nom, utiliser celui déjà employé par la création de bail agence.)

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/rental
git commit -m "feat(rental): création de bail particulier depuis candidature acceptée"
```

---

### Task 4 : Gate + lancement de la e-signature (bail particulier)

**Files:**
- Modify: `services/rental/app/main.py` (endpoint `POST /gestion-locative/owner/leases/{id}/request-signature`)
- Test: `services/rental/tests/test_owner_lease_sign.py`

**Interfaces:**
- Consumes: `commission_client.gate(...)` (Task 2), `semsar_signing` (Plan P1-1), `SignatureRequest` (existant).
- Produces: `POST /gestion-locative/owner/leases/{id}/request-signature` `{tenant_email?}` :
  - appelle `gate(owner_id, "rental", lease_id)` (**fail-closed** → 503 si `CommissionUnavailable`) ;
  - `state == "BLOCKED"` → **402** `{"error": "...", "pay_url": ...}` (pas de signature lancée) ;
  - `state == "OPEN"` → crée l'enveloppe 3a9dSign (signataires : propriétaire + locataire), enregistre `SignatureRequest(doc_type="lease", doc_ref_id=lease_id)`, renvoie son état.

- [ ] **Step 1 : Test qui échoue** (`tests/test_owner_lease_sign.py`)

```python
import app.main as main
from app import models
from tests.conftest import make_owner_client


def _lease(db_session, owner=5):
    l = models.Lease(id=3, property_id=2, owner_id=owner, tenant_user_id=10,
                     reference="BP-1", status="draft", rent_amount=4500)
    db_session.add(l)
    db_session.commit()
    return l


def test_blocked_returns_402_with_pay_url(db_session, monkeypatch):
    _lease(db_session)
    monkeypatch.setattr(main.commission_client, "gate",
                        lambda **k: {"state": "BLOCKED", "billable": True, "pay_url": "/pay?ref=X"})
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases/3/request-signature", json={"tenant_email": "t@x.c"})
    assert r.status_code == 402
    assert r.json()["pay_url"] == "/pay?ref=X"
    assert db_session.query(models.SignatureRequest).count() == 0


def test_gate_unavailable_is_fail_closed(db_session, monkeypatch):
    _lease(db_session)
    def boom(**k):
        raise main.commission_client.CommissionUnavailable("down")
    monkeypatch.setattr(main.commission_client, "gate", boom)
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases/3/request-signature", json={})
    assert r.status_code == 503
    assert db_session.query(models.SignatureRequest).count() == 0


def test_open_launches_signature(db_session, monkeypatch):
    _lease(db_session)
    monkeypatch.setattr(main.commission_client, "gate", lambda **k: {"state": "OPEN", "billable": False})
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "create_envelope", lambda *a, **k: "env-1")
    monkeypatch.setattr(main.signing, "add_document", lambda *a, **k: ("doc-1", 1))
    monkeypatch.setattr(main.signing, "add_recipient", lambda *a, **k: "r-1")
    monkeypatch.setattr(main.signing, "place_signature_field", lambda *a, **k: None)
    monkeypatch.setattr(main.signing, "send_envelope", lambda *a, **k: None)
    monkeypatch.setattr(main, "_owner_lease_pdf_bytes", lambda db, l: b"%PDF-")
    monkeypatch.setattr(main, "_owner_email", lambda uid: "owner@x.c")
    monkeypatch.setattr(main, "_applicant_email_for_lease", lambda db, l: "tenant@x.c")
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases/3/request-signature", json={})
    assert r.status_code == 200
    sig = db_session.query(models.SignatureRequest).first()
    assert sig.doc_type == "lease" and sig.doc_ref_id == 3 and sig.status == "sent"
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Implémenter l'endpoint + helpers** (`services/rental/app/main.py`) :

```python
def _owner_email(uid: int) -> str | None:
    acc = _user_lookup(uid)  # helper existant (identity)
    return acc.get("email") if acc else None


def _applicant_email_for_lease(db, l: Lease) -> str | None:
    ta = (db.query(TenantApplication)
          .filter(TenantApplication.property_id == l.property_id,
                  TenantApplication.applicant_user_id == l.tenant_user_id,
                  TenantApplication.status == "accepted").first())
    return ta.applicant_email if ta else None


def _owner_lease_pdf_bytes(db, l: Lease) -> bytes:
    return _lease_pdf_bytes(db, l)  # réutilise le générateur de PDF de bail existant


@app.post("/gestion-locative/owner/leases/{lease_id}/request-signature")
async def owner_request_lease_signature(lease_id: int, request: Request,
                                        principal: Principal = Depends(get_principal),
                                        db: Session = Depends(get_db)):
    if not principal.sub:
        return err("Authentification requise.", 401)
    uid = int(principal.sub)
    l = db.get(Lease, lease_id)
    if l is None or l.owner_id != uid:
        return err("Bail introuvable.", 404)
    if not signing.signing_enabled():
        return err("Signature électronique non configurée.", 400)
    # 1) Gate commission (fail-closed)
    try:
        decision = commission_client.gate(account_id=uid, deal_type="rental", source_ref=lease_id)
    except commission_client.CommissionUnavailable:
        return err("Vérification de facturation indisponible, réessayez.", 503)
    if decision.get("state") == "BLOCKED":
        return JSONResponse({"error": "Commission due avant signature.",
                             "pay_url": decision.get("pay_url")}, status_code=402)
    # 2) Lancer la e-signature (OPEN)
    data = await json_body(request)
    owner_email = _owner_email(uid)
    tenant_email = (data.get("tenant_email") or _applicant_email_for_lease(db, l) or "").strip()
    if not owner_email or not tenant_email:
        return err("Emails propriétaire et locataire requis.", 400)
    existing = (db.query(SignatureRequest)
                .filter(SignatureRequest.doc_type == "lease", SignatureRequest.doc_ref_id == lease_id).first())
    if existing is not None and existing.status not in ("declined", "voided", "expired"):
        return err("Signature déjà demandée.", 400)
    try:
        env = signing.create_envelope(f"Bail {l.reference or l.id}", f"rental:lease:{l.id}:owner:{uid}")
        docid, pages = signing.add_document(env, f"lease-{l.id}.pdf", _owner_lease_pdf_bytes(db, l))
        r1 = signing.add_recipient(env, owner_email, "Propriétaire", 1)
        r2 = signing.add_recipient(env, tenant_email, "Locataire", 2)
        signing.place_signature_field(env, docid, r1, pages, 72, 72)
        signing.place_signature_field(env, docid, r2, pages, 340, 72)
        signing.send_envelope(env)
    except signing.SigningError as e:
        return err(f"Échec de l'envoi en signature : {e}", 502)
    signers = json.dumps([{"name": "Propriétaire", "email": owner_email, "order": 1},
                          {"name": "Locataire", "email": tenant_email, "order": 2}])
    if existing is not None:
        existing.envelope_id, existing.document_id, existing.status = env, docid, "sent"
        existing.error, existing.signers, existing.signed_pdf_key = None, signers, None
        sig = existing
    else:
        sig = SignatureRequest(doc_type="lease", doc_ref_id=lease_id, agency_id=0,
                               envelope_id=env, document_id=docid, status="sent", signers=signers)
        db.add(sig)
    db.commit()
    return _sig_dict(db, sig)
```
Ajouter en tête de `main.py` : `from . import commission_client` (et `JSONResponse`, `json` déjà importés).

> Note `agency_id=0` : la colonne `SignatureRequest.agency_id` est NOT NULL ; pour un bail particulier on pose `0` (sentinelle « pas d'agence »). Le polling (Task 5) reconnaît un bail particulier par `Lease.owner_id` renseigné.

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/rental
git commit -m "feat(rental): bail particulier — gate commission (fail-closed) + e-signature"
```

---

### Task 5 : Complétion de signature du bail particulier → `rental.lease.signed` (+ void sur refus)

**Files:**
- Modify: `services/rental/app/main.py` (`poll_signatures` : gérer le bail particulier ; refus → `commission_client.void`)
- Test: `services/rental/tests/test_owner_lease_poll.py`

**Interfaces:**
- Produces: à la complétion d'un `SignatureRequest(doc_type="lease")` dont le `Lease.owner_id` est renseigné, `poll_signatures` marque le bail `active`/`signed_at`, stocke le PDF, et émet `rental.lease.signed` (payload via `_emit_lease`, incluant `account_id=owner_id`). Sur `declined/voided/expired` d'un bail particulier facturable, appelle `commission_client.void("rental", lease_id)`.

- [ ] **Step 1 : Test qui échoue** (`tests/test_owner_lease_poll.py`)

```python
import app.main as main
from app import models


def test_owner_lease_completion_emits_signed(db_session, monkeypatch):
    l = models.Lease(id=4, property_id=2, owner_id=5, tenant_user_id=10, reference="BP", status="draft")
    sig = models.SignatureRequest(id=1, doc_type="lease", doc_ref_id=4, agency_id=0,
                                  envelope_id="env", document_id="doc", status="sent")
    db_session.add_all([l, sig])
    db_session.commit()
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "get_status", lambda env: "completed")
    monkeypatch.setattr(main.signing, "fetch_signed_pdf", lambda e, d: b"%PDF-signed")
    import app.storage as storage
    monkeypatch.setattr(storage, "docs_storage", lambda: type("S", (), {"put": lambda self, *a: None})())
    emitted = []
    real = main.enqueue
    monkeypatch.setattr(main, "enqueue", lambda db, at, aid, et, p: emitted.append((et, p)))
    main.poll_signatures(x_internal_token=main.settings.internal_token, db=db_session)
    assert any(et == "rental.lease.signed" and p.get("account_id") == 5 for et, p in emitted)
    db_session.expire_all()
    assert db_session.get(models.Lease, 4).status == "active"
```

- [ ] **Step 2 : Lancer, échec attendu** (le polling ne reconnaît pas encore le bail particulier).

- [ ] **Step 3 : Étendre `poll_signatures`** — dans la construction du contexte de signature, gérer le cas particulier. Ajouter dans `_sig_context_by_agency` (ou une branche parallèle appelée par le polling) : lorsque `doc_type == "lease"` et que le `Lease.owner_id` est renseigné (bail particulier, `sig.agency_id == 0`), utiliser un contexte propriétaire :

```python
    if doc_type == "lease":
        l = db.get(Lease, doc_id)
        if l is None:
            return None
        if l.owner_id:  # bail particulier
            def mark(signed_key):
                l.status = "active"
                l.signed_at = datetime.utcnow()
                l.signed_pdf_key = signed_key
            return {"entity": l, "ready": True, "pdf_bytes_fn": lambda: _lease_pdf_bytes(db, l),
                    "counterparty_client_id": None, "title": f"Bail {l.reference or l.id}",
                    "ext_ref": f"rental:lease:{l.id}:owner", "mark_signed_fn": mark,
                    "event": events.LEASE_SIGNED,
                    "signed_payload": {"account_id": l.owner_id, "tenant_user_id": l.tenant_user_id,
                                       "rent_amount": num(l.rent_amount)}}
        # ... (branche agence existante inchangée, gardée telle quelle)
```

Et dans la boucle `poll_signatures`, sur la branche `elif st in ("in_progress", "declined", "voided", "expired")`, ajouter la libération commission pour un bail particulier facturable :

```python
        elif st in ("in_progress", "declined", "voided", "expired"):
            if st in ("declined", "voided", "expired") and sig.doc_type == "lease":
                l = db.get(Lease, sig.doc_ref_id)
                if l is not None and l.owner_id:
                    from . import commission_client
                    commission_client.void("rental", sig.doc_ref_id)
            sig.status = st
            updated += 1
```

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/rental
git commit -m "feat(rental): complétion bail particulier → rental.lease.signed + void sur refus"
```

---

### Task 6 : Câblage mesh — rental connaît commission ; test E2E de la boucle

**Files:**
- Modify: `scripts/dev-mesh-up.sh` (env `COMMISSION_URL` pour rental)
- Modify: `gateway/app/main.py` (routage `/api/v1/gestion-locative/owner/*` vers rental si non couvert)
- Create: `services/rental/tests/test_e2e_note.md` (procédure E2E manuelle)

- [ ] **Step 1 : `scripts/dev-mesh-up.sh`** — dans le `case "$svc"`, ajouter à `rental` : `COMMISSION_URL=http://localhost:8519`. Vérifier que `/api/v1/gestion-locative/*` route déjà vers rental dans le BFF (sinon, la règle existe déjà pour gestion-locative — les nouveaux sous-chemins `owner/*` en héritent).

- [ ] **Step 2 : Procédure E2E** (`services/rental/tests/test_e2e_note.md`) — documenter le scénario 2e affaire :

```
1. Poser SIGN_API_KEY (3a9dSign) et lancer le mesh + commission + payment.
2. Créer 2 candidatures acceptées pour un même propriétaire particulier (uid=P).
3. Bail #1 : POST /gestion-locative/owner/leases → request-signature → gate OPEN (1re offerte) → signer → poll → rental.lease.signed → commission compteur=1.
4. Bail #2 : request-signature → gate BLOCKED (402 + pay_url).
5. Payer via le lien CMI (webhook success) → payment.completed(purpose=commission).
6. request-signature de nouveau → gate OPEN → signer → poll → compteur=2.
Vérifier: GET /backoffice/commission/counters/P → concluded_count=2.
```

- [ ] **Step 3 : Vérifier bring-up**

Run: `bash scripts/dev-mesh-up.sh && curl -s localhost:8518/health && curl -s localhost:8519/health`
Expected: les deux `{"status":"ok"}`.

- [ ] **Step 4 : Commit**

```bash
git add scripts/dev-mesh-up.sh gateway services/rental
git commit -m "chore(mesh): rental → commission (COMMISSION_URL) + procédure E2E location"
```

---

## Self-Review

- **Couverture spec** : décision « flux bail particulier dédié » (`Lease.owner_id`, Mon espace, réutilise Lease+SignatureRequest+polling, `rental.lease.signed` porte account_id) → Tasks 1,3,4,5 ; §3.3/§6 (gate synchrone fail-closed) → Tasks 2,4 ; §7 (BLOCKED → pay_url) → Task 4 ; §8 (void sur refus) → Task 5.
- **Placeholders** : aucun. Les helpers réutilisés (`_user_lookup`, `_lease_pdf_bytes`, `_lease_dict`, `_sig_dict`, `num`, parsing date) existent déjà dans `rental/app/main.py` (vérifiés à l'exploration).
- **Cohérence des types** : `commission_client.gate` renvoie le contrat `{state, billable, pay_url, invoice_ref}` produit par le service commission (Plan P1-2 Task 3-4) ; `rental.lease.signed` porte `account_id=owner_id`, clé consommée par `commission/app/worker.py::_conclude` (Plan P1-2 Task 5) ; `deal_type="rental"` cohérent des deux côtés.
