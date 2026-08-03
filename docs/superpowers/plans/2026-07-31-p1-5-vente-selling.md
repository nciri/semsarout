# Plan P1-5 — Parcours vente (`services/selling`) + compromis e-signé marocain

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le parcours vente grand-public médié « demande d'achat → offre → acceptation → compromis e-signé », gaté par le moteur de commission, avec un **gabarit de compromis complet adapté au marché marocain**.

**Architecture:** Nouveau service FastAPI `services/selling` (port **8520**, schéma/rôle `selling`), outbox → RabbitMQ. Modèles `PurchaseInquiry`, `Offer`, `Compromis` + `SignatureRequest` (doc_type `compromis`, via `semsar_signing`). La commission est gatée à la préparation du compromis (même client `commission` fail-closed que rental). La complétion 3a9dSign émet `sale.compromis.signed` (event de conclusion vente). Le gabarit de compromis est ancré sur une **passe de recherche** (skill `deep-research`) validée juriste.

**Tech Stack:** FastAPI, SQLAlchemy, `semsar_signing`, `semsar_events`, `xhtml2pdf` (génération PDF, déjà utilisé par `contract`), `httpx`, pytest + SQLite.

## Global Constraints

- Port `selling` = **8520** ; schéma/rôle Postgres dédiés `selling` (ADR-0002). Devise **MAD**.
- Médiation : `PurchaseInquiry`/`Offer` ne portent **aucun** contact en clair ; la discussion passe par `messaging` (fil `sale_inquiry` amorcé sur `sale.inquiry.created`, cf. Plan P1-3 Task 3).
- Gate commission **fail-closed** ; ordre **paiement d'abord → signature ensuite** ; `deal_type="sale"`.
- `sale.compromis.signed` porte `account_id = seller_party` (consommé par `commission/app/worker.py`).
- **Gabarit compromis** : complet, marché marocain ; **doit être validé par un juriste** avant prod (risque tracé §11 spec).
- Conventional Commits ; pas d'attribution IA ; gate qualité vert avant « done ».
- **Dépend de** : Plan P1-1 (`semsar_signing`), Plan P1-2 (`commission`), Plan P1-3 (worker messaging consomme `sale.inquiry.created`).

---

### Task 1 : Scaffold du service `selling`

**Files:**
- Create: `services/selling/app/{__init__.py,config.py,db.py,util.py,models.py,events.py,main.py,relay.py}`
- Create: `services/selling/app/listing_client.py`, `services/selling/app/commission_client.py`
- Create: `services/selling/{pyproject.toml,.env.example}`, `services/selling/db/schema.sql`
- Create: `services/selling/tests/{conftest.py,test_health.py}`

**Interfaces:**
- Produces: app `app.main:app` (`GET /health`) ; `Base/SessionLocal/get_db/init_db` ; `err/iso/json_body` ; modèles `PurchaseInquiry`, `Offer`, `Compromis`, `SignatureRequest`, `ProcessedMessage` ; `listing_client.owner_of(property_id)` ; `commission_client.gate/void/CommissionUnavailable`.

- [ ] **Step 1 : `db.py`, `util.py`, `config.py`** — copies conformes à `services/commission` (Plan P1-2 Task 1) en remplaçant `commission` par `selling` (rôle/DB par défaut `selling:selling`). `db.py` inclut l'outbox (`OutboxBase`).

- [ ] **Step 2 : `models.py`** :

```python
"""Modèles du service selling (schéma `selling`)."""
from datetime import datetime

from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint,
)

from .db import Base


class PurchaseInquiry(Base):
    __tablename__ = "purchase_inquiry"
    __table_args__ = (UniqueConstraint("property_id", "buyer_party", name="uq_inquiry_buyer"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, nullable=False, index=True)
    seller_party = Column(Integer, index=True)      # propriétaire (uid opaque)
    buyer_party = Column(Integer, index=True)       # acheteur (uid opaque)
    status = Column(String(20), default="open")     # open|offer_pending|accepted|compromis_pending|concluded|withdrawn|rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Offer(Base):
    __tablename__ = "offer"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inquiry_id = Column(Integer, ForeignKey("purchase_inquiry.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="MAD")
    status = Column(String(20), default="pending")  # pending|accepted|rejected|countered
    created_at = Column(DateTime, default=datetime.utcnow)
    decided_at = Column(DateTime)


class Compromis(Base):
    __tablename__ = "compromis"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inquiry_id = Column(Integer, ForeignKey("purchase_inquiry.id"), nullable=False, index=True)
    accepted_offer_id = Column(Integer, ForeignKey("offer.id"))
    status = Column(String(20), default="draft")    # draft|sent|signed|voided
    payload = Column(Text)                           # JSON des données du compromis (parties, bien, prix…)
    signed_at = Column(DateTime)
    signed_pdf_key = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)


class SignatureRequest(Base):
    __tablename__ = "signature_request"
    __table_args__ = (UniqueConstraint("doc_type", "doc_ref_id", name="uq_selling_signature"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    doc_type = Column(String(20), nullable=False)    # compromis
    doc_ref_id = Column(Integer, nullable=False)
    envelope_id = Column(String(64))
    document_id = Column(String(64))
    status = Column(String(20), default="pending")
    signed_pdf_key = Column(String(255))
    signers = Column(Text)
    error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProcessedMessage(Base):
    __tablename__ = "processed_message"
    message_id = Column(String(64), primary_key=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3 : `events.py`** :

```python
"""Événements publiés par selling."""
INQUIRY_CREATED = "sale.inquiry.created"
OFFER_MADE = "sale.offer.made"
OFFER_ACCEPTED = "sale.offer.accepted"
COMPROMIS_SIGNED = "sale.compromis.signed"   # event de conclusion vente
```

- [ ] **Step 4 : `listing_client.py`** (résout le propriétaire d'un bien via l'endpoint interne listing/identity) :

```python
"""Résout le propriétaire (seller) d'un bien via listing."""
import os

import httpx

_LISTING_URL = os.environ.get("LISTING_URL", "http://localhost:8012")


def owner_of(property_id: int) -> int | None:
    try:
        r = httpx.get(f"{_LISTING_URL}/internal/properties/{property_id}/owner", timeout=6.0)
        if r.status_code == 200:
            return (r.json() or {}).get("owner_id")
    except httpx.HTTPError:
        return None
    return None
```
> Prérequis léger côté `listing` : exposer `GET /internal/properties/{id}/owner` → `{"owner_id": ...}` (endpoint interne trivial). L'ajouter dans ce même commit (Task 2 step d'appui) si absent.

- [ ] **Step 5 : `commission_client.py`** — copie identique à `services/rental/app/commission_client.py` (Plan P1-4 Task 2).

- [ ] **Step 6 : `main.py` (health), `relay.py`, `pyproject.toml`, `.env.example`, `db/schema.sql`** — sur le modèle `commission` (Plan P1-2 Task 1), en substituant `selling`/8520 et en ajoutant `xhtml2pdf>=0.2` + `LISTING_URL`/`COMMISSION_URL`/`SIGN_API_URL`/`SIGN_API_KEY` au `.env.example`. `pyproject.toml` `dependencies` ajoute `semsar-signing` et `xhtml2pdf>=0.2`.

- [ ] **Step 7 : `tests/conftest.py`** — copie du conftest commission (SQLite + override `get_db`/`get_principal`, principal `roles=["buyer"]`). `tests/test_health.py` : `test_health_ok`.

- [ ] **Step 8 : Lancer**

Run: `cd services/selling && python -m pytest tests/ -v`
Expected: `test_health_ok` PASS.

- [ ] **Step 9 : Commit**

```bash
git add services/selling
git commit -m "feat(selling): scaffold du service (modèles inquiry/offer/compromis, health)"
```

---

### Task 2 : Demande d'achat + offres (événements médiés)

**Files:**
- Modify: `services/selling/app/main.py`
- Modify: `services/listing/app/main.py` (endpoint interne `/internal/properties/{id}/owner` si absent)
- Test: `services/selling/tests/test_inquiry_offer.py`

**Interfaces:**
- Produces (auth requise) :
  - `POST /vente/purchase-inquiries` `{property_id}` → 201 ; résout `seller_party` via `listing_client.owner_of` ; `buyer_party` = uid ; émet `sale.inquiry.created` `{id, property_id, seller_party, buyer_party}`.
  - `POST /vente/purchase-inquiries/{id}/offers` `{amount}` (acheteur) → 201 ; `status=offer_pending` ; émet `sale.offer.made`.
  - `POST /vente/purchase-inquiries/{id}/offers/{oid}/accept` (vendeur) → `Offer.status=accepted`, `Inquiry.status=accepted` ; émet `sale.offer.accepted`.

- [ ] **Step 1 : Test qui échoue** (`tests/test_inquiry_offer.py`)

```python
import app.main as main
from app import models
from tests.conftest import make_client  # helper multi-uid (comme messaging)


def test_buyer_creates_inquiry_emits_event(db_session, monkeypatch):
    monkeypatch.setattr(main.listing_client, "owner_of", lambda pid: 5)
    buyer = make_client(db_session, uid="10")
    r = buyer.post("/vente/purchase-inquiries", json={"property_id": 2})
    assert r.status_code == 201
    inq = db_session.query(models.PurchaseInquiry).first()
    assert inq.seller_party == 5 and inq.buyer_party == 10
    from semsar_events import OutboxEvent
    assert db_session.query(OutboxEvent).filter_by(event_type="sale.inquiry.created").count() == 1


def test_offer_and_accept_flow(db_session, monkeypatch):
    monkeypatch.setattr(main.listing_client, "owner_of", lambda pid: 5)
    buyer = make_client(db_session, uid="10")
    inq_id = buyer.post("/vente/purchase-inquiries", json={"property_id": 2}).json()["inquiry"]["id"]
    oid = buyer.post(f"/vente/purchase-inquiries/{inq_id}/offers",
                     json={"amount": 900000}).json()["offer"]["id"]
    seller = make_client(db_session, uid="5")
    r = seller.post(f"/vente/purchase-inquiries/{inq_id}/offers/{oid}/accept")
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.get(models.Offer, oid).status == "accepted"
    assert db_session.get(models.PurchaseInquiry, inq_id).status == "accepted"
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Implémenter les endpoints** (`services/selling/app/main.py`) :

```python
from semsar_events import enqueue

from . import events, listing_client
from .models import Offer, PurchaseInquiry


def _uid(principal):
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


@app.post("/vente/purchase-inquiries", status_code=201)
async def create_inquiry(request: Request, principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if not principal.sub:
        return err("Authentification requise.", 401)
    data = await json_body(request)
    pid = data.get("property_id")
    if not pid:
        return err("property_id requis.", 400)
    seller = listing_client.owner_of(pid)
    inq = PurchaseInquiry(property_id=pid, seller_party=seller, buyer_party=_uid(principal),
                          status="open")
    db.add(inq)
    db.flush()
    enqueue(db, "purchase_inquiry", inq.id, events.INQUIRY_CREATED, {
        "id": inq.id, "property_id": pid, "seller_party": seller, "buyer_party": inq.buyer_party})
    db.commit()
    return {"inquiry": {"id": inq.id, "property_id": pid, "status": inq.status}}


@app.post("/vente/purchase-inquiries/{inquiry_id}/offers", status_code=201)
async def make_offer(inquiry_id: int, request: Request, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    inq = db.get(PurchaseInquiry, inquiry_id)
    if inq is None or inq.buyer_party != _uid(principal):
        return err("Demande introuvable.", 404)
    data = await json_body(request)
    try:
        amount = float(data["amount"])
    except (KeyError, TypeError, ValueError):
        return err("amount requis.", 400)
    o = Offer(inquiry_id=inquiry_id, amount=amount, status="pending")
    inq.status = "offer_pending"
    db.add(o)
    db.flush()
    enqueue(db, "offer", o.id, events.OFFER_MADE,
            {"id": o.id, "inquiry_id": inquiry_id, "amount": amount})
    db.commit()
    return {"offer": {"id": o.id, "amount": amount, "status": o.status}}


@app.post("/vente/purchase-inquiries/{inquiry_id}/offers/{offer_id}/accept")
def accept_offer(inquiry_id: int, offer_id: int, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    inq = db.get(PurchaseInquiry, inquiry_id)
    if inq is None or inq.seller_party != _uid(principal):
        return err("Demande introuvable.", 404)
    o = db.get(Offer, offer_id)
    if o is None or o.inquiry_id != inquiry_id:
        return err("Offre introuvable.", 404)
    from datetime import datetime
    o.status = "accepted"
    o.decided_at = datetime.utcnow()
    inq.status = "accepted"
    enqueue(db, "offer", o.id, events.OFFER_ACCEPTED,
            {"id": o.id, "inquiry_id": inquiry_id, "amount": float(o.amount)})
    db.commit()
    return {"offer": {"id": o.id, "status": o.status}}
```

- [ ] **Step 4 : Endpoint interne listing** (`services/listing/app/main.py`) — si absent :

```python
@app.get("/internal/properties/{property_id}/owner", include_in_schema=False)
def internal_owner(property_id: int, db: Session = Depends(get_db)):
    p = db.get(Property, property_id)
    return {"owner_id": p.owner_id if p else None}
```

- [ ] **Step 5 : Lancer les tests** → PASS.

- [ ] **Step 6 : Commit**

```bash
git add services/selling services/listing
git commit -m "feat(selling): demande d'achat + offres médiées (events sale.*)"
```

---

### Task 3 : Passe de recherche — normes du compromis de vente marocain

**Files:**
- Create: `docs/superpowers/references/2026-07-31-compromis-vente-maroc.md`

**Interfaces:** produit un document de référence (clauses, mentions obligatoires, fiscalité) consommé par le gabarit PDF (Task 4).

- [ ] **Step 1 : Invoquer le skill `deep-research`** avec la question :
  « Quelles sont les mentions obligatoires et clauses d'un compromis de vente immobilière au Maroc (bien avec titre foncier ANCFCC) : identification des parties, désignation du bien et origine de propriété, prix et arrhes, conditions suspensives (prêt, mainlevée d'hypothèque, préemption, quitus fiscal), situation hypothécaire, délai de réitération par acte authentique (notaire/adoul), répartition des frais et fiscalité (TPI vendeur, droits d'enregistrement, conservation foncière), clause pénale/dédit ? Sources : droit immobilier marocain, pratiques ANCFCC / adoul / notariat. »

- [ ] **Step 2 : Consigner** la synthèse citée dans `docs/superpowers/references/2026-07-31-compromis-vente-maroc.md`, structurée par section de clause (une section = un bloc du gabarit Task 4).

- [ ] **Step 3 : Marquer explicitement** en tête du document : « ⚠️ À FAIRE VALIDER PAR UN JURISTE MAROCAIN AVANT MISE EN PRODUCTION » (dépendance/risque §11 spec).

- [ ] **Step 4 : Commit**

```bash
git add docs/superpowers/references/2026-07-31-compromis-vente-maroc.md
git commit -m "docs(selling): références du compromis de vente marocain (deep-research)"
```

---

### Task 4 : Gabarit PDF du compromis (clauses marocaines complètes)

**Files:**
- Create: `services/selling/app/compromis_pdf.py`
- Create: `services/selling/app/templates/compromis.html`
- Test: `services/selling/tests/test_compromis_pdf.py`

**Interfaces:**
- Produces: `compromis_pdf.render(data: dict) -> bytes` (PDF). `data` couvre : `parties` (vendeur/acheteur : nom, CIN, adresse), `bien` (titre foncier/réquisition, consistance, superficie, situation, origine de propriété), `prix` (montant, arrhes, échéancier), `conditions_suspensives` (liste), `situation_hypothecaire`, `reiteration` (délai, acte authentique notaire/adoul), `frais_fiscalite` (TPI, enregistrement, conservation foncière), `clause_penale`, `election_domicile`, `droit_applicable`.

- [ ] **Step 1 : Test qui échoue** (`tests/test_compromis_pdf.py`)

```python
from app import compromis_pdf


def test_render_returns_pdf_bytes():
    data = {
        "parties": {"vendeur": {"nom": "A", "cin": "X1", "adresse": "Rabat"},
                    "acheteur": {"nom": "B", "cin": "Y2", "adresse": "Casa"}},
        "bien": {"titre_foncier": "12/3456", "consistance": "Appartement", "superficie": "90 m²",
                 "situation": "Casablanca", "origine_propriete": "acquisition 2015"},
        "prix": {"montant": 900000, "arrhes": 90000, "echeancier": "solde à l'acte"},
        "conditions_suspensives": ["obtention de prêt", "mainlevée d'hypothèque"],
        "situation_hypothecaire": "certificat de propriété du 2026-07-01",
        "reiteration": {"delai_jours": 60, "acte": "notaire"},
        "frais_fiscalite": {"tpi": "à la charge du vendeur", "enregistrement": "acheteur",
                            "conservation_fonciere": "acheteur"},
        "clause_penale": "10% du prix", "election_domicile": "au cabinet du notaire",
        "droit_applicable": "droit marocain",
    }
    out = compromis_pdf.render(data)
    assert out[:4] == b"%PDF"
    assert len(out) > 1000
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Créer `templates/compromis.html`** — gabarit HTML structuré par les sections de la Task 3 (parties, désignation du bien + origine de propriété, prix + arrhes + échéancier, conditions suspensives en liste, situation hypothécaire, réitération par acte authentique notaire/adoul + délai, frais & fiscalité TPI/enregistrement/conservation foncière, clause pénale, élection de domicile, droit applicable & juridiction). Placeholders `{{ ... }}` remplis depuis `data`. Le contenu juridique reprend le document de référence de la Task 3.

- [ ] **Step 4 : Créer `compromis_pdf.py`** (rendu HTML→PDF via `xhtml2pdf`, pattern du service `contract`) :

```python
"""Génération du PDF de compromis de vente (marché marocain). HTML→PDF via xhtml2pdf."""
import io
import os

from xhtml2pdf import pisa

_TEMPLATE = os.path.join(os.path.dirname(__file__), "templates", "compromis.html")


def _fill(html: str, data: dict) -> str:
    # rendu minimal par substitution (pas de dépendance à un moteur de templates externe)
    import json
    p = data.get("parties", {})
    bien = data.get("bien", {})
    prix = data.get("prix", {})
    reit = data.get("reiteration", {})
    frais = data.get("frais_fiscalite", {})
    repl = {
        "{{vendeur_nom}}": str(p.get("vendeur", {}).get("nom", "")),
        "{{vendeur_cin}}": str(p.get("vendeur", {}).get("cin", "")),
        "{{vendeur_adresse}}": str(p.get("vendeur", {}).get("adresse", "")),
        "{{acheteur_nom}}": str(p.get("acheteur", {}).get("nom", "")),
        "{{acheteur_cin}}": str(p.get("acheteur", {}).get("cin", "")),
        "{{acheteur_adresse}}": str(p.get("acheteur", {}).get("adresse", "")),
        "{{titre_foncier}}": str(bien.get("titre_foncier", "")),
        "{{consistance}}": str(bien.get("consistance", "")),
        "{{superficie}}": str(bien.get("superficie", "")),
        "{{situation}}": str(bien.get("situation", "")),
        "{{origine_propriete}}": str(bien.get("origine_propriete", "")),
        "{{prix_montant}}": str(prix.get("montant", "")),
        "{{prix_arrhes}}": str(prix.get("arrhes", "")),
        "{{prix_echeancier}}": str(prix.get("echeancier", "")),
        "{{conditions_suspensives}}": "".join(f"<li>{c}</li>" for c in data.get("conditions_suspensives", [])),
        "{{situation_hypothecaire}}": str(data.get("situation_hypothecaire", "")),
        "{{reiteration_delai}}": str(reit.get("delai_jours", "")),
        "{{reiteration_acte}}": str(reit.get("acte", "")),
        "{{frais_tpi}}": str(frais.get("tpi", "")),
        "{{frais_enregistrement}}": str(frais.get("enregistrement", "")),
        "{{frais_conservation}}": str(frais.get("conservation_fonciere", "")),
        "{{clause_penale}}": str(data.get("clause_penale", "")),
        "{{election_domicile}}": str(data.get("election_domicile", "")),
        "{{droit_applicable}}": str(data.get("droit_applicable", "droit marocain")),
    }
    for k, v in repl.items():
        html = html.replace(k, v)
    return html


def render(data: dict) -> bytes:
    with open(_TEMPLATE, encoding="utf-8") as f:
        html = _fill(f.read(), data)
    buf = io.BytesIO()
    pisa.CreatePDF(src=html, dest=buf, encoding="utf-8")
    return buf.getvalue()
```

- [ ] **Step 5 : Lancer les tests** → PASS (PDF non vide).

- [ ] **Step 6 : Commit**

```bash
git add services/selling
git commit -m "feat(selling): gabarit PDF de compromis de vente (clauses marocaines)"
```

---

### Task 5 : Préparation du compromis — gate + e-signature

**Files:**
- Modify: `services/selling/app/main.py` (endpoint `POST /vente/purchase-inquiries/{id}/compromis`)
- Test: `services/selling/tests/test_compromis_sign.py`

**Interfaces:**
- Consumes: `commission_client.gate(seller_party, "sale", compromis_id)` (fail-closed), `semsar_signing`, `compromis_pdf.render`.
- Produces: `POST /vente/purchase-inquiries/{id}/compromis` `{parties, bien, prix, ...}` (vendeur) :
  - crée le `Compromis` (status `draft`, payload = JSON des données) sur l'offre acceptée ;
  - `gate(seller_party, "sale", compromis_id)` : `BLOCKED` → **402** + `pay_url` (pas de signature) ; erreur → **503** ; `OPEN` → génère le PDF, ouvre l'enveloppe 3a9dSign (vendeur + acheteur), `SignatureRequest(doc_type="compromis", doc_ref_id=compromis_id)`, `Compromis.status="sent"`.

- [ ] **Step 1 : Test qui échoue** (`tests/test_compromis_sign.py`)

```python
import app.main as main
from app import models
from tests.conftest import make_client


def _accepted(db_session, seller=5, buyer=10):
    inq = models.PurchaseInquiry(id=1, property_id=2, seller_party=seller, buyer_party=buyer, status="accepted")
    off = models.Offer(id=1, inquiry_id=1, amount=900000, status="accepted")
    db_session.add_all([inq, off])
    db_session.commit()


_DATA = {"parties": {"vendeur": {"nom": "A"}, "acheteur": {"nom": "B"}},
         "bien": {"titre_foncier": "12/3", "superficie": "90"},
         "prix": {"montant": 900000}, "vendeur_email": "s@x.c", "acheteur_email": "b@x.c"}


def test_blocked_returns_402(db_session, monkeypatch):
    _accepted(db_session)
    monkeypatch.setattr(main.commission_client, "gate",
                        lambda **k: {"state": "BLOCKED", "pay_url": "/pay?ref=Z"})
    seller = make_client(db_session, uid="5")
    r = seller.post("/vente/purchase-inquiries/1/compromis", json=_DATA)
    assert r.status_code == 402 and r.json()["pay_url"] == "/pay?ref=Z"
    assert db_session.query(models.SignatureRequest).count() == 0


def test_open_generates_and_sends(db_session, monkeypatch):
    _accepted(db_session)
    monkeypatch.setattr(main.commission_client, "gate", lambda **k: {"state": "OPEN"})
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "create_envelope", lambda *a, **k: "env")
    monkeypatch.setattr(main.signing, "add_document", lambda *a, **k: ("doc", 1))
    monkeypatch.setattr(main.signing, "add_recipient", lambda *a, **k: "r")
    monkeypatch.setattr(main.signing, "place_signature_field", lambda *a, **k: None)
    monkeypatch.setattr(main.signing, "send_envelope", lambda *a, **k: None)
    monkeypatch.setattr(main.compromis_pdf, "render", lambda d: b"%PDF-")
    seller = make_client(db_session, uid="5")
    r = seller.post("/vente/purchase-inquiries/1/compromis", json=_DATA)
    assert r.status_code == 200
    sig = db_session.query(models.SignatureRequest).first()
    assert sig.doc_type == "compromis" and sig.status == "sent"
    assert db_session.query(models.Compromis).first().status == "sent"
```

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Implémenter** (`services/selling/app/main.py`) :

```python
import json

from fastapi.responses import JSONResponse

import semsar_signing as signing

from . import commission_client, compromis_pdf
from .models import Compromis, SignatureRequest


@app.post("/vente/purchase-inquiries/{inquiry_id}/compromis")
async def prepare_compromis(inquiry_id: int, request: Request,
                            principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    inq = db.get(PurchaseInquiry, inquiry_id)
    if inq is None or inq.seller_party != _uid(principal):
        return err("Demande introuvable.", 404)
    if inq.status != "accepted":
        return err("Une offre doit être acceptée avant le compromis.", 400)
    if not signing.signing_enabled():
        return err("Signature électronique non configurée.", 400)
    offer = (db.query(Offer).filter(Offer.inquiry_id == inquiry_id, Offer.status == "accepted").first())
    data = await json_body(request)
    c = db.query(Compromis).filter(Compromis.inquiry_id == inquiry_id).first()
    if c is None:
        c = Compromis(inquiry_id=inquiry_id, accepted_offer_id=offer.id if offer else None,
                      status="draft", payload=json.dumps(data))
        db.add(c)
        db.flush()
    # Gate commission (fail-closed)
    try:
        decision = commission_client.gate(account_id=inq.seller_party, deal_type="sale", source_ref=c.id)
    except commission_client.CommissionUnavailable:
        db.commit()
        return err("Vérification de facturation indisponible, réessayez.", 503)
    if decision.get("state") == "BLOCKED":
        db.commit()
        return JSONResponse({"error": "Commission due avant signature.",
                             "pay_url": decision.get("pay_url")}, status_code=402)
    # OPEN → PDF + e-signature
    vendeur_email = (data.get("vendeur_email") or "").strip()
    acheteur_email = (data.get("acheteur_email") or "").strip()
    if not vendeur_email or not acheteur_email:
        return err("Emails vendeur et acheteur requis.", 400)
    try:
        pdf = compromis_pdf.render(data)
        env = signing.create_envelope(f"Compromis {c.id}", f"sale:compromis:{c.id}")
        docid, pages = signing.add_document(env, f"compromis-{c.id}.pdf", pdf)
        r1 = signing.add_recipient(env, vendeur_email, "Vendeur", 1)
        r2 = signing.add_recipient(env, acheteur_email, "Acheteur", 2)
        signing.place_signature_field(env, docid, r1, pages, 72, 72)
        signing.place_signature_field(env, docid, r2, pages, 340, 72)
        signing.send_envelope(env)
    except signing.SigningError as e:
        return err(f"Échec de l'envoi en signature : {e}", 502)
    sig = SignatureRequest(doc_type="compromis", doc_ref_id=c.id, envelope_id=env,
                           document_id=docid, status="sent",
                           signers=json.dumps([{"name": "Vendeur", "email": vendeur_email, "order": 1},
                                               {"name": "Acheteur", "email": acheteur_email, "order": 2}]))
    c.status = "sent"
    inq.status = "compromis_pending"
    db.add(sig)
    db.commit()
    return {"compromis": {"id": c.id, "status": c.status}, "signature": {"status": sig.status}}
```

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/selling
git commit -m "feat(selling): préparation du compromis — gate commission + e-signature"
```

---

### Task 6 : Polling de complétion → `sale.compromis.signed` (+ void sur refus)

**Files:**
- Modify: `services/selling/app/main.py` (endpoint `POST /internal/signatures/poll`)
- Test: `services/selling/tests/test_compromis_poll.py`

**Interfaces:**
- Produces: `POST /internal/signatures/poll` (token interne) — interroge 3a9dSign ; sur `completed` d'un `compromis` : stocke le PDF signé, `Compromis.status="signed"`/`signed_at`, `Inquiry.status="concluded"`, émet `sale.compromis.signed` `{id: compromis_id, account_id: seller_party, inquiry_id, property_id}` ; sur `declined/voided/expired` : `commission_client.void("sale", compromis_id)`.

- [ ] **Step 1 : Test qui échoue** (`tests/test_compromis_poll.py`)

```python
import app.main as main
from app import models


def test_completion_emits_compromis_signed(db_session, monkeypatch):
    inq = models.PurchaseInquiry(id=1, property_id=2, seller_party=5, buyer_party=10, status="compromis_pending")
    c = models.Compromis(id=1, inquiry_id=1, status="sent")
    sig = models.SignatureRequest(id=1, doc_type="compromis", doc_ref_id=1,
                                  envelope_id="env", document_id="doc", status="sent")
    db_session.add_all([inq, c, sig])
    db_session.commit()
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "get_status", lambda e: "completed")
    monkeypatch.setattr(main.signing, "fetch_signed_pdf", lambda e, d: b"%PDF-s")
    import app.storage_stub as _  # si un stockage est requis, stubber comme rental
    emitted = []
    monkeypatch.setattr(main, "enqueue", lambda db, at, aid, et, p: emitted.append((et, p)))
    r = main.poll_signatures(x_internal_token=main.settings.internal_token, db=db_session)
    assert any(et == "sale.compromis.signed" and p.get("account_id") == 5 for et, p in emitted)
    db_session.expire_all()
    assert db_session.get(models.Compromis, 1).status == "signed"
    assert db_session.get(models.PurchaseInquiry, 1).status == "concluded"
```
> Le stockage du PDF signé peut réutiliser `semsar_storage` (comme rental/contract) ou être omis en dev ; dans le test, stubber l'écriture. Adapter l'import de stockage au module réellement utilisé par selling (défini en Task 1 `.env` `S3_*`).

- [ ] **Step 2 : Lancer, échec attendu**.

- [ ] **Step 3 : Implémenter `poll_signatures`** (pattern rental `poll_signatures`, cf. Plan de référence) :

```python
from datetime import datetime

from fastapi import Header

from . import events


@app.post("/internal/signatures/poll", include_in_schema=False)
def poll_signatures(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    if not signing.signing_enabled():
        return {"checked": 0}
    pending = db.query(SignatureRequest).filter(SignatureRequest.status.in_(("sent", "in_progress"))).all()
    updated = 0
    for sig in pending:
        try:
            st = signing.get_status(sig.envelope_id)
        except signing.SigningError:
            continue
        if st == sig.status:
            continue
        if st == "completed":
            c = db.get(Compromis, sig.doc_ref_id)
            inq = db.get(PurchaseInquiry, c.inquiry_id) if c else None
            signed_key = None
            try:
                data = signing.fetch_signed_pdf(sig.envelope_id, sig.document_id)
                signed_key = f"selling/compromis/{c.id}/signed.pdf"
                from semsar_storage import docs_storage  # ou le helper de stockage retenu en Task 1
                docs_storage().put(signed_key, data, "pdf")
            except Exception:  # noqa: BLE001
                signed_key = None
            sig.signed_pdf_key, sig.status = signed_key, "completed"
            if c is not None:
                c.status, c.signed_at, c.signed_pdf_key = "signed", datetime.utcnow(), signed_key
            if inq is not None:
                inq.status = "concluded"
                enqueue(db, "compromis", c.id, events.COMPROMIS_SIGNED, {
                    "id": c.id, "account_id": inq.seller_party, "inquiry_id": inq.id,
                    "property_id": inq.property_id})
            updated += 1
        elif st in ("in_progress", "declined", "voided", "expired"):
            if st in ("declined", "voided", "expired"):
                commission_client.void("sale", sig.doc_ref_id)
            sig.status = st
            updated += 1
    db.commit()
    return {"checked": len(pending), "updated": updated}
```

- [ ] **Step 4 : Lancer les tests** → PASS.

- [ ] **Step 5 : Commit**

```bash
git add services/selling
git commit -m "feat(selling): complétion compromis → sale.compromis.signed + void sur refus"
```

---

### Task 7 : Enregistrement mesh + gateway + polling programmé

**Files:**
- Modify: `scripts/dev-mesh-up.sh` (SVCS `selling:8520`, relay + BFF URL, santé, env LISTING/COMMISSION/SIGN)
- Modify: `gateway/app/config.py`, `gateway/app/main.py` (routage `/api/v1/vente/*`)
- Modify: le scheduler qui appelle `/internal/signatures/poll` (service notification) pour inclure selling

- [ ] **Step 1 : `scripts/dev-mesh-up.sh`** — ajouter `selling:8520` à `SVCS` ; ajouter `selling` à la boucle `relay` ; `case "$svc"` selling : `LISTING_URL=http://localhost:8012 COMMISSION_URL=http://localhost:8519 SIGN_API_URL=... SIGN_API_KEY=...` ; ajouter `SELLING_URL=http://localhost:8520` au bloc BFF ; ajouter `selling:8520` à la santé. (Pas de `worker` selling : il n'a pas de consumer d'events entrant dans P1.)

- [ ] **Step 2 : `gateway/app/config.py`** — `selling_url: str | None = None`.

- [ ] **Step 3 : `gateway/app/main.py`** — client `app.state.selling` + règle `_resolve_upstream` :

```python
    if settings.selling_url and path.startswith("/api/v1/vente"):
        return app.state.selling, path.replace("/api/v1", "", 1)
```

- [ ] **Step 4 : Polling programmé** — repérer où le scheduler notification appelle `POST {RENTAL_URL}/internal/signatures/poll` et ajouter un appel analogue vers `{SELLING_URL}/internal/signatures/poll` (même token interne, cadence ~60 s).

Run: `grep -rn "internal/signatures/poll" services/notification`

- [ ] **Step 5 : Vérifier bring-up + boucle vente**

Run:
```bash
psql "postgresql://postgres:postgres@localhost:5432/semsar_dev" -f services/selling/db/schema.sql
bash scripts/dev-mesh-up.sh
curl -s localhost:8520/health
```
Expected: `{"status":"ok","service":"selling"}`.

- [ ] **Step 6 : Commit**

```bash
git add scripts/dev-mesh-up.sh gateway services/notification
git commit -m "chore(mesh): enregistrer le service selling (mesh + gateway + polling)"
```

---

## Self-Review

- **Couverture spec** : §5.1 (PurchaseInquiry/Offer/Compromis, statuts) → Tasks 1-2,5 ; §5.2 (flux demande→offre→acceptation→compromis) → Tasks 2,5 ; §5.3 (events sale.*) → Tasks 2,6 ; §5.4 (client e-sign partagé) → Tasks 5-6 (import `semsar_signing`) ; §5.5 (gabarit marocain complet + validation juriste) → Tasks 3-4 ; §3.3/§7 (gate fail-closed, BLOCKED→pay_url) → Task 5 ; §8 (void sur refus) → Task 6 ; médiation via messaging (§4.3) → `sale.inquiry.created` consommé au Plan P1-3.
- **Placeholders** : le gabarit HTML (Task 4 step 3) est décrit par ses sections + rempli depuis le doc de référence Task 3 — contenu juridique ancré, pas « TODO ». Le stockage PDF signé référence `semsar_storage`/`docs_storage` (à confirmer au moment de l'exécution selon le helper réellement exposé, note explicite Task 6).
- **Cohérence des types** : `sale.inquiry.created` (`id, property_id, seller_party, buyer_party`) produit Task 2 = clés lues par le worker messaging (Plan P1-3 Task 3) ; `sale.compromis.signed` (`id, account_id=seller_party`) produit Task 6 = clés lues par `commission/app/worker.py::_conclude` (Plan P1-2 Task 5, `_DEAL_BY_KEY["sale.compromis.signed"]=("sale","id")`) ; `deal_type="sale"` cohérent gate/commission.
