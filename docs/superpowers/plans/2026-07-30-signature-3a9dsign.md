# Signature électronique 3a9dSign (EDL/décompte/bail/mandat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher la signature électronique **3a9dSign** sur les 4 documents locatifs (EDL entrée/sortie, décompte de caution, bail, mandat) via une **brique réutilisable** (client `signing.py` + entité `SignatureRequest` générique + polling), créer les **générateurs PDF bail/mandat** manquants, marquer les documents « signé » avec récupération du **PDF signé**, et l'UI back-office (`SignaturePanel`).

**Architecture:** Tout dans le service `rental` (+ emails côté `notification`). Un module client httpx vers 3a9dSign (auth `X-API-Key`, clé en env), une entité `SignatureRequest{doc_type, doc_ref_id, envelope_id, status, signed_pdf_key}` découplée, un endpoint interne de polling appelé par l'ordonnanceur qui, sur `completed`, télécharge le PDF signé et marque le document signé. Réutilise `pdf.py`, `storage` (S3), `enqueue`, `_gate`, endpoints internes à jeton.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, httpx (multipart), reportlab, S3/MinIO ; React 18 + react-query 3 + react-icons/fi + Tailwind. API 3a9dSign live `http://localhost:18000/api/v1` (clé de test sandbox).

## Global Constraints

- Service/schéma/rôle `rental` (port 8518). Erreurs `{"error": "..."}` via `err()`.
- **Contrat 3a9dSign** (référence détaillée : `scratchpad/3a9dsign-contract.md` — les implémenteurs DOIVENT le lire) :
  - Auth : en-tête `X-API-Key: <clé>` sur chaque appel `/api/v1/*`.
  - Flux : `POST /envelopes {title,routing_mode:"sequential",external_reference}` → `{id,status:"draft"}` ; `POST /envelopes/{id}/documents` **multipart** `file=<pdf>` (content-type exact `application/pdf`) → `{id(document_id),page_count,page_sizes}` ; `POST /envelopes/{id}/recipients {email,name,role:"signer",routing_order}` (un appel/destinataire) → `{id(recipient_id)}` ; `POST /envelopes/{id}/fields {document_id,recipient_id,field_type:"signature",page,x,y,width,height,required:true}` (≥1 champ requis avant send) ; `POST /envelopes/{id}/send {confirm:true}` → `status:"sent"` ; `GET /envelopes/{id}` → `status` (`draft→sent→in_progress→completed|declined|expired|voided`) ; `GET /envelopes/{id}/documents/{doc_id}/download` → `{url(présignée),expires_in}` (puis GET l'URL pour les octets ; sert le PDF signé une fois `completed`).
  - **Sandbox** (`ak_test_`) : aucune notification réelle → le lien de signature n'est **pas** récupérable par API. E2E pleinement testable **jusqu'à `send`** ; la complétion réelle nécessite une signature manuelle (hors sandbox) — voir les notes de test.
- **Secrets** : `SIGN_API_URL`, `SIGN_API_KEY` en **env** (`services/rental/.env` gitignoré + `.env.example` documente les noms). La clé n'apparaît **jamais** en dur, en log, ni dans un commit. Vérifier `git diff` avant chaque commit.
- Toute route back-office : `_gate(principal)` d'abord, puis cloisonnement `agency_id` (404). Endpoints internes à `x-internal-token`.
- Idempotence : `SignatureRequest` **UNIQUE(doc_type, doc_ref_id)** (une enveloppe par document).
- Signataires : **gestionnaire (ordre 1) + contrepartie (ordre 2)**, séquentiel. Contrepartie = locataire pour inventory/settlement/lease ; **bailleur** pour mandate.
- Devise `Đh`. Design SemsarOut : kit `components/backoffice/ui.jsx` + tokens, `react-icons/fi`, react-query + `react-toastify`, 403 → `GatedNotice`.
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. CRITIQUE : `git add` et `git commit` = appels Bash SÉPARÉS (jamais `&&` — un hook du repo produit un faux positif).
- DB dev = `semsar_dev`. Lancer un service via le paramètre Bash `run_in_background: true` (un `&` final est tué au retour). Restart `rental` après endpoints/tables ; restart le worker `notification` après la Task 5 ; `npm run build` après la Task 6. Env rental habituel + `SIGN_API_URL=http://localhost:18000/api/v1 SIGN_API_KEY=<clé de test fournie>`.

---

### Task 1: Config + client `signing.py` (3a9dSign)

**Files:**
- Create: `services/rental/app/signing.py`
- Modify: `services/rental/.env.example`

**Interfaces:**
- Produces: `signing.signing_enabled() -> bool`; `signing.create_envelope(title, external_reference) -> str`; `signing.add_document(env_id, filename, pdf_bytes) -> tuple[str, int]` (document_id, page_count); `signing.add_recipient(env_id, email, name, routing_order) -> str`; `signing.place_signature_field(env_id, document_id, recipient_id, page, x, y) -> None`; `signing.send_envelope(env_id) -> None`; `signing.get_status(env_id) -> str`; `signing.fetch_signed_pdf(env_id, document_id) -> bytes`. Raises `signing.SigningError(str)` on API failure.

- [ ] **Step 1: `.env.example`** — ajouter (documenter les noms, PAS de vraie clé) :
```
# Signature électronique 3a9dSign
SIGN_API_URL=http://localhost:18000/api/v1
SIGN_API_KEY=
```

- [ ] **Step 2: `signing.py`** — créer `services/rental/app/signing.py` (lire d'abord `scratchpad/3a9dsign-contract.md` §2 pour les shapes exactes)
```python
"""Client 3a9dSign (signature électronique). Auth = en-tête X-API-Key (clé en env, jamais loggée)."""
import os

import httpx


class SigningError(Exception):
    pass


def _base() -> str:
    return os.environ.get("SIGN_API_URL", "http://localhost:18000/api/v1").rstrip("/")


def _key() -> str:
    return os.environ.get("SIGN_API_KEY", "")


def signing_enabled() -> bool:
    return bool(_key())


def _headers() -> dict:
    return {"X-API-Key": _key()}


def _client() -> httpx.Client:
    return httpx.Client(base_url=_base(), headers=_headers(), timeout=20.0)


def create_envelope(title: str, external_reference: str) -> str:
    with _client() as c:
        r = c.post("/envelopes", json={"title": title[:255], "routing_mode": "sequential",
                                       "external_reference": external_reference})
    if r.status_code >= 300:
        raise SigningError(f"create_envelope {r.status_code}")
    return r.json()["id"]


def add_document(env_id: str, filename: str, pdf_bytes: bytes):
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/documents",
                   files={"file": (filename, pdf_bytes, "application/pdf")})
    if r.status_code >= 300:
        raise SigningError(f"add_document {r.status_code}")
    d = r.json()
    return d["id"], int(d.get("page_count") or 1)


def add_recipient(env_id: str, email: str, name: str, routing_order: int) -> str:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/recipients",
                   json={"email": email, "name": name, "role": "signer", "routing_order": routing_order})
    if r.status_code >= 300:
        raise SigningError(f"add_recipient {r.status_code}")
    return r.json()["id"]


def place_signature_field(env_id: str, document_id: str, recipient_id: str, page: int, x: float, y: float) -> None:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/fields",
                   json={"document_id": document_id, "recipient_id": recipient_id,
                         "field_type": "signature", "page": page, "x": x, "y": y,
                         "width": 150, "height": 40, "required": True})
    if r.status_code >= 300:
        raise SigningError(f"place_field {r.status_code}")


def send_envelope(env_id: str) -> None:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/send", json={"confirm": True})
    if r.status_code >= 300:
        raise SigningError(f"send {r.status_code}")


def get_status(env_id: str) -> str:
    with _client() as c:
        r = c.get(f"/envelopes/{env_id}")
    if r.status_code >= 300:
        raise SigningError(f"get_status {r.status_code}")
    return r.json().get("status", "")


def fetch_signed_pdf(env_id: str, document_id: str) -> bytes:
    with _client() as c:
        r = c.get(f"/envelopes/{env_id}/documents/{document_id}/download")
        if r.status_code >= 300:
            raise SigningError(f"download {r.status_code}")
        url = r.json()["url"]
        # l'URL présignée pointe MinIO (host docker) ; réécrire vers localhost en dev si besoin
        url = url.replace("http://minio:9000", os.environ.get("S3_ENDPOINT_URL", "http://localhost:9000"))
        rr = httpx.get(url, timeout=30.0)
    if rr.status_code >= 300:
        raise SigningError(f"download_bytes {rr.status_code}")
    return rr.content
```

- [ ] **Step 3: Vérifier contre l'API sandbox live** (clé de test fournie par l'utilisateur — l'exporter en env, NE PAS l'écrire dans un fichier committé)
```bash
cd /home/younes/Documents/work/0semsar
export SIGN_API_URL=http://localhost:18000/api/v1
export SIGN_API_KEY='<clé ak_test fournie>'
# petit PDF de test
python3 -c "from reportlab.pdfgen import canvas; c=canvas.Canvas('/tmp/t.pdf'); c.drawString(72,72,'test'); c.save()"
PYTHONPATH=services/rental python3 -c "
from app import signing
print('enabled', signing.signing_enabled())
env = signing.create_envelope('Test SemsarOut', 'rental:test:0:0'); print('env', env)
doc, pages = signing.add_document(env, 'test.pdf', open('/tmp/t.pdf','rb').read()); print('doc', doc, 'pages', pages)
r1 = signing.add_recipient(env, 'gestion@example.com', 'Gestionnaire', 1); print('r1', r1)
r2 = signing.add_recipient(env, 'loc@example.com', 'Locataire', 2); print('r2', r2)
signing.place_signature_field(env, doc, r1, pages, 72, 72)
signing.place_signature_field(env, doc, r2, pages, 340, 72)
signing.send_envelope(env); print('status after send', signing.get_status(env))
"
```
Expected : `enabled True`, un env id, un doc id + `pages 1`, 2 recipient ids, et `status after send sent`. (La complétion réelle n'est pas testable en sandbox — pas de lien récupérable ; c'est attendu.) Confirmer aussi qu'avec `SIGN_API_KEY` vide, `signing_enabled()` renvoie False.

- [ ] **Step 4: Commit** (vérifier `git diff` — aucune clé)
```bash
git add services/rental/app/signing.py services/rental/.env.example
```
```bash
git commit -m "feat(rental): client 3a9dSign (enveloppe/document/destinataires/champs/envoi/statut)"
```

---

### Task 2: Générateurs PDF bail + mandat + endpoints `.pdf`

**Files:**
- Modify: `services/rental/app/pdf.py` (`render_lease_pdf`, `render_mandate_pdf`)
- Modify: `services/rental/app/main.py` (endpoints `.pdf` + helpers bytes)

**Interfaces:**
- Produces: `pdf.render_lease_pdf(lease, mandate, tenant_name, landlord_name, property_title)`; `pdf.render_mandate_pdf(mandate, landlord_name, property_title)`; `_lease_pdf_bytes(db, lease)`, `_mandate_pdf_bytes(db, mandate)`; `GET /…/leases/{id}.pdf`, `GET /…/mandates/{id}.pdf`.

- [ ] **Step 1: PDF bail + mandat** — dans `services/rental/app/pdf.py` (mirror `render_receipt_pdf`)
```python
def render_lease_pdf(lease, mandate, tenant_name: str, landlord_name: str, property_title: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("H", parent=styles["Heading1"], fontSize=22,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=10)
    info = ParagraphStyle("I", parent=styles["Normal"], fontSize=10, leading=16)

    def money(v):
        return f"{float(v or 0):,.2f} Đh".replace(",", " ")

    def d(dt):
        return dt.strftime("%d/%m/%Y") if dt else "-"

    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 18),
        Paragraph(f"<b>CONTRAT DE BAIL</b> {lease.reference or ''}", head),
        Paragraph(f"Bailleur : {landlord_name or '-'}", info),
        Paragraph(f"Locataire : {tenant_name or '-'}", info),
        Paragraph(f"Bien : {property_title or '-'}", info),
        Spacer(1, 10),
        Paragraph(f"Loyer mensuel : {money(lease.rent_amount)}", info),
        Paragraph(f"Charges : {money(lease.charges_amount)}", info),
        Paragraph(f"Dépôt de garantie : {money(lease.deposit_amount)}", info),
        Paragraph(f"Jour d'échéance : le {lease.payment_day or 1} de chaque mois", info),
        Paragraph(f"Période : du {d(lease.start_date)} au {d(lease.end_date)}", info),
        Spacer(1, 14),
        Paragraph("Fait pour signature électronique via SemsarOut / 3a9dSign.", info),
    ]
    doc.build(story)
    return buf.getvalue()


def render_mandate_pdf(mandate, landlord_name: str, property_title: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("H", parent=styles["Heading1"], fontSize=22,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=10)
    info = ParagraphStyle("I", parent=styles["Normal"], fontSize=10, leading=16)

    def d(dt):
        return dt.strftime("%d/%m/%Y") if dt else "-"

    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 18),
        Paragraph(f"<b>MANDAT DE {(mandate.mandate_type or 'gestion').upper()}</b> {mandate.reference or ''}", head),
        Paragraph(f"Mandant (bailleur) : {landlord_name or '-'}", info),
        Paragraph(f"Bien : {property_title or '-'}", info),
        Paragraph(f"Type de mandat : {mandate.mandate_type or '-'}", info),
        Paragraph(f"Honoraires : {float(mandate.fee_percent or 0):.2f} %", info),
        Paragraph(f"Période : du {d(mandate.start_date)} au {d(mandate.end_date)}", info),
        Spacer(1, 14),
        Paragraph("Fait pour signature électronique via SemsarOut / 3a9dSign.", info),
    ]
    doc.build(story)
    return buf.getvalue()
```

- [ ] **Step 2: Helpers bytes + endpoints `.pdf`** — dans `main.py`
```python
def _lease_pdf_bytes(db, lease):
    mandate = db.get(Mandate, lease.mandate_id)
    tenant = db.get(ClientRO, lease.tenant_client_id)
    landlord = db.get(ClientRO, mandate.landlord_client_id) if mandate else None
    prop = db.get(PropertyRO, lease.property_id)
    from . import pdf as pdf_mod
    return pdf_mod.render_lease_pdf(
        lease, mandate,
        tenant_name=(f"{tenant.first_name} {tenant.last_name}" if tenant else None),
        landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        property_title=(prop.title if prop else None))


def _mandate_pdf_bytes(db, mandate):
    landlord = db.get(ClientRO, mandate.landlord_client_id)
    prop = db.get(PropertyRO, mandate.property_id)
    from . import pdf as pdf_mod
    return pdf_mod.render_mandate_pdf(
        mandate, landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        property_title=(prop.title if prop else None))


@app.get("/backoffice/gestion-locative/leases/{lease_id}.pdf")
def lease_pdf(lease_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    return Response(_lease_pdf_bytes(db, l), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=bail-{lease_id}.pdf"})


@app.get("/backoffice/gestion-locative/mandates/{mandate_id}.pdf")
def mandate_pdf(mandate_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    m = db.get(Mandate, mandate_id)
    if m is None or m.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    return Response(_mandate_pdf_bytes(db, m), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=mandat-{mandate_id}.pdf"})
```
> Placer ces routes `.pdf` près des autres `leases/*`/`mandates/*`. Si un 422 apparaît sur `{id}.pdf` à cause d'une route `leases/{id}` bare, déplacer la route `.pdf` avant elle.

- [ ] **Step 3: Vérifier** — restart rental. `GET /…/leases/16.pdf` et `/…/mandates/{id}.pdf` (agence 1) → `application/pdf`, taille > 1000, `file` = PDF. Cross-agency → 404.

- [ ] **Step 4: Commit**
```bash
git add services/rental/app/pdf.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): générateurs PDF bail + mandat + endpoints .pdf"
```

---

### Task 3: `SignatureRequest` + résolveur générique + endpoints envoi/statut/PDF signé

**Files:**
- Modify: `services/rental/app/models.py` (`SignatureRequest`)
- Modify: `services/rental/app/events.py` (`INVENTORY_SIGNED`, `SETTLEMENT_SIGNED`)
- Modify: `services/rental/app/main.py` (résolveur + endpoints)

**Interfaces:**
- Produces: `models.SignatureRequest`; `_SIG_DOCS` resolver + `_sig_context(db, doc_type, doc_id, principal)`; `POST /…/{doc_type}/{id}/request-signature`; `GET /…/signatures/{doc_type}/{id}`; `GET /…/signatures/{sig_id}/signed.pdf`; `GET /internal/signatures/{sig_id}/signed.pdf`. Consumes Task 1 `signing.*`, Task 2 pdf helpers, Phase A/B `_inventory_dict`-pdf + `_settlement_pdf_bytes`.

- [ ] **Step 1: Modèle** — dans `models.py`
```python
class SignatureRequest(Base):
    __tablename__ = "signature_request"
    __table_args__ = (UniqueConstraint("doc_type", "doc_ref_id", name="uq_signature_doc"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    doc_type = Column(String(20), nullable=False)            # inventory|settlement|lease|mandate
    doc_ref_id = Column(Integer, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    envelope_id = Column(String(64))
    document_id = Column(String(64))
    status = Column(String(20), default="pending")           # pending|sent|in_progress|completed|declined|voided|expired
    signed_pdf_key = Column(String(255))
    signers = Column(Text)                                    # JSON [{name,email,order}]
    error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 2: Événements** — dans `events.py` :
```python
INVENTORY_SIGNED = "rental.inventory.signed"
SETTLEMENT_SIGNED = "rental.settlement.signed"
```
(`LEASE_SIGNED`/`MANDATE_SIGNED` existent déjà.)

- [ ] **Step 3: Résolveur générique** — dans `main.py` (ajouter `SignatureRequest` à l'import models, `json` en import si absent). Le résolveur renvoie, pour un doc_type+id détenu par l'agence : l'entité, si elle est « prête » à signer, ses octets PDF, l'id client de la **contrepartie** (locataire ou bailleur), le titre d'enveloppe, et une fonction d'effet « signé ».
```python
import json  # si absent en tête de fichier

def _sig_context(db, doc_type: str, doc_id: int, principal: Principal):
    """Retourne dict{entity, ready, pdf_bytes_fn, counterparty_client_id, title, ext_ref, mark_signed_fn, event}
    ou None si introuvable/mauvaise agence. `ready` False si le doc doit d'abord être finalisé."""
    if doc_type == "inventory":
        inv = _owned_inventory(db, doc_id, principal)
        if inv is None:
            return None
        lease = db.get(Lease, inv.lease_id)
        def mark(signed_key):
            inv.status = "signed"; inv.signed_at = datetime.utcnow()
            inv.pdf_key = signed_key or inv.pdf_key
        return {"entity": inv, "ready": inv.status in ("finalized", "signed"),
                "pdf_bytes_fn": lambda: _settlement_or_inventory_pdf(db, inv),
                "counterparty_client_id": lease.tenant_client_id if lease else None,
                "title": f"État des lieux {inv.type} — bail {inv.lease_id}",
                "ext_ref": f"rental:inventory:{inv.id}:{principal.agency_id}",
                "mark_signed_fn": mark, "event": events.INVENTORY_SIGNED}
    if doc_type == "settlement":
        s = _owned_settlement(db, doc_id, principal)
        if s is None:
            return None
        lease = db.get(Lease, s.lease_id)
        def mark(signed_key):
            s.signed_at = datetime.utcnow(); s.signed_pdf_key = signed_key
        return {"entity": s, "ready": s.status == "finalized",
                "pdf_bytes_fn": lambda: _settlement_pdf_bytes(db, s),
                "counterparty_client_id": lease.tenant_client_id if lease else None,
                "title": f"Décompte de caution — bail {s.lease_id}",
                "ext_ref": f"rental:settlement:{s.id}:{principal.agency_id}",
                "mark_signed_fn": mark, "event": events.SETTLEMENT_SIGNED}
    if doc_type == "lease":
        l = db.get(Lease, doc_id)
        if l is None or l.agency_id != principal.agency_id:
            return None
        def mark(signed_key):
            l.signed_at = datetime.utcnow(); l.signed_pdf_key = signed_key
        return {"entity": l, "ready": True, "pdf_bytes_fn": lambda: _lease_pdf_bytes(db, l),
                "counterparty_client_id": l.tenant_client_id,
                "title": f"Bail {l.reference or l.id}",
                "ext_ref": f"rental:lease:{l.id}:{principal.agency_id}",
                "mark_signed_fn": mark, "event": events.LEASE_SIGNED}
    if doc_type == "mandate":
        m = db.get(Mandate, doc_id)
        if m is None or m.agency_id != principal.agency_id:
            return None
        def mark(signed_key):
            m.signed_at = datetime.utcnow(); m.signed_pdf_key = signed_key
        return {"entity": m, "ready": True, "pdf_bytes_fn": lambda: _mandate_pdf_bytes(db, m),
                "counterparty_client_id": m.landlord_client_id,  # bailleur, pas locataire
                "title": f"Mandat {m.reference or m.id}",
                "ext_ref": f"rental:mandate:{m.id}:{principal.agency_id}",
                "mark_signed_fn": mark, "event": events.MANDATE_SIGNED}
    return None
```
> **Note d'implémentation** : `_settlement_or_inventory_pdf(db, inv)` = le rendu PDF de l'EDL. Réutiliser le rendu existant de Phase A : si un helper `_inventory_pdf_bytes` existe, l'appeler ; sinon, extraire le rendu inline de l'endpoint `inventory_pdf` (Phase A) dans un helper `_inventory_pdf_bytes(db, inv)` et l'appeler ici **et** dans l'endpoint `inventory_pdf` (pas de duplication). Vérifier le nom réel dans `main.py`.
> **Colonnes `signed_pdf_key`** : ajouter `signed_pdf_key = Column(String(255))` à `Lease`, `Mandate` (déjà à `DepositSettlement` en Task ? sinon l'ajouter). `DepositSettlement.signed_at`/`signed_pdf_key` : ajouter à `models.py` si absents. Recréer les tables (init_db ajoute les colonnes manquantes uniquement sur tables neuves — pour des colonnes sur tables existantes, exécuter un `ALTER TABLE` :
> `PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "ALTER TABLE rental.lease ADD COLUMN IF NOT EXISTS signed_pdf_key varchar(255); ALTER TABLE rental.mandate ADD COLUMN IF NOT EXISTS signed_pdf_key varchar(255); ALTER TABLE rental.deposit_settlement ADD COLUMN IF NOT EXISTS signed_at timestamp, ADD COLUMN IF NOT EXISTS signed_pdf_key varchar(255);"`)

- [ ] **Step 4: Endpoints envoi + statut + PDF signé** — dans `main.py`
```python
_DOC_TYPES = ("inventory", "settlement", "lease", "mandate")


def _sig_dict(db, sig):
    return {"id": sig.id, "doc_type": sig.doc_type, "doc_ref_id": sig.doc_ref_id,
            "status": sig.status, "has_signed_pdf": bool(sig.signed_pdf_key),
            "signers": json.loads(sig.signers) if sig.signers else [], "error": sig.error}


@app.post("/backoffice/gestion-locative/{doc_type}/{doc_id}/request-signature")
async def request_signature(doc_type: str, doc_id: int, request: Request,
                            principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    if doc_type not in _DOC_TYPES:
        return err("Type de document invalide.", 400)
    if not signing.signing_enabled():
        return err("Signature électronique non configurée.", 400)
    ctx = _sig_context(db, doc_type, doc_id, principal)
    if ctx is None:
        return err("Document introuvable.", 404)
    if not ctx["ready"]:
        return err("Le document doit être finalisé avant signature.", 400)
    existing = (db.query(SignatureRequest)
                .filter(SignatureRequest.doc_type == doc_type, SignatureRequest.doc_ref_id == doc_id).first())
    if existing is not None and existing.status not in ("declined", "voided", "expired"):
        return err("Signature déjà demandée pour ce document.", 400)
    data = await json_body(request)
    manager_email = (data.get("manager_email") or "").strip()
    manager_name = (data.get("manager_name") or "Gestionnaire").strip()
    if not manager_email:
        return err("Email du gestionnaire requis.", 400)
    cp = _crm_client(ctx["counterparty_client_id"])   # {email, name}
    if not cp.get("email"):
        return err("Email de la contrepartie introuvable.", 400)
    try:
        env = signing.create_envelope(ctx["title"], ctx["ext_ref"])
        pdf_bytes = ctx["pdf_bytes_fn"]()
        docid, pages = signing.add_document(env, f"{doc_type}-{doc_id}.pdf", pdf_bytes)
        r1 = signing.add_recipient(env, manager_email, manager_name, 1)
        r2 = signing.add_recipient(env, cp["email"], cp.get("name") or "Signataire", 2)
        signing.place_signature_field(env, docid, r1, pages, 72, 72)
        signing.place_signature_field(env, docid, r2, pages, 340, 72)
        signing.send_envelope(env)
    except signing.SigningError as e:
        return err(f"Échec de l'envoi en signature : {e}", 502)
    signers = [{"name": manager_name, "email": manager_email, "order": 1},
               {"name": cp.get("name"), "email": cp["email"], "order": 2}]
    if existing is not None:
        sig = existing
        sig.envelope_id, sig.document_id, sig.status, sig.error = env, docid, "sent", None
        sig.signers, sig.signed_pdf_key = json.dumps(signers), None
    else:
        sig = SignatureRequest(doc_type=doc_type, doc_ref_id=doc_id, agency_id=principal.agency_id,
                               envelope_id=env, document_id=docid, status="sent", signers=json.dumps(signers))
        db.add(sig)
    db.commit()
    return _sig_dict(db, sig)


@app.get("/backoffice/gestion-locative/signatures/{doc_type}/{doc_id}")
def get_signature(doc_type: str, doc_id: int, principal: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    sig = (db.query(SignatureRequest).filter(SignatureRequest.doc_type == doc_type,
           SignatureRequest.doc_ref_id == doc_id, SignatureRequest.agency_id == principal.agency_id).first())
    if sig is None:
        return err("Aucune demande de signature.", 404)
    return _sig_dict(db, sig)


@app.get("/backoffice/gestion-locative/signatures/{sig_id}/signed.pdf")
def signed_pdf(sig_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    sig = db.get(SignatureRequest, sig_id)
    if sig is None or sig.agency_id != principal.agency_id:
        return err("Signature introuvable.", 404)
    if not sig.signed_pdf_key:
        return err("Document signé indisponible.", 404)
    from . import storage
    data = storage.docs_storage().get(sig.signed_pdf_key)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=signe-{sig.doc_type}-{sig.doc_ref_id}.pdf"})


@app.get("/internal/signatures/{sig_id}/signed.pdf", include_in_schema=False)
def internal_signed_pdf(sig_id: int, x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    sig = db.get(SignatureRequest, sig_id)
    if sig is None or not sig.signed_pdf_key:
        return err("Indisponible.", 404)
    from . import storage
    data = storage.docs_storage().get(sig.signed_pdf_key)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=signe-{sig_id}.pdf"})
```
> **`_crm_client(client_id)`** : helper qui récupère `{email, name}` via l'endpoint interne crm (comme `notification` le fait). Vérifier l'URL exacte : crm `GET /internal/client/{id}` (avec `x-internal-token`), et si le champ email n'y est pas, l'ajouter côté crm ou utiliser l'endpoint que `notification/recipients.py` utilise. Écrire `_crm_client` sur ce patron (httpx GET `CRM_URL/internal/client/{id}` header `x-internal-token`, retourne `{}` si échec). Si l'email n'est pas disponible, l'endpoint renvoie 400 proprement.

- [ ] **Step 5: Créer la table + colonnes + vérifier** — `init_db` + les `ALTER TABLE` du Step 3. Restart rental (avec `SIGN_API_URL`/`SIGN_API_KEY` en env). Sur un EDL **finalisé** (agence 1), `POST /…/inventory/{id}/request-signature -d '{"manager_email":"gestion@example.com","manager_name":"Agent"}'` → l'enveloppe est créée+envoyée (status `sent`), `SignatureRequest` en base. Répéter → 400 (déjà demandé). EDL non finalisé → 400. `mandate` (contrepartie = bailleur) → enveloppe créée. Cross-agency → 404. `GET /…/signatures/inventory/{id}` → statut. (La complétion réelle n'étant pas pilotable en sandbox, `signed.pdf` renverra 404 tant que non signé — attendu.)

- [ ] **Step 6: Commit**
```bash
git add services/rental/app/models.py services/rental/app/events.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): demande de signature générique (EDL/décompte/bail/mandat) + statut + PDF signé"
```

---

### Task 4: Polling de complétion + effet « signé » + ordonnanceur

**Files:**
- Modify: `services/rental/app/main.py` (endpoint interne poll)
- Modify: `services/rental/app/scheduler.py` (appel périodique)
- Modify: `scripts/dev-mesh-up.sh` (si le scheduler a besoin de `SIGN_*` en env)

**Interfaces:**
- Produces: `POST /internal/signatures/poll` (token-auth) ; boucle scheduler.

- [ ] **Step 1: Endpoint poll** — dans `main.py` (traite les demandes en cours, marque signé, émet l'événement)
```python
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
            # récupérer le PDF signé + marquer le document signé
            principal_agency = sig.agency_id
            ctx = _sig_context_by_agency(db, sig.doc_type, sig.doc_ref_id, principal_agency)
            signed_key = None
            try:
                data = signing.fetch_signed_pdf(sig.envelope_id, sig.document_id)
                from . import storage
                signed_key = f"signatures/{sig.id}/signed.pdf"
                storage.docs_storage().put(signed_key, data, "pdf")
            except signing.SigningError:
                signed_key = None
            sig.signed_pdf_key = signed_key
            sig.status = "completed"
            if ctx is not None:
                ctx["mark_signed_fn"](signed_key)
                enqueue(db, sig.doc_type, sig.doc_ref_id, ctx["event"], {
                    "id": sig.doc_ref_id, "signature_id": sig.id, "doc_type": sig.doc_type})
            updated += 1
        elif st in ("in_progress", "declined", "voided", "expired"):
            sig.status = st
            updated += 1
    db.commit()
    return {"checked": len(pending), "updated": updated}
```
> **`_sig_context_by_agency(db, doc_type, doc_id, agency_id)`** : variante de `_sig_context` qui prend un `agency_id` (le polling n'a pas de `principal`). Factoriser : faire de `_sig_context` un wrapper qui passe `principal.agency_id` à une fonction `_sig_context_by_agency(db, doc_type, doc_id, agency_id)`, et adapter les vérifs d'appartenance (`entity.agency_id == agency_id`). Utiliser `_owned_*` seulement dans le wrapper à `principal` ; la version `by_agency` compare directement `agency_id`.

- [ ] **Step 2: Appel scheduler** — dans `services/rental/app/scheduler.py`, ajouter à la boucle existante un appel périodique (toutes ~60 s) à `POST /internal/signatures/poll` avec `x-internal-token` (mirror des autres appels internes du scheduler — mandats/loyers). Lire le fichier pour suivre le patron exact (httpx local + `INTERNAL_TOKEN`). Le scheduler doit avoir `SIGN_API_URL`/`SIGN_API_KEY` en env s'il appelle rental (non — c'est rental qui appelle 3a9dSign ; le scheduler ne fait qu'appeler l'endpoint interne de rental, donc pas besoin des SIGN_* côté scheduler, mais rental oui).

- [ ] **Step 3: Env rental dans le mesh** — dans `scripts/dev-mesh-up.sh`, ajouter `SIGN_API_URL` + `SIGN_API_KEY` au bloc de lancement du service **rental** (lire depuis l'environnement / `services/rental/.env`, **pas** en dur dans le script). Vérifier que `.env` n'est pas committé.

- [ ] **Step 4: Vérifier** — restart rental. `POST /internal/signatures/poll` avec le bon token → `{checked, updated}` ; mauvais token → 403. Sur une `SignatureRequest` en `sent` (envoyée en Task 3), le poll appelle 3a9dSign `get_status` (restera `sent` en sandbox tant que non signé — `updated:0`, correct). **Test de la branche `completed`** (non déclenchable en sandbox) : vérifier la logique en pointant temporairement `sig.status` sur une enveloppe réellement complétée si l'utilisateur en fournit une, OU documenter que la branche completed est vérifiée structurellement (fetch → S3 → mark_signed → enqueue) et couverte quand une vraie signature aboutit. Ne PAS simuler en trichant les données de prod.

- [ ] **Step 5: Commit**
```bash
git add services/rental/app/main.py services/rental/app/scheduler.py scripts/dev-mesh-up.sh
```
```bash
git commit -m "feat(rental): polling de complétion des signatures (PDF signé + marquage + événement)"
```

---

### Task 5: Emails « signé » (notification) — EDL + décompte

**Files:**
- Modify: `services/notification/app/handlers.py`
- Modify: `services/notification/app/worker.py`
- Create: `services/notification/app/templates/inventory_signed.html`, `settlement_signed.html`

**Interfaces:**
- Consumes: `rental.inventory.signed`, `rental.settlement.signed` (payload `{id, signature_id, doc_type}`), rental internal `GET /internal/signatures/{sig_id}/signed.pdf`.

- [ ] **Step 1: Fetch PDF signé** — dans `handlers.py` (mirror `_fetch_receipt_pdf`)
```python
def _fetch_signed_pdf(signature_id):
    base = os.environ.get("RENTAL_URL", "http://localhost:8518")
    try:
        r = httpx.get(f"{base}/internal/signatures/{signature_id}/signed.pdf",
                      headers={"x-internal-token": os.environ.get("INTERNAL_TOKEN", "")}, timeout=10.0)
        return r.content if r.status_code == 200 else None
    except httpx.HTTPError:
        return None
```

- [ ] **Step 2: Handlers** — dans `handlers.py`. Ces events ne portent que `{id, signature_id, doc_type}` : pour retrouver le destinataire (locataire), le handler doit résoudre via rental… **simplification** : le locataire n'est pas dans le payload. Deux options — (a) enrichir le payload rental avec `tenant_client_id` dans le `enqueue` du poll (préférable) ; (b) résoudre côté notification. **Choisir (a)** : dans la Task 4 `enqueue(... {"id":..., "signature_id":..., "doc_type":..., "tenant_client_id": <résolu depuis le bail>})`. Ici, lire `tenant_client_id`.
```python
def _handle_inventory_signed(db, payload: dict) -> None:
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    pdf = _fetch_signed_pdf(payload.get("signature_id"))
    atts = [(f"EDL-signe-{payload.get('id')}.pdf", pdf, "pdf")] if pdf else None
    _try_send(db, to, "inventory_signed.html", "inventory_signed", from_email=_contact(),
              attachments=atts, name=tenant.get("name"))


def _handle_settlement_signed(db, payload: dict) -> None:
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    pdf = _fetch_signed_pdf(payload.get("signature_id"))
    atts = [(f"Decompte-signe-{payload.get('id')}.pdf", pdf, "pdf")] if pdf else None
    _try_send(db, to, "settlement_signed.html", "settlement_signed", from_email=_contact(),
              attachments=atts, name=tenant.get("name"))
```
> Donc en Task 4, ajouter `tenant_client_id` (résolu depuis le bail du doc) au payload des events `inventory.signed`/`settlement.signed`. (Pour lease/mandate, les emails existants gèrent déjà leurs destinataires.)

- [ ] **Step 3: Dispatch + binding** — dans `handle_event`, après la branche `rental.deposit.settled` :
```python
        elif routing_key == "rental.inventory.signed":
            _handle_inventory_signed(db, payload)
        elif routing_key == "rental.settlement.signed":
            _handle_settlement_signed(db, payload)
```
Et dans `worker.py`, ajouter `"rental.inventory.signed"`, `"rental.settlement.signed"` à `bindings=[...]`.

- [ ] **Step 4: Gabarits** — créer `inventory_signed.html` et `settlement_signed.html` en COPIANT `deposit_return.html` (mêmes extends/blocs/macros, contenu **aligné à gauche**). Contenu : confirmation que le document (état des lieux / décompte de caution) a été **signé par toutes les parties**, la copie signée est **jointe**. Sujets : « Votre état des lieux signé » / « Votre décompte de caution signé ». Pas de macro inventée.

- [ ] **Step 5: Vérifier** — restart worker notification. Rendu isolé des 2 gabarits :
```bash
cd /home/younes/Documents/work/0semsar
PYTHONPATH=services/notification python3 -c "
from app.render import render_email
for t in ('inventory_signed.html','settlement_signed.html'):
    s,h,_ = render_email(t, name='Younes')
    print(t, '| subject:', s, '| left:', 'text-align:left' in h)
"
```
Expected : sujets corrects, `left: True`. (E2E complet dépend d'une vraie complétion + mesh.)

- [ ] **Step 6: Commit**
```bash
git add services/notification/app/handlers.py services/notification/app/worker.py services/notification/app/templates/inventory_signed.html services/notification/app/templates/settlement_signed.html
```
```bash
git commit -m "feat(notification): emails EDL signé + décompte signé (PDF signé joint)"
```

---

### Task 6: UI — `SignaturePanel` + branchement sur les 4 écrans + PDF bail/mandat

**Files:**
- Modify: `frontend/src/services/rentalService.js`
- Create: `frontend/src/components/backoffice/SignaturePanel.jsx`
- Modify: `frontend/src/pages/backoffice/rental/{InventoryEditor,SettlementEditor,LeaseDetail,MandateDetail}.jsx`

**Interfaces:**
- Produces: `<SignaturePanel docType docId managerName managerEmail />` réutilisable.

- [ ] **Step 1: `rentalService.js`** — ajouter :
```jsx
  requestSignature: async (docType, docId, body) => (await api.post(`${B}/${docType}/${docId}/request-signature`, body)).data,
  getSignature: async (docType, docId) => (await api.get(`${B}/signatures/${docType}/${docId}`)).data,
  signedPdfUrl: (sigId) => `${B}/signatures/${sigId}/signed.pdf`,
  leasePdfUrl: (id) => `${B}/leases/${id}.pdf`,
  mandatePdfUrl: (id) => `${B}/mandates/${id}.pdf`,
```

- [ ] **Step 2: `SignaturePanel.jsx`** — composant réutilisable (kit). Charge le statut (`getSignature`, `retry:false` → 404 = pas encore demandé), bouton « Envoyer en signature » (POST avec `manager_name`/`manager_email` du user connecté), affiche le statut + les **liens de signature** (sandbox) + « Télécharger le PDF signé » quand `completed`.
```jsx
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiEdit3, FiDownload, FiClock, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'
import { rentalService } from '../../services/rentalService'
import { Panel, StatusBadge, PRIMARY_BTN, SECONDARY_BTN } from './ui'

const SIG_STATUS = {
  pending: ['En attente', 'bg-gray-100 text-gray-600'],
  sent: ['Envoyé en signature', 'bg-amber-100 text-amber-700'],
  in_progress: ['Signature en cours', 'bg-blue-100 text-blue-700'],
  completed: ['Signé', 'bg-emerald-50 text-emerald-700'],
  declined: ['Refusé', 'bg-red-100 text-red-700'],
  voided: ['Annulé', 'bg-gray-100 text-gray-600'],
  expired: ['Expiré', 'bg-gray-100 text-gray-600'],
}
async function openPdf(url) {
  try { const r = await api.get(url, { responseType: 'blob' }); const u = URL.createObjectURL(r.data); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000) }
  catch { toast.error('PDF indisponible') }
}

function SignaturePanel({ docType, docId, managerName, managerEmail, disabled }) {
  const qc = useQueryClient()
  const key = ['signature', docType, docId]
  const { data: sig, error } = useQuery(key, () => rentalService.getSignature(docType, docId), { retry: false })
  const send = useMutation(() => rentalService.requestSignature(docType, docId, { manager_name: managerName, manager_email: managerEmail }), {
    onSuccess: () => { toast.success('Envoyé en signature'); qc.invalidateQueries(key) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const none = error?.response?.status === 404
  return (
    <Panel title="Signature électronique"
      action={sig && <StatusBadge label={SIG_STATUS[sig.status]?.[0] || sig.status} className={SIG_STATUS[sig.status]?.[1]} />}>
      {none || !sig ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Ce document n'a pas encore été envoyé en signature.</p>
          <button disabled={disabled || send.isLoading} onClick={() => send.mutate()} className={PRIMARY_BTN}><FiEdit3 className="w-5 h-5" /> Envoyer en signature</button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <ul className="space-y-1">
            {(sig.signers || []).map((s) => (
              <li key={s.order} className="flex items-center gap-2 text-gray-600">
                <FiClock className="w-4 h-4 text-gray-400" /> {s.order}. {s.name} — {s.email}
              </li>
            ))}
          </ul>
          {sig.status === 'completed' && sig.has_signed_pdf && (
            <button onClick={() => openPdf(rentalService.signedPdfUrl(sig.id))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> Télécharger le PDF signé</button>
          )}
          {sig.status === 'completed' && <p className="inline-flex items-center gap-1 text-emerald-700"><FiCheckCircle className="w-4 h-4" /> Signé par toutes les parties.</p>}
        </div>
      )}
    </Panel>
  )
}
export default SignaturePanel
```

- [ ] **Step 3: Brancher sur les 4 écrans** — importer `SignaturePanel` et le rendre (avec `managerName`/`managerEmail` = l'utilisateur connecté via `useAuthStore`) :
  - `InventoryEditor.jsx` : quand l'EDL est finalisé (`ro`), afficher `<SignaturePanel docType="inventory" docId={invId} .../>` (remplace le marquage manuel ; garder `mark-signed` seulement si signature non configurée). `disabled` si `inv.status === 'draft'`.
  - `SettlementEditor.jsx` : quand `status==='finalized'`, `<SignaturePanel docType="settlement" docId={s.id} .../>`.
  - `LeaseDetail.jsx` : `<SignaturePanel docType="lease" docId={id} .../>` + un bouton PDF bail (`rentalService.leasePdfUrl(id)`).
  - `MandateDetail.jsx` : `<SignaturePanel docType="mandate" docId={id} .../>` + bouton PDF mandat.
  Récupérer l'email du gestionnaire : `const { user } = useAuthStore()` → `managerEmail={user?.email}` `managerName={user?.name || user?.email}`. Vérifier les champs réels de `user` dans `store/authStore.js`.

- [ ] **Step 4: Build + charte** — `cd frontend && npm run build`. Vérifier : kit only, aucun hex, `react-icons/fi`, hooks top-level.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/services/rentalService.js frontend/src/components/backoffice/SignaturePanel.jsx frontend/src/pages/backoffice/rental/InventoryEditor.jsx frontend/src/pages/backoffice/rental/SettlementEditor.jsx frontend/src/pages/backoffice/rental/LeaseDetail.jsx frontend/src/pages/backoffice/rental/MandateDetail.jsx
```
```bash
git commit -m "feat(front): panneau de signature électronique (EDL/décompte/bail/mandat) + PDF bail/mandat"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/emails/catalogue-emails.md`, `docs/architecture-v2-status.md`, `docs/superpowers/specs/2026-07-30-etat-des-lieux-design.md` (§12 : Phase C livrée), `services/rental/.env.example` (déjà en Task 1).

- [ ] **Step 1** — noter la signature 3a9dSign livrée (EDL/décompte/bail/mandat, polling, PDF signé, emails « signé »), et la limite sandbox (lien de signature non récupérable par API → complétion réelle hors sandbox). Marquer §12 Phase C ✅.
- [ ] **Step 2: Commit**
```bash
git add docs/emails/catalogue-emails.md docs/architecture-v2-status.md docs/superpowers/specs/2026-07-30-etat-des-lieux-design.md
```
```bash
git commit -m "docs(rental): signature électronique 3a9dSign livrée (Phase C)"
```

---

## Self-Review

**Spec coverage** — spec §15 : (A) config+signing.py+SignatureRequest+polling ; (B) EDL ; (C) décompte ; (D) PDF bail+mandat+leurs signatures ; (E) UI ; (F) docs. Mapping plan : signing.py+config (T1), PDF bail/mandat (T2), SignatureRequest+résolveur générique+endpoints envoi/statut/PDF signé — couvre EDL+décompte+bail+mandat d'un coup via `_sig_context` (T3), polling+effet signé+ordonnanceur (T4), emails EDL/décompte signé (T5), UI SignaturePanel×4 (T6), docs (T7). ✅ Complet. Le webhook n'est PAS implémenté (décision : polling ; enregistrement webhook impossible avec la clé API) — cohérent avec la spec §2.

**Placeholder scan** — pas de « TBD/TODO ». Les gabarits email = « copier deposit_return.html + adapter » (copie/variables précisées). Les points nécessitant vérification du code réel sont explicités : nom du helper PDF EDL de Phase A (`_inventory_pdf_bytes` à extraire si absent), l'endpoint crm interne pour l'email (`_crm_client`), les champs `user` de authStore, le patron scheduler. Ce sont des vérifications d'intégration, pas des placeholders de logique.

**Type/route consistency** — `SignatureRequest` UNIQUE(doc_type,doc_ref_id) ; `_sig_context` renvoie les mêmes clés consommées par request-signature ET par le poll (`_sig_context_by_agency` factorisé) ; payload `inventory.signed`/`settlement.signed` inclut `tenant_client_id` (ajouté au poll, T4) — lu par les handlers T5 ; `signed_pdf_key` clé S3 servie par back-office + interne ; `rentalService` frappe les chemins exacts ; `SignaturePanel` consomme `_sig_dict` (`status`, `signers`, `has_signed_pdf`, `id`). Événements : `INVENTORY_SIGNED`/`SETTLEMENT_SIGNED` nouveaux + bindings worker ajoutés ; `LEASE_SIGNED`/`MANDATE_SIGNED` réutilisés.

**Sécurité** — `SIGN_API_KEY` en env, jamais committée (vérif `git diff` avant chaque commit ; `.env.example` sans valeur) ; `_gate`+cloisonnement `agency_id` sur tous les endpoints back-office ; poll/PDF interne à `x-internal-token` ; `external_reference` sans PII ; `UNIQUE` anti-doublon ; PDF signé en clé serveur S3.

**Limite connue (documentée)** — en sandbox, le lien de signature n'est exposé par aucun GET → la complétion réelle (`completed`) n'est pas pilotable automatiquement ; E2E testé jusqu'à `send`, branche `completed` vérifiée structurellement. À signaler à l'équipe 3a9dSign si un test complet sans email est requis.

**Note d'exécution** — restart `rental` (avec `SIGN_*` en env) après T1/T2/T3/T4 ; worker `notification` après T5 ; `npm run build` après T6. La clé de test sandbox est fournie par l'utilisateur — l'exporter en variable d'environnement pour les vérifs, ne jamais l'écrire dans un fichier suivi.
