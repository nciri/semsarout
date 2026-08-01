# Gestion locative — Phase 4 (dossier de candidature locative) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le dossier de candidature locative au service `rental` : un candidat **connecté** (grand public) postule sur un bien, dépose ses pièces (S3), suit son dossier ; l'**agence** consulte, valide les pièces et accepte/refuse — avec les emails associés (accusé de réception, relance pièces manquantes, décision).

**Architecture:** Extension du service `rental`. **Deux surfaces d'accès** : côté **candidat** = routes `/gestion-locative/applications/*` sous simple authentification (`get_principal`, **PAS de `_gate`**), cloisonnées par `applicant_user_id = principal.sub` (uid JWT) ; côté **agence** = routes `/backoffice/gestion-locative/applications/*` sous `_gate`, cloisonnées par `agency_id`. Le dossier est aiguillé vers l'agence via l'agence propriétaire du bien (résolue par un endpoint interne `listing`). Pièces stockées en objet (MinIO/S3) via `semsar_storage`. Décision/accusé événementiels (outbox → worker notification) ; relance pièces manquantes pilotée par l'ordonnanceur.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, psycopg3, RabbitMQ (`semsar.events`), `semsar_storage` (MinIO/S3), Jinja2, Brevo SMTP.

## Global Constraints

- Service/rôle/schéma `rental` (ADR-0002), port 8518. Erreurs legacy `{"error": "..."}` via `util.err()`.
- **Surface candidat** : `get_principal` seul (tout utilisateur connecté), **jamais** `_gate` ; cloisonnement strict par `applicant_user_id == int(principal.sub)` (un candidat ne voit/modifie que SES dossiers). **Surface agence** : `_gate` (feature `rental`) + cloisonnement `agency_id`.
- Événements via **outbox** (`enqueue(...)` avant `db.commit()`). Idempotence consumer via `handle_event`/`processed_message`. Routage notification sur **`routing_key`**.
- Endpoints internes protégés par `x-internal-token`. Job ordonnanceur : poll → `_try_send` → `db.commit()` → POST `*-sent` (même si email absent).
- Devise emails `Đh`. Design SemsarOut (base.html + `_components` + icônes PNG 52px stroke #334155 via cairosvg).
- Stockage pièces : clés S3 **scopées par dossier** (`applications/{application_id}/{uuid}`), `Content-Type` conservé ; le download vérifie la propriété (candidat propriétaire OU agence du bien). Jamais de secret loggé.
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. `git commit` = commande bash SEULE (séparée de `git add`).
- Ne pas démarrer le monolithe. DB dev = `semsar_dev`. Lancer un service pour vérifier via le paramètre `run_in_background: true` de l'outil Bash.

---

### Task 1: Endpoint interne `listing` — bien → agence

**Files:**
- Modify: `services/listing/app/main.py` (ajouter `GET /internal/property/{id}`)

**Interfaces:**
- Produces: `GET /internal/property/{id}` → `{property: {id, title, city, agency_id, owner_id}}` (403 sans token, `{property: null}` si absent).

- [ ] **Step 1: Endpoint** — dans `services/listing/app/main.py` (calquer les autres endpoints internes à `x-internal-token`)
```python
@app.get("/internal/property/{property_id}", include_in_schema=False)
def internal_property(property_id: int, request: Request, db: Session = Depends(get_db)):
    """Bien (agence/propriétaire/titre) pour l'aiguillage des candidatures locatives (rental)."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    p = db.get(Property, property_id)
    if p is None:
        return {"property": None}
    return {"property": {"id": p.id, "title": p.title, "city": p.city,
                         "agency_id": p.agency_id, "owner_id": p.owner_id}}
```

- [ ] **Step 2: Vérifier** — le service listing tourne (port 8012). Restart si besoin (`run_in_background: true`), puis :
```bash
curl -s -H 'x-internal-token: change-me-internal' http://localhost:8012/internal/property/1
```
Expected: JSON `{"property": {"id":1, ..., "agency_id": <n|null>, "owner_id": <n|null>}}`. Vérifier 403 sans token.

- [ ] **Step 3: Commit**
```bash
git add services/listing/app/main.py
```
```bash
git commit -m "feat(listing): endpoint interne bien -> agence/propriétaire (aiguillage candidatures)"
```

---

### Task 2: Modèles candidature + soumission (candidat) + accusé de réception (événement)

**Files:**
- Modify: `services/rental/app/models.py` (`TenantApplication`, `ApplicationDocument`)
- Modify: `services/rental/app/events.py` (`APPLICATION_RECEIVED`)
- Modify: `services/rental/app/main.py` (`_property_lookup` helper + `POST /gestion-locative/applications` + dicts)

**Interfaces:**
- Produces: `models.TenantApplication`, `models.ApplicationDocument`; `events.APPLICATION_RECEIVED`; `_application_dict(a)`, `_property_lookup(property_id)`; `POST /gestion-locative/applications`.

- [ ] **Step 1: Modèles** — dans `services/rental/app/models.py`
```python
class TenantApplication(Base):
    __tablename__ = "tenant_application"

    id = Column(Integer, primary_key=True, autoincrement=True)
    property_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True)                 # agence du bien (aiguillage)
    owner_id = Column(Integer, index=True)                  # bien de particulier
    applicant_user_id = Column(Integer, index=True, nullable=False)  # uid JWT (propriété candidat)
    applicant_name = Column(String(150))
    applicant_email = Column(String(120))
    applicant_phone = Column(String(30))
    monthly_income = Column(Numeric(12, 2))
    guarantor_name = Column(String(150))
    guarantor_income = Column(Numeric(12, 2))
    status = Column(String(20), default="received")         # received|reviewing|accepted|rejected|withdrawn
    submitted_at = Column(DateTime, default=datetime.utcnow)
    decided_at = Column(DateTime)
    decision_reason = Column(String(255))
    ack_sent_at = Column(DateTime)
    missing_docs_reminder_sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ApplicationDocument(Base):
    __tablename__ = "application_document"

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(Integer, index=True, nullable=False)
    doc_type = Column(String(40))                           # cin|bulletin_salaire|contrat_travail|avis_impot|garant_*
    status = Column(String(20), default="received")         # received|validated|rejected
    file_key = Column(String(255))
    filename = Column(String(255))
    content_type = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: Événement** — `APPLICATION_RECEIVED = "rental.application.received"`

- [ ] **Step 3: Helpers + soumission** — dans `main.py` (importer `TenantApplication`, `ApplicationDocument`, `httpx`, `os`)
```python
def _property_lookup(property_id: int) -> dict:
    """Bien -> agence/propriétaire via l'endpoint interne listing (aiguillage)."""
    base = os.environ.get("LISTING_URL", "http://localhost:8012")
    try:
        r = httpx.get(f"{base}/internal/property/{property_id}",
                      headers={"x-internal-token": settings.internal_token}, timeout=5.0)
        return (r.json().get("property") or {}) if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return {}


def _application_dict(a: TenantApplication, docs=None) -> dict:
    out = {
        "id": a.id, "property_id": a.property_id, "agency_id": a.agency_id,
        "applicant_user_id": a.applicant_user_id, "applicant_name": a.applicant_name,
        "applicant_email": a.applicant_email, "applicant_phone": a.applicant_phone,
        "monthly_income": num(a.monthly_income), "guarantor_name": a.guarantor_name,
        "guarantor_income": num(a.guarantor_income), "status": a.status,
        "submitted_at": iso(a.submitted_at), "decided_at": iso(a.decided_at),
        "decision_reason": a.decision_reason, "created_at": iso(a.created_at),
    }
    if docs is not None:
        out["documents"] = [{"id": d.id, "doc_type": d.doc_type, "status": d.status,
                             "filename": d.filename, "created_at": iso(d.created_at)} for d in docs]
    return out


@app.post("/gestion-locative/applications", status_code=201)
async def submit_application(request: Request, principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    """Candidature d'un utilisateur connecté (grand public) sur un bien. PAS de gating agence."""
    if principal.agency_id is None and not principal.sub:
        return err("Authentification requise.", 401)
    data = await json_body(request)
    if not data.get("property_id"):
        return err("property_id est requis.", 400)
    prop = _property_lookup(int(data["property_id"]))
    a = TenantApplication(
        property_id=int(data["property_id"]), agency_id=prop.get("agency_id"),
        owner_id=prop.get("owner_id"), applicant_user_id=int(principal.sub),
        applicant_name=data.get("applicant_name"), applicant_email=data.get("applicant_email"),
        applicant_phone=data.get("applicant_phone"), monthly_income=data.get("monthly_income"),
        guarantor_name=data.get("guarantor_name"), guarantor_income=data.get("guarantor_income"),
        status="received")
    db.add(a)
    db.flush()
    enqueue(db, "tenant_application", a.id, events.APPLICATION_RECEIVED, {
        "id": a.id, "applicant_email": a.applicant_email, "applicant_name": a.applicant_name,
        "property_id": a.property_id, "property_title": prop.get("title")})
    db.commit()
    return _application_dict(a)
```
> Note : le candidat n'appartient pas forcément à une agence (`principal.agency_id` peut être `None`) — c'est **normal et voulu**. Seul `principal.sub` (uid) est requis. Le BFF impose déjà un JWT valide (Task 8).

- [ ] **Step 4: Vérifier la table + la soumission** — `init_db` crée les 2 tables. Restart rental (`run_in_background: true`, port 8518, env habituel + `LISTING_URL=http://localhost:8012`). Soumettre en tant que candidat (utilisateur 42, **sans** feature rental) :
```bash
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" PYTHONPATH=services/rental python3 -c "from app.db import init_db; init_db(); print('tables ok')"
curl -s -X POST http://localhost:8518/gestion-locative/applications \
  -H 'x-semsar-user-id: 42' -H 'Content-Type: application/json' \
  -d '{"property_id":1,"applicant_name":"Alice Test","applicant_email":"nciriyounes2005+cand@gmail.com","monthly_income":18000}'
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "SELECT event_type FROM rental.outbox ORDER BY id DESC LIMIT 1;"
```
Expected: JSON candidature `status":"received"`, `agency_id` renseigné (depuis le bien 1) ; outbox = `rental.application.received`. Nettoyer : `DELETE FROM rental.tenant_application; DELETE FROM rental.outbox;`.

- [ ] **Step 5: Commit**
```bash
git add services/rental/app/models.py services/rental/app/events.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): dossier de candidature locative — soumission par le candidat connecté"
```

---

### Task 3: Suivi candidat (liste / détail / retrait — dossiers propres)

**Files:**
- Modify: `services/rental/app/main.py`

**Interfaces:**
- Produces: `GET /gestion-locative/applications`, `GET /gestion-locative/applications/{id}`, `POST /gestion-locative/applications/{id}/withdraw` (tous scopés `applicant_user_id == int(principal.sub)`).

- [ ] **Step 1: Routes candidat** — dans `main.py`
```python
def _own_application(db, application_id: int, principal: Principal):
    a = db.get(TenantApplication, application_id)
    if a is None or a.applicant_user_id != int(principal.sub):
        return None
    return a


@app.get("/gestion-locative/applications")
def my_applications(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    q = (db.query(TenantApplication)
         .filter(TenantApplication.applicant_user_id == int(principal.sub))
         .order_by(TenantApplication.created_at.desc()))
    return {"applications": [_application_dict(a) for a in q.all()]}


@app.get("/gestion-locative/applications/{application_id}")
def my_application(application_id: int, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    a = _own_application(db, application_id, principal)
    if a is None:
        return err("Candidature introuvable.", 404)
    docs = db.query(ApplicationDocument).filter(
        ApplicationDocument.application_id == a.id).all()
    return _application_dict(a, docs=docs)


@app.post("/gestion-locative/applications/{application_id}/withdraw")
def withdraw_application(application_id: int, principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    a = _own_application(db, application_id, principal)
    if a is None:
        return err("Candidature introuvable.", 404)
    if a.status in ("accepted", "rejected"):
        return err("Candidature déjà traitée.", 400)
    a.status = "withdrawn"
    db.commit()
    return _application_dict(a)
```

- [ ] **Step 2: Vérifier** — restart rental, soumettre 2 candidatures avec 2 uids différents (42 et 43), vérifier que `GET /gestion-locative/applications` en tant que 42 ne renvoie QUE la sienne (cloisonnement candidat), et que 42 ne peut pas GET le dossier de 43 (404). Tester withdraw. Nettoyer.

- [ ] **Step 3: Commit**
```bash
git add services/rental/app/main.py
```
```bash
git commit -m "feat(rental): suivi candidat — liste/détail/retrait de ses propres candidatures"
```

---

### Task 4: Pièces justificatives (upload S3 candidat + validation agence)

**Files:**
- Create: `services/rental/app/storage.py`
- Modify: `services/rental/pyproject.toml` (dép `semsar-storage`)
- Modify: `services/rental/.env.example` (vars S3)
- Modify: `services/rental/app/main.py` (upload candidat + download + validation agence)

**Interfaces:**
- Produces: `storage.docs_storage()`; `POST /gestion-locative/applications/{id}/documents`, `GET /gestion-locative/applications/{id}/documents/{doc_id}` (download, candidat propriétaire OU agence du bien), `PATCH /backoffice/gestion-locative/applications/{id}/documents/{doc_id}` (agence : validate/reject).

- [ ] **Step 1: dépendance + env** — `services/rental/pyproject.toml` : ajouter `"semsar-storage",` aux dependencies. `services/rental/.env.example` : ajouter
```
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY=semsar
S3_SECRET_KEY=semsar-secret
RENTAL_DOCS_BUCKET=semsar-rental-docs
```

- [ ] **Step 2: `storage.py`** (calque `services/contract/app/storage.py`)
```python
"""Stockage objet (MinIO/S3) des pièces de candidature locative."""
import os

from semsar_common import get_settings
from semsar_storage import ObjectStorage, s3_client


def docs_storage() -> ObjectStorage:
    s = get_settings()
    client = s3_client(s.s3_endpoint, s.s3_access_key, s.s3_secret_key)
    store = ObjectStorage(client, os.environ.get("RENTAL_DOCS_BUCKET", "semsar-rental-docs"))
    store.ensure_bucket()
    return store
```

- [ ] **Step 3: Endpoints pièces** — dans `main.py` (importer `uuid`, `Response`)
```python
@app.post("/gestion-locative/applications/{application_id}/documents", status_code=201)
async def upload_document(application_id: int, request: Request,
                          principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    a = _own_application(db, application_id, principal)
    if a is None:
        return err("Candidature introuvable.", 404)
    body = await request.body()
    if not body:
        return err("Fichier vide.", 400)
    if len(body) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    doc_type = request.query_params.get("doc_type", "autre")
    filename = request.query_params.get("filename", "piece")
    content_type = request.headers.get("content-type", "application/octet-stream")
    from . import storage
    key = f"applications/{a.id}/{uuid.uuid4().hex}"
    storage.docs_storage().put(key, body, content_type)
    d = ApplicationDocument(application_id=a.id, doc_type=doc_type, status="received",
                            file_key=key, filename=filename, content_type=content_type)
    db.add(d)
    db.commit()
    return {"id": d.id, "doc_type": d.doc_type, "status": d.status, "filename": d.filename}


@app.get("/gestion-locative/applications/{application_id}/documents/{doc_id}")
def download_document(application_id: int, doc_id: int,
                      principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    a = db.get(TenantApplication, application_id)
    d = db.get(ApplicationDocument, doc_id)
    if a is None or d is None or d.application_id != a.id:
        return err("Pièce introuvable.", 404)
    is_owner = a.applicant_user_id == int(principal.sub)
    is_agency = principal.agency_id is not None and a.agency_id == principal.agency_id
    if not (is_owner or is_agency):
        return err("Accès refusé.", 403)
    from . import storage
    data = storage.docs_storage().get(d.file_key)
    return Response(data, media_type=d.content_type or "application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename={d.filename or 'piece'}",
                             "X-Content-Type-Options": "nosniff"})


@app.patch("/backoffice/gestion-locative/applications/{application_id}/documents/{doc_id}")
async def validate_document(application_id: int, doc_id: int, request: Request,
                            principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    a = db.get(TenantApplication, application_id)
    d = db.get(ApplicationDocument, doc_id)
    if a is None or d is None or d.application_id != a.id or a.agency_id != principal.agency_id:
        return err("Pièce introuvable.", 404)
    data = await json_body(request)
    status = data.get("status")
    if status not in ("validated", "rejected", "received"):
        return err("Statut invalide.", 400)
    d.status = status
    db.commit()
    return {"id": d.id, "status": d.status}
```
> Sécurité : la clé S3 est scopée `applications/{id}/{uuid}` (jamais de chemin client → pas de traversal) ; le download vérifie propriété candidat OU agence du bien ; `nosniff` posé.

- [ ] **Step 4: Vérifier** — restart rental avec l'env S3 (`S3_ENDPOINT_URL=... S3_ACCESS_KEY=semsar S3_SECRET_KEY=semsar-secret RENTAL_DOCS_BUCKET=semsar-rental-docs` en plus). Soumettre une candidature (uid 42), uploader une pièce (`--data-binary`), re-télécharger en tant que 42 (200) et en tant qu'un autre uid non-agence (403), valider la pièce côté agence (PATCH avec headers agence + feature rental). Nettoyer.
```bash
# upload
curl -s -X POST "http://localhost:8518/gestion-locative/applications/$AID/documents?doc_type=cin&filename=cin.pdf" \
  -H 'x-semsar-user-id: 42' -H 'Content-Type: application/pdf' --data-binary @/etc/hostname
```
Expected: `201` avec l'id de pièce ; download 200 (propriétaire) / 403 (tiers) ; PATCH agence 200.

- [ ] **Step 5: Commit**
```bash
git add services/rental/app/storage.py services/rental/pyproject.toml services/rental/.env.example services/rental/app/main.py
```
```bash
git commit -m "feat(rental): pièces de candidature — upload S3 (candidat) + validation (agence)"
```

---

### Task 5: Traitement agence (liste / détail / décision) + événement `application.decided`

**Files:**
- Modify: `services/rental/app/events.py` (`APPLICATION_DECIDED`)
- Modify: `services/rental/app/main.py` (routes back-office + émission)

**Interfaces:**
- Produces: `events.APPLICATION_DECIDED`; `GET /backoffice/gestion-locative/applications`, `GET /backoffice/gestion-locative/applications/{id}`, `POST /backoffice/gestion-locative/applications/{id}/decide`.

- [ ] **Step 1: Événement** — `APPLICATION_DECIDED = "rental.application.decided"`

- [ ] **Step 2: Routes agence** — dans `main.py`
```python
@app.get("/backoffice/gestion-locative/applications")
def agency_applications(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    q = (db.query(TenantApplication)
         .filter(TenantApplication.agency_id == principal.agency_id)
         .order_by(TenantApplication.created_at.desc()))
    return {"applications": [_application_dict(a) for a in q.all()]}


@app.get("/backoffice/gestion-locative/applications/{application_id}")
def agency_application(application_id: int, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    a = db.get(TenantApplication, application_id)
    if a is None or a.agency_id != principal.agency_id:
        return err("Candidature introuvable.", 404)
    docs = db.query(ApplicationDocument).filter(ApplicationDocument.application_id == a.id).all()
    return _application_dict(a, docs=docs)


@app.post("/backoffice/gestion-locative/applications/{application_id}/decide")
async def decide_application(application_id: int, request: Request,
                             principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    a = db.get(TenantApplication, application_id)
    if a is None or a.agency_id != principal.agency_id:
        return err("Candidature introuvable.", 404)
    if a.status in ("accepted", "rejected", "withdrawn"):
        return err("Candidature déjà traitée.", 400)
    data = await json_body(request)
    decision = data.get("decision")
    if decision not in ("accepted", "rejected"):
        return err("decision doit être 'accepted' ou 'rejected'.", 400)
    a.status = decision
    a.decided_at = datetime.utcnow()
    a.decision_reason = data.get("reason")
    enqueue(db, "tenant_application", a.id, events.APPLICATION_DECIDED, {
        "id": a.id, "applicant_email": a.applicant_email, "applicant_name": a.applicant_name,
        "property_id": a.property_id, "decision": decision, "reason": a.decision_reason})
    db.commit()
    return _application_dict(a)
```

- [ ] **Step 3: Vérifier** — soumettre une candidature sur un bien de l'agence 1, la lister/consulter côté agence 1, décider (`accepted`) → outbox `rental.application.decided`. Vérifier 404 cross-agency (agence 999) et 400 sur re-décision. Nettoyer.

- [ ] **Step 4: Commit**
```bash
git add services/rental/app/events.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): traitement agence des candidatures (liste/détail/décision)"
```

---

### Task 6: Emails accusé de réception + décision (événementiels)

**Files:**
- Modify: `services/notification/app/handlers.py` (2 handlers + routage)
- Modify: `services/notification/app/worker.py` (2 bindings)
- Create: `services/notification/app/templates/application_received.html`, `services/notification/app/templates/application_decision.html`
- Create: `frontend/public/email-icons/clipboard-check.png`, `frontend/public/email-icons/circle-x.png` (`circle-check.png` existe déjà)

**Interfaces:**
- Consumes: `rental.application.received`, `rental.application.decided`.
- Produces: emails `application_received`, `application_decision` (au candidat).

- [ ] **Step 1: Icônes**
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
icons = {
 'clipboard-check': '<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\"/><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"/><path d=\"m9 14 2 2 4-4\"/>',
 'circle-x': '<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m15 9-6 6M9 9l6 6\"/>',
}
for name, path in icons.items():
    svg=f'<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">{path}</svg>'
    cairosvg.svg2png(bytestring=svg.encode(), write_to=f'frontend/public/email-icons/{name}.png', output_width=52, output_height=52)
    print('generated', name)
"
ls -la frontend/public/email-icons/clipboard-check.png frontend/public/email-icons/circle-x.png
```

- [ ] **Step 2: `application_received.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Votre candidature est bien reçue{% endblock %}
{% block preheader %}Nous avons bien reçu votre dossier de candidature{% if property_title %} pour {{ property_title }}{% endif %}.{% endblock %}
{% block badge %}{{ lucide("clipboard-check") }}{% endblock %}
{% block hero_title %}Candidature reçue{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, merci de votre intérêt.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Nous avons bien reçu votre dossier de candidature{% if property_title %} pour <strong>{{ property_title }}</strong>{% endif %}. Notre équipe l'étudie et reviendra vers vous rapidement.</p>
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Pensez à compléter vos pièces justificatives depuis votre espace pour accélérer l'étude. Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 3: `application_decision.html`** (conditionnel accept/refus)
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% set accepted = decision == "accepted" %}
{% block subject %}{% if accepted %}Bonne nouvelle : votre candidature est acceptée{% else %}Suite à votre candidature{% endif %}{% endblock %}
{% block preheader %}{% if accepted %}Votre dossier a été retenu.{% else %}Votre dossier n'a pas été retenu cette fois.{% endif %}{% endblock %}
{% block badge %}{{ lucide("circle-check" if accepted else "circle-x") }}{% endblock %}
{% block hero_title %}{% if accepted %}Candidature acceptée{% else %}Réponse à votre candidature{% endif %}{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}.</p>{% endblock %}
{% block content %}
{% if accepted %}
<p style="text-align:center; color:{{ brand.ink }};">Excellente nouvelle&nbsp;! Votre dossier a été <strong>retenu</strong>. Notre équipe vous recontactera pour la suite (bail, état des lieux, remise des clés).</p>
{% else %}
<p style="text-align:center; color:{{ brand.ink }};">Après étude, votre dossier n'a pas été retenu pour ce bien{% if reason %} ({{ reason }}){% endif %}. Nous vous remercions de votre intérêt et restons à votre disposition pour d'autres biens.</p>
{% endif %}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 4: Handlers + routage + bindings** — dans `services/notification/app/handlers.py`
```python
def _handle_application_received(db, payload):
    """rental.application.received → accusé de réception au candidat."""
    to = (payload.get("applicant_email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "application_received.html", "application_received", from_email=_contact(),
              name=payload.get("applicant_name"), property_title=payload.get("property_title"))


def _handle_application_decided(db, payload):
    """rental.application.decided → décision (accept/refus) au candidat."""
    to = (payload.get("applicant_email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "application_decision.html", "application_decision", from_email=_contact(),
              name=payload.get("applicant_name"), decision=payload.get("decision"),
              reason=payload.get("reason"))
```
`handle_event` : `elif routing_key == "rental.application.received": _handle_application_received(db, payload)` et `elif routing_key == "rental.application.decided": _handle_application_decided(db, payload)`. `worker.py` bindings : `"rental.application.received"`, `"rental.application.decided"`.
> Le candidat n'a pas de `crm.Client` — l'email vient directement du payload (`applicant_email`), pas de `recipients.client`.

- [ ] **Step 5: Test E2E** — chemin événementiel (rental uvicorn + rental relay + worker notification avec les 2 nouveaux bindings). Soumettre une candidature avec `applicant_email = nciriyounes2005+cand@gmail.com`, vérifier `application_received | sent` ; décider (accepted) → `application_decision | sent`. Nettoyer.

- [ ] **Step 6: Commit**
```bash
git add services/notification/app/handlers.py services/notification/app/worker.py services/notification/app/templates/application_received.html services/notification/app/templates/application_decision.html frontend/public/email-icons/clipboard-check.png frontend/public/email-icons/circle-x.png
```
```bash
git commit -m "feat(notification): emails accusé de réception + décision de candidature"
```

---

### Task 7: Relance pièces manquantes (ordonnanceur)

**Files:**
- Modify: `services/rental/app/main.py` (endpoints internes due-missing-docs + marker)
- Modify: `services/notification/app/scheduler.py` (job + run_once)
- Create: `services/notification/app/templates/application_missing_docs.html`
- Create: `frontend/public/email-icons/paperclip.png`

**Interfaces:**
- Produces: `GET /internal/applications/due-missing-docs-reminders`, `POST /internal/applications/{id}/missing-docs-reminder-sent`; scheduler `_job_application_missing_docs(db)`.

- [ ] **Step 1: Endpoints internes** — dans `main.py` (candidatures actives, soumises il y a ≥ 3 j, avec 0 pièce reçue, relance non encore envoyée)
```python
@app.get("/internal/applications/due-missing-docs-reminders", include_in_schema=False)
def internal_apps_due_missing_docs(x_internal_token: str = Header(default=""),
                                   db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=3)
    out = []
    rows = (db.query(TenantApplication)
            .filter(TenantApplication.status.in_(["received", "reviewing"]),
                    TenantApplication.missing_docs_reminder_sent_at.is_(None),
                    TenantApplication.submitted_at <= cutoff).all())
    for a in rows:
        doc_count = db.query(ApplicationDocument).filter(
            ApplicationDocument.application_id == a.id).count()
        if doc_count == 0:
            out.append({"id": a.id, "applicant_email": a.applicant_email,
                        "applicant_name": a.applicant_name})
    return {"applications": out}


@app.post("/internal/applications/{application_id}/missing-docs-reminder-sent", include_in_schema=False)
def internal_app_missing_docs_sent(application_id: int, x_internal_token: str = Header(default=""),
                                   db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    a = db.get(TenantApplication, application_id)
    if a is not None:
        a.missing_docs_reminder_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}
```

- [ ] **Step 2: Icône `paperclip.png`**
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13.234 20.252 21 12.3a4.25 4.25 0 0 0-6-6L4.856 16.928a2.83 2.83 0 0 0 4 4L18.5 11.28a1.417 1.417 0 0 0-2-2L7.3 18.418\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/paperclip.png', output_width=52, output_height=52)
print('generated paperclip.png')
"
ls -la frontend/public/email-icons/paperclip.png
```

- [ ] **Step 3: `application_missing_docs.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import lucide with context %}
{% block subject %}Complétez votre dossier de candidature{% endblock %}
{% block preheader %}Il manque des pièces à votre dossier — ajoutez-les pour poursuivre l'étude.{% endblock %}
{% block badge %}{{ lucide("paperclip") }}{% endblock %}
{% block hero_title %}Pièces manquantes{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, votre dossier est incomplet.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Pour que nous puissions étudier votre candidature, il nous manque vos pièces justificatives (pièce d'identité, justificatifs de revenus, éventuellement garant). Merci de les déposer depuis votre espace SemsarOut.</p>
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 4: Job ordonnanceur** — dans `scheduler.py`
```python
def _job_application_missing_docs(db) -> int:
    """Relance pièces manquantes : candidatures sans aucune pièce après 3 j."""
    try:
        r = httpx.get(f"{_rental()}/internal/applications/due-missing-docs-reminders",
                      headers=_headers(), timeout=10.0)
        apps = r.json().get("applications", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for app in apps:
        to = (app.get("applicant_email") or "").strip()
        if _valid_email(to):
            _try_send(db, to, "application_missing_docs.html", "application_missing_docs",
                      from_email=_contact(), name=app.get("applicant_name"))
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_rental()}/internal/applications/{app['id']}/missing-docs-reminder-sent",
                       headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent
```
Dans `run_once`, ajouter :
```python
        md = _job_application_missing_docs(db)
        if md:
            logger.info("relances pièces manquantes envoyées", extra={"count": md})
```

- [ ] **Step 5: Test E2E** — seed une candidature soumise il y a 4 j, sans pièce, `applicant_email = nciriyounes2005+missing@gmail.com`, lancer `_job_application_missing_docs` en direct → `sent: 1`, `application_missing_docs | sent` ; 2ᵉ passage → 0. Nettoyer.

- [ ] **Step 6: Commit**
```bash
git add services/rental/app/main.py services/notification/app/scheduler.py services/notification/app/templates/application_missing_docs.html frontend/public/email-icons/paperclip.png
```
```bash
git commit -m "feat(rental): relance pièces manquantes de candidature (ordonnanceur)"
```

---

### Task 8: Câblage BFF (route publique candidat) + env S3 mesh

**Files:**
- Modify: `gateway/app/main.py` (route publique `/api/v1/gestion-locative`)
- Modify: `scripts/dev-mesh-up.sh` (env S3 + `RENTAL_DOCS_BUCKET` pour rental)

**Interfaces:**
- Produces: `/api/v1/gestion-locative/*` (JWT requis, non-agence) → `rental` (préfixe `/api/v1` retiré).

- [ ] **Step 1: Route BFF publique** — dans `gateway/app/main.py`, à côté de la route backoffice rental existante, ajouter (la route candidat, distincte du préfixe backoffice) :
```python
    if settings.rental_url and path.startswith("/api/v1/gestion-locative"):
        return app.state.rental, path.replace("/api/v1", "", 1)
```
> Placer cette règle APRÈS la règle backoffice (`/api/v1/backoffice/gestion-locative`) pour ne pas l'ombrer — les deux préfixes sont disjoints, mais l'ordre garde la lisibilité. Le BFF exige déjà un JWT valide sur ces routes ; un candidat sans agence a `agency_id=None` (normal).

- [ ] **Step 2: Env S3 mesh** — dans `scripts/dev-mesh-up.sh`, au `case "$svc"` pour `rental`, ajouter le bloc S3 + bucket :
```bash
    rental) extra="IDENTITY_URL=http://localhost:8501 CRM_URL=http://localhost:8013 LISTING_URL=http://localhost:8012 $S3 RENTAL_DOCS_BUCKET=semsar-rental-docs";;
```

- [ ] **Step 3: Vérifier** — relancer le BFF avec `RENTAL_URL`, curl `POST /api/v1/gestion-locative/applications` sans JWT → 401 (BFF exige le token) ; le préfixe est mappé (pas 404). (Le test authentifié complet passe par le mesh + un vrai JWT.)

- [ ] **Step 4: Commit**
```bash
git add gateway/app/main.py scripts/dev-mesh-up.sh
```
```bash
git commit -m "feat(gateway): route publique candidat /gestion-locative + env S3 rental (mesh)"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/emails/catalogue-emails.md`

- [ ] **Step 1: Statuts §2** — passer à ✅ (Phase 4) : « Accusé de réception du dossier de candidature », « Relance pour pièces manquantes », « Acceptation / refus du dossier ». Laisser 🔴 « Bailleur : proposition de dossiers candidats » (hors périmètre — optionnel). Mettre à jour le bandeau : les Phases 1-4 livrées ; Phase 5 (UI) à venir.

- [ ] **Step 2: Commit**
```bash
git add docs/emails/catalogue-emails.md
```
```bash
git commit -m "docs(rental): statut Phase 4 (candidature locative — accusé, relance, décision)"
```

---

## Self-Review

**Spec coverage (Phase 4)** — la spec définit la Phase 4 = dossier de candidature (accusé, relance pièces manquantes, acceptation/refus, pièces). Couverture : bien→agence (T1), modèles + soumission + accusé (T2), suivi candidat (T3), pièces S3 + validation (T4), traitement agence + décision (T5), emails accusé + décision (T6), relance pièces manquantes (T7), BFF public + S3 mesh (T8), docs (T9). ✅ Complet. « Bailleur : proposition de dossiers candidats » = optionnel, hors périmètre (noté). UI = Phase 5.

**Modèle d'accès (le point clé)** — surface **candidat** = `get_principal` seul, **jamais** `_gate`, cloisonnée par `applicant_user_id == int(principal.sub)` (un candidat ne touche que SES dossiers ; `_own_application` centralise le contrôle). Surface **agence** = `_gate` + `agency_id`. Le download de pièce autorise le candidat propriétaire OU l'agence du bien. Aucune fuite inter-candidats ni inter-agences.

**Placeholder scan** — aucun « TBD/TODO ». Le candidat n'a pas de `crm.Client` : l'email vient du payload (`applicant_email`), pas de `recipients.client`. Le bien de particulier (`agency_id` None, `owner_id` set) est stocké mais la revue back-office agence filtre sur `agency_id` (le flux propriétaire-particulier est un suivi noté, hors périmètre).

**Type consistency** — `submit_application`/`decide_application` émettent `applicant_email`/`applicant_name`/`decision`/`reason`/`property_title` — exactement ce que lisent `_handle_application_received`/`_handle_application_decided`. `due-missing-docs-reminders` renvoie `applicant_email`/`applicant_name` — lu par `_job_application_missing_docs`. `_own_application` compare `applicant_user_id` (Integer) à `int(principal.sub)`. Réutilise `_gate`, `err`, `num`, `iso`, `json_body`, `enqueue`, `_rental()`.

**Sécurité** — clés S3 scopées `applications/{id}/{uuid}` (pas de traversal) ; taille max 10 Mo ; `nosniff` ; download contrôlé (propriétaire OU agence) ; endpoints internes à jeton. Le BFF impose le JWT sur les routes candidat.

**Note d'exécution** — T1 touche `listing` (restart listing). T2-T5, T7 : restart **rental** (nouveaux endpoints/tables ; T4 ajoute l'env S3). T6 : chemin **événementiel** → rental relay + worker notification (2 bindings) ; restart worker. T7 : job testable en direct via `python3 -c`. Lancer les services via `run_in_background: true` de l'outil Bash. MinIO doit tourner (infra mesh) pour T4.
