# État des lieux — Phase A (domaine EDL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer le domaine « état des lieux » (EDL) dans le service `rental` : entités Inventory/Room/Item/Photo, remplissage back-office structuré (pièces → éléments → état/commentaire/photos), jeu de pièces par défaut, PDF de l'EDL, et l'UI d'édition (dans le détail du bail). Décompte de caution + comparaison + signature = Phases B/C (plans séparés).

**Architecture:** Extension du service `rental` (Vague 3). Nouvelles entités liées au `Lease`, cloisonnées `agency_id`, gating `_gate` (feature `rental`). Photos en objet (MinIO/S3) via `semsar_storage` (déjà câblé dans `rental/storage.py`). PDF via `reportlab` (patron `pdf.py` quittance/CRG). UI back-office avec le kit `components/backoffice/ui.jsx`.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, psycopg3, `semsar_storage` (S3), reportlab ; React 18 + react-query 3 + react-icons/fi + Tailwind.

## Global Constraints

- Service/schéma/rôle `rental` (ADR-0002), port 8518. Erreurs legacy `{"error": "..."}` via `util.err()`.
- Cloisonnement agence : toute route back-office `_gate(principal)` puis `x.agency_id == principal.agency_id` (404 sinon). Endpoints internes à `x-internal-token`.
- Un EDL/pièce/élément **finalisé** est verrouillé : refuser l'édition si `inventory.status != 'draft'`.
- Photos : clé S3 serveur `inventories/{inventory_id}/{uuid}` (pas de chemin client → pas de traversal), taille ≤ 10 Mo (garde `Content-Length` + `len(body)`), `X-Content-Type-Options: nosniff`, download contrôlé par l'agence du bail.
- Devise `Đh` (affichage), design SemsarOut (kit + tokens), `react-icons/fi`, react-query + `react-toastify`, `GatedNotice` sur 403.
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. `git commit` = commande bash SEULE (séparée de `git add`).
- DB dev = `semsar_dev`. Lancer un service pour vérifier via le paramètre `run_in_background: true` de l'outil Bash (un `&` en fin de commande est tué à la fin de l'appel). Restart `rental` après ajout d'endpoints ; `npm run build` doit passer après chaque tâche frontend.
- **Périmètre Phase A** : remplissage EDL (entrée/sortie) + photos + PDF + UI éditeur. HORS Phase A : décompte de caution, vue comparaison, signature 3a9dSign (Phases B/C).

---

### Task 1: Modèles EDL + jeu par défaut + création/détail

**Files:**
- Modify: `services/rental/app/models.py` (Inventory, InventoryRoom, InventoryItem, InventoryPhoto)
- Modify: `services/rental/app/events.py` (`INVENTORY_FINALIZED`)
- Modify: `services/rental/app/main.py` (constante défaut + helpers + endpoints create/list/detail)

**Interfaces:**
- Produces: `models.Inventory/InventoryRoom/InventoryItem/InventoryPhoto`; `events.INVENTORY_FINALIZED`; `_DEFAULT_EDL`, `_inventory_dict(db, inv, full=False)`; `POST /backoffice/gestion-locative/leases/{id}/inventories`, `GET /…/leases/{id}/inventories`, `GET /…/inventories/{inv_id}`.

- [ ] **Step 1: Modèles** — dans `services/rental/app/models.py` (après `ChargeRegularization`)
```python
class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (UniqueConstraint("lease_id", "type", name="uq_inventory_lease_type"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    type = Column(String(10), nullable=False)                 # entree | sortie
    status = Column(String(20), default="draft")              # draft | finalized | signed
    general_notes = Column(Text)
    conducted_at = Column(DateTime)
    conducted_by_id = Column(Integer)
    finalized_at = Column(DateTime)
    signed_at = Column(DateTime)
    pdf_key = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InventoryRoom(Base):
    __tablename__ = "inventory_room"
    id = Column(Integer, primary_key=True, autoincrement=True)
    inventory_id = Column(Integer, index=True, nullable=False)
    name = Column(String(80), nullable=False)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class InventoryItem(Base):
    __tablename__ = "inventory_item"
    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(Integer, index=True, nullable=False)
    label = Column(String(80), nullable=False)
    condition = Column(String(10), default="bon")             # bon | moyen | mauvais
    comment = Column(Text)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class InventoryPhoto(Base):
    __tablename__ = "inventory_photo"
    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, index=True, nullable=False)
    file_key = Column(String(255))
    filename = Column(String(255))
    content_type = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
```
(`Text`, `UniqueConstraint` sont déjà importés dans `models.py`.)

- [ ] **Step 2: Événement** — `INVENTORY_FINALIZED = "rental.inventory.finalized"` dans `events.py`.

- [ ] **Step 3: Jeu par défaut + helpers** — dans `main.py` (importer les 4 modèles depuis `.models`)
```python
_DEFAULT_EDL = [
    ("Entrée", ["Murs", "Sol", "Plafond", "Porte", "Interrupteurs"]),
    ("Séjour", ["Murs", "Sol", "Plafond", "Fenêtres", "Volets", "Électricité"]),
    ("Cuisine", ["Murs", "Sol", "Plan de travail", "Évier", "Robinetterie", "Placards", "Électroménager"]),
    ("Chambre", ["Murs", "Sol", "Plafond", "Fenêtres", "Placards"]),
    ("Salle de bain", ["Murs", "Sol", "Douche/Baignoire", "Lavabo", "Robinetterie", "WC"]),
]


def _photo_dict(p: InventoryPhoto) -> dict:
    return {"id": p.id, "filename": p.filename, "content_type": p.content_type, "created_at": iso(p.created_at)}


def _inventory_dict(db: Session, inv: Inventory, full: bool = False) -> dict:
    out = {"id": inv.id, "lease_id": inv.lease_id, "type": inv.type, "status": inv.status,
           "general_notes": inv.general_notes, "conducted_at": iso(inv.conducted_at),
           "finalized_at": iso(inv.finalized_at), "signed_at": iso(inv.signed_at),
           "has_pdf": bool(inv.pdf_key), "created_at": iso(inv.created_at)}
    if full:
        rooms = (db.query(InventoryRoom).filter(InventoryRoom.inventory_id == inv.id)
                 .order_by(InventoryRoom.position, InventoryRoom.id).all())
        out["rooms"] = []
        for r in rooms:
            items = (db.query(InventoryItem).filter(InventoryItem.room_id == r.id)
                     .order_by(InventoryItem.position, InventoryItem.id).all())
            out["rooms"].append({"id": r.id, "name": r.name, "position": r.position, "items": [
                {"id": it.id, "label": it.label, "condition": it.condition, "comment": it.comment,
                 "photos": [_photo_dict(p) for p in db.query(InventoryPhoto).filter(
                     InventoryPhoto.item_id == it.id).order_by(InventoryPhoto.id).all()]}
                for it in items]})
    return out
```

- [ ] **Step 4: Endpoints create / list / detail** — dans `main.py`
```python
@app.post("/backoffice/gestion-locative/leases/{lease_id}/inventories", status_code=201)
async def create_inventory(lease_id: int, request: Request,
                           principal: Principal = Depends(get_principal),
                           db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    data = await json_body(request)
    edl_type = data.get("type")
    if edl_type not in ("entree", "sortie"):
        return err("type doit être 'entree' ou 'sortie'.", 400)
    if db.query(Inventory).filter(Inventory.lease_id == lease_id, Inventory.type == edl_type).first():
        return err("Un état des lieux de ce type existe déjà pour ce bail.", 400)
    inv = Inventory(lease_id=lease_id, agency_id=principal.agency_id, type=edl_type,
                    conducted_by_id=int(principal.sub) if principal.sub else None,
                    conducted_at=datetime.utcnow())
    db.add(inv)
    db.flush()
    if data.get("prefill", True):   # pré-remplir avec le jeu par défaut
        for ri, (rname, items) in enumerate(_DEFAULT_EDL):
            room = InventoryRoom(inventory_id=inv.id, name=rname, position=ri)
            db.add(room)
            db.flush()
            for ii, label in enumerate(items):
                db.add(InventoryItem(room_id=room.id, label=label, position=ii))
    db.commit()
    return _inventory_dict(db, inv, full=True)


@app.get("/backoffice/gestion-locative/leases/{lease_id}/inventories")
def list_inventories(lease_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    rows = db.query(Inventory).filter(Inventory.lease_id == lease_id).order_by(Inventory.type).all()
    return {"inventories": [_inventory_dict(db, i) for i in rows]}


@app.get("/backoffice/gestion-locative/inventories/{inv_id}")
def get_inventory(inv_id: int, principal: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = db.get(Inventory, inv_id)
    if inv is None or inv.agency_id != principal.agency_id:
        return err("État des lieux introuvable.", 404)
    return _inventory_dict(db, inv, full=True)
```

- [ ] **Step 5: Créer les tables + vérifier**
```bash
cd /home/younes/Documents/work/0semsar
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" PYTHONPATH=services/rental python3 -c "from app.db import init_db; init_db(); print('ok')"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "\dt rental.inventory*"
```
Expected: tables `inventory`, `inventory_room`, `inventory_item`, `inventory_photo`.

Restart rental (Bash `run_in_background: true`, port 8518, env habituel : `DATABASE_URL=...semsar_dev TRUST_GATEWAY_HEADERS=true INTERNAL_TOKEN=change-me-internal RABBITMQ_URL=amqp://semsar:semsar@localhost:5672/ EVENTS_EXCHANGE=semsar.events LISTING_URL=http://localhost:8012 CRM_URL=http://localhost:8013 IDENTITY_URL=http://localhost:8501 S3_ENDPOINT_URL=http://localhost:9000 S3_ACCESS_KEY=semsar S3_SECRET_KEY=semsar-secret RENTAL_DOCS_BUCKET=semsar-rental-docs`). Seed un bail (ou réutiliser le bail de démo 16) et créer un EDL :
```bash
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases/16/inventories $H -d '{"type":"entree"}' | python3 -m json.tool | head -30
```
Expected: EDL `type":"entree"`, `status":"draft"`, avec `rooms` pré-remplies (5 pièces, éléments par défaut). Doublon même type → 400. Cross-agency (agence 999) → 404. Nettoyer : `DELETE FROM rental.inventory_item; DELETE FROM rental.inventory_room; DELETE FROM rental.inventory;` (ou garder pour les tâches suivantes).

- [ ] **Step 6: Commit**
```bash
git add services/rental/app/models.py services/rental/app/events.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): domaine état des lieux — modèles + création (pré-remplie) + détail"
```

---

### Task 2: Édition (pièces/éléments/notes) + finalisation (verrouillage)

**Files:**
- Modify: `services/rental/app/main.py`

**Interfaces:**
- Produces: `PATCH /…/inventories/{inv_id}` (notes) ; `POST /…/inventories/{inv_id}/rooms`, `DELETE /…/rooms/{room_id}` ; `POST /…/rooms/{room_id}/items`, `PATCH/DELETE /…/items/{item_id}` ; `POST /…/inventories/{inv_id}/finalize` ; `POST /…/inventories/{inv_id}/mark-signed`. Helper `_owned_inventory(db, inv_id, principal)`, `_editable(inv)`.

- [ ] **Step 1: Helpers de garde** — dans `main.py`
```python
def _owned_inventory(db, inv_id: int, principal: Principal):
    inv = db.get(Inventory, inv_id)
    if inv is None or inv.agency_id != principal.agency_id:
        return None
    return inv


def _owned_room(db, room_id: int, principal: Principal):
    r = db.get(InventoryRoom, room_id)
    if r is None:
        return None, None
    inv = _owned_inventory(db, r.inventory_id, principal)
    return (r, inv) if inv is not None else (None, None)


def _owned_item(db, item_id: int, principal: Principal):
    it = db.get(InventoryItem, item_id)
    if it is None:
        return None, None
    r, inv = _owned_room(db, it.room_id, principal)
    return (it, inv) if inv is not None else (None, None)
```

- [ ] **Step 2: Édition notes + pièces + éléments** — dans `main.py`. Toute écriture exige `inv.status == 'draft'` (verrou après finalize).
```python
@app.patch("/backoffice/gestion-locative/inventories/{inv_id}")
async def update_inventory(inv_id: int, request: Request,
                           principal: Principal = Depends(get_principal),
                           db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé (finalisé).", 400)
    data = await json_body(request)
    if "general_notes" in data:
        inv.general_notes = data["general_notes"]
    db.commit()
    return _inventory_dict(db, inv)


@app.post("/backoffice/gestion-locative/inventories/{inv_id}/rooms", status_code=201)
async def add_room(inv_id: int, request: Request, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    data = await json_body(request)
    if not data.get("name"):
        return err("Le nom de la pièce est requis.", 400)
    n = db.query(InventoryRoom).filter(InventoryRoom.inventory_id == inv.id).count()
    r = InventoryRoom(inventory_id=inv.id, name=data["name"], position=n)
    db.add(r)
    db.commit()
    return {"id": r.id, "name": r.name, "position": r.position, "items": []}


@app.delete("/backoffice/gestion-locative/rooms/{room_id}")
def delete_room(room_id: int, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    r, inv = _owned_room(db, room_id, principal)
    if r is None:
        return err("Pièce introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    items = db.query(InventoryItem).filter(InventoryItem.room_id == r.id).all()
    for it in items:
        db.query(InventoryPhoto).filter(InventoryPhoto.item_id == it.id).delete()
        db.delete(it)
    db.delete(r)
    db.commit()
    return {"ok": True}


@app.post("/backoffice/gestion-locative/rooms/{room_id}/items", status_code=201)
async def add_item(room_id: int, request: Request, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    r, inv = _owned_room(db, room_id, principal)
    if r is None:
        return err("Pièce introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    data = await json_body(request)
    if not data.get("label"):
        return err("Le libellé de l'élément est requis.", 400)
    n = db.query(InventoryItem).filter(InventoryItem.room_id == r.id).count()
    it = InventoryItem(room_id=r.id, label=data["label"], condition=data.get("condition", "bon"),
                       comment=data.get("comment"), position=n)
    db.add(it)
    db.commit()
    return {"id": it.id, "label": it.label, "condition": it.condition, "comment": it.comment, "photos": []}


@app.patch("/backoffice/gestion-locative/items/{item_id}")
async def update_item(item_id: int, request: Request, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    it, inv = _owned_item(db, item_id, principal)
    if it is None:
        return err("Élément introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    data = await json_body(request)
    if "condition" in data:
        if data["condition"] not in ("bon", "moyen", "mauvais"):
            return err("État invalide.", 400)
        it.condition = data["condition"]
    if "comment" in data:
        it.comment = data["comment"]
    if "label" in data and data["label"]:
        it.label = data["label"]
    db.commit()
    return {"id": it.id, "label": it.label, "condition": it.condition, "comment": it.comment}


@app.delete("/backoffice/gestion-locative/items/{item_id}")
def delete_item(item_id: int, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    it, inv = _owned_item(db, item_id, principal)
    if it is None:
        return err("Élément introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    db.query(InventoryPhoto).filter(InventoryPhoto.item_id == it.id).delete()
    db.delete(it)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Finalize + mark-signed** — dans `main.py` (le PDF est généré en Task 4 ; ici on verrouille seulement ; `finalize` posera `pdf_key` une fois `render_inventory_pdf` dispo — pour l'instant, verrou + `finalized_at`)
```python
@app.post("/backoffice/gestion-locative/inventories/{inv_id}/finalize")
def finalize_inventory(inv_id: int, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux déjà finalisé.", 400)
    inv.status = "finalized"
    inv.finalized_at = datetime.utcnow()
    enqueue(db, "inventory", inv.id, events.INVENTORY_FINALIZED, {
        "id": inv.id, "lease_id": inv.lease_id, "type": inv.type})
    db.commit()
    return _inventory_dict(db, inv)


@app.post("/backoffice/gestion-locative/inventories/{inv_id}/mark-signed")
def mark_inventory_signed(inv_id: int, principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    if inv.status == "draft":
        return err("Finalisez l'état des lieux avant de le signer.", 400)
    inv.status = "signed"
    inv.signed_at = datetime.utcnow()
    db.commit()
    return _inventory_dict(db, inv)
```

- [ ] **Step 4: Vérifier** — restart rental. Sur l'EDL créé en Task 1 : ajouter une pièce, un élément, patcher un élément (`condition=mauvais`, commentaire), supprimer une pièce, patcher les notes, `finalize` → statut `finalized` + outbox `rental.inventory.finalized` ; puis toute écriture → **400 (verrouillé)** ; `mark-signed` → `signed`. Vérifier cloisonnement (item/room d'une autre agence → 404).

- [ ] **Step 5: Commit**
```bash
git add services/rental/app/main.py
```
```bash
git commit -m "feat(rental): édition EDL (pièces/éléments/notes) + finalisation/verrouillage + signature manuelle"
```

---

### Task 3: Photos des éléments (S3)

**Files:**
- Modify: `services/rental/app/main.py`

**Interfaces:**
- Produces: `POST /…/items/{item_id}/photos` (upload S3), `GET /…/inventory-photos/{photo_id}` (download, agence du bail), `DELETE /…/inventory-photos/{photo_id}`.

- [ ] **Step 1: Endpoints photos** — dans `main.py` (calque `upload_document` / `download_document` candidature ; `storage`, `uuid`, `Response` déjà importés)
```python
@app.post("/backoffice/gestion-locative/items/{item_id}/photos", status_code=201)
async def upload_item_photo(item_id: int, request: Request,
                            principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    it, inv = _owned_item(db, item_id, principal)
    if it is None:
        return err("Élément introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    body = await request.body()
    if not body:
        return err("Fichier vide.", 400)
    if len(body) > 10 * 1024 * 1024:
        return err("Fichier trop volumineux (max 10 Mo).", 400)
    filename = request.query_params.get("filename", "photo")
    content_type = request.headers.get("content-type", "application/octet-stream")
    from . import storage
    key = f"inventories/{inv.id}/{uuid.uuid4().hex}"
    storage.docs_storage().put(key, body, content_type)
    p = InventoryPhoto(item_id=it.id, file_key=key, filename=filename, content_type=content_type)
    db.add(p)
    db.commit()
    return _photo_dict(p)


@app.get("/backoffice/gestion-locative/inventory-photos/{photo_id}")
def download_item_photo(photo_id: int, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    p = db.get(InventoryPhoto, photo_id)
    it = db.get(InventoryItem, p.item_id) if p else None
    _, inv = _owned_room(db, it.room_id, principal) if it else (None, None)
    if p is None or inv is None:
        return err("Photo introuvable.", 404)
    from . import storage
    data = storage.docs_storage().get(p.file_key)
    return Response(data, media_type=p.content_type or "application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename={p.filename or 'photo'}",
                             "X-Content-Type-Options": "nosniff"})


@app.delete("/backoffice/gestion-locative/inventory-photos/{photo_id}")
def delete_item_photo(photo_id: int, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    p = db.get(InventoryPhoto, photo_id)
    it = db.get(InventoryItem, p.item_id) if p else None
    _, inv = _owned_room(db, it.room_id, principal) if it else (None, None)
    if p is None or inv is None:
        return err("Photo introuvable.", 404)
    if inv.status != "draft":
        return err("État des lieux verrouillé.", 400)
    db.delete(p)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 2: Vérifier** — restart rental (MinIO up). Sur un élément d'un EDL draft : uploader une photo (`--data-binary @/etc/hostname`, `?filename=mur.jpg`) → 201 ; la re-télécharger (200) ; upload en tant qu'autre agence → 404 ; upload sur un EDL finalisé → 400 ; supprimer la photo. Nettoyer.

- [ ] **Step 3: Commit**
```bash
git add services/rental/app/main.py
```
```bash
git commit -m "feat(rental): photos des éléments d'état des lieux (upload/download/suppression S3)"
```

---

### Task 4: PDF de l'état des lieux

**Files:**
- Modify: `services/rental/app/pdf.py` (`render_inventory_pdf`)
- Modify: `services/rental/app/main.py` (endpoint PDF + génération à la finalisation)

**Interfaces:**
- Produces: `pdf.render_inventory_pdf(inv, rooms_items, property_title, tenant_name)`; `GET /…/inventories/{inv_id}.pdf`; `finalize` pose `pdf_key`.

- [ ] **Step 1: `render_inventory_pdf`** — dans `services/rental/app/pdf.py` (patron reportlab existant)
```python
def render_inventory_pdf(inv, rooms, property_title: str, tenant_name: str) -> bytes:
    """État des lieux PDF. `rooms` = liste [{name, items:[{label,condition,comment}]}]."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("H", parent=styles["Heading1"], fontSize=22,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=8)
    rh = ParagraphStyle("RH", parent=styles["Heading2"], fontSize=13,
                        textColor=colors.HexColor("#0F766E"), spaceBefore=10, spaceAfter=4)
    info = ParagraphStyle("I", parent=styles["Normal"], fontSize=10, leading=15)
    label = "d'ENTRÉE" if inv.type == "entree" else "de SORTIE"
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 14),
        Paragraph(f"<b>ÉTAT DES LIEUX {label}</b>", head),
        Paragraph(f"Bien : {property_title or '-'}", info),
        Paragraph(f"Locataire : {tenant_name or '-'}", info),
        Paragraph(f"Date : {inv.conducted_at.strftime('%d/%m/%Y') if inv.conducted_at else '-'}", info),
        Spacer(1, 8),
    ]
    for r in rooms:
        story.append(Paragraph(r["name"], rh))
        for it in r["items"]:
            cond = {"bon": "Bon", "moyen": "Moyen", "mauvais": "Mauvais"}.get(it["condition"], it["condition"])
            line = f"• <b>{it['label']}</b> : {cond}"
            if it.get("comment"):
                line += f" — {it['comment']}"
            story.append(Paragraph(line, info))
    if inv.general_notes:
        story += [Spacer(1, 10), Paragraph("<b>Observations générales</b>", rh),
                  Paragraph(inv.general_notes, info)]
    story += [Spacer(1, 20), Paragraph("Signatures : bailleur / gestionnaire — locataire", info)]
    doc.build(story)
    return buf.getvalue()
```

- [ ] **Step 2: Génération à la finalisation + endpoint PDF** — dans `main.py`.
  Dans `finalize_inventory`, AVANT `db.commit()`, générer et stocker le PDF :
```python
    inv.status = "finalized"
    inv.finalized_at = datetime.utcnow()
    rooms = _inventory_dict(db, inv, full=True)["rooms"]
    lease = db.get(Lease, inv.lease_id)
    prop = db.get(PropertyRO, lease.property_id) if lease else None
    tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
    from . import pdf as pdf_mod, storage
    data = pdf_mod.render_inventory_pdf(
        inv, rooms, property_title=(prop.title if prop else None),
        tenant_name=(f"{tenant.first_name} {tenant.last_name}" if tenant else None))
    key = f"inventories/{inv.id}/edl_{inv.type}.pdf"
    storage.docs_storage().put(key, data, "pdf")
    inv.pdf_key = key
    enqueue(db, "inventory", inv.id, events.INVENTORY_FINALIZED, {...})   # (garder l'enqueue existant)
```
  Endpoint de lecture :
```python
@app.get("/backoffice/gestion-locative/inventories/{inv_id}.pdf")
def inventory_pdf(inv_id: int, principal: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    inv = _owned_inventory(db, inv_id, principal)
    if inv is None:
        return err("État des lieux introuvable.", 404)
    from . import storage
    if inv.pdf_key:
        data = storage.docs_storage().get(inv.pdf_key)
    else:   # PDF à la volée si pas encore finalisé
        rooms = _inventory_dict(db, inv, full=True)["rooms"]
        lease = db.get(Lease, inv.lease_id)
        prop = db.get(PropertyRO, lease.property_id) if lease else None
        tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
        from . import pdf as pdf_mod
        data = pdf_mod.render_inventory_pdf(inv, rooms, prop.title if prop else None,
                                            f"{tenant.first_name} {tenant.last_name}" if tenant else None)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=EDL-{inv.type}-{inv.id}.pdf"})
```

- [ ] **Step 3: Vérifier** — restart rental. Finaliser un EDL rempli → `has_pdf: true` ; GET `.pdf` → `application/pdf`, taille > 1000, `file` = PDF. 404 cross-agency.

- [ ] **Step 4: Commit**
```bash
git add services/rental/app/pdf.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): PDF de l'état des lieux (reportlab) + génération à la finalisation"
```

---

### Task 5: UI back-office — éditeur d'état des lieux (dans le détail du bail)

**Files:**
- Modify: `frontend/src/services/rentalService.js` (méthodes EDL)
- Create: `frontend/src/pages/backoffice/rental/InventoryEditor.jsx`
- Modify: `frontend/src/pages/backoffice/rental/LeaseDetail.jsx` (section « États des lieux »)
- Modify: `frontend/src/App.jsx` (route éditeur)

**Interfaces:**
- Produces: route `/backoffice/gestion-locative/etats-des-lieux/:invId` ; section EDL dans LeaseDetail.

- [ ] **Step 1: `rentalService.js`** — ajouter (au bloc back-office, `B = '/backoffice/gestion-locative'`)
```jsx
  // États des lieux
  listInventories: async (leaseId) => (await api.get(`${B}/leases/${leaseId}/inventories`)).data,
  createInventory: async (leaseId, type) => (await api.post(`${B}/leases/${leaseId}/inventories`, { type })).data,
  getInventory: async (invId) => (await api.get(`${B}/inventories/${invId}`)).data,
  patchInventory: async (invId, data) => (await api.patch(`${B}/inventories/${invId}`, data)).data,
  finalizeInventory: async (invId) => (await api.post(`${B}/inventories/${invId}/finalize`)).data,
  addRoom: async (invId, name) => (await api.post(`${B}/inventories/${invId}/rooms`, { name })).data,
  deleteRoom: async (roomId) => (await api.delete(`${B}/rooms/${roomId}`)).data,
  addItem: async (roomId, data) => (await api.post(`${B}/rooms/${roomId}/items`, data)).data,
  patchItem: async (itemId, data) => (await api.patch(`${B}/items/${itemId}`, data)).data,
  deleteItem: async (itemId) => (await api.delete(`${B}/items/${itemId}`)).data,
  uploadItemPhoto: async (itemId, file) => (await api.post(`${B}/items/${itemId}/photos`, file,
    { params: { filename: file.name }, headers: { 'Content-Type': file.type || 'application/octet-stream' } })).data,
  inventoryPhotoUrl: (photoId) => `${B}/inventory-photos/${photoId}`,
  deleteItemPhoto: async (photoId) => (await api.delete(`${B}/inventory-photos/${photoId}`)).data,
  inventoryPdfUrl: (invId) => `${B}/inventories/${invId}.pdf`,
```

- [ ] **Step 2: `InventoryEditor.jsx`** — éditeur (kit back-office). Charge l'EDL (`getInventory`), affiche pièces → éléments (sélecteur d'état bon/moyen/mauvais, commentaire, photos), permet ajout/suppression, notes générales, « Finaliser » + lien PDF. Un EDL `finalized/signed` est en lecture seule.
```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiPlus, FiTrash2, FiUploadCloud, FiDownload, FiLock, FiCheckCircle } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, EmptyState, GatedNotice, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const COND = { bon: ['Bon', 'bg-emerald-50 text-emerald-700'], moyen: ['Moyen', 'bg-amber-100 text-amber-700'], mauvais: ['Mauvais', 'bg-red-100 text-red-700'] }
async function openPdf(url) {
  try { const r = await api.get(url, { responseType: 'blob' }); const u = URL.createObjectURL(r.data); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000) }
  catch { toast.error('PDF indisponible') }
}

function InventoryEditor() {
  const { invId } = useParams()
  const qc = useQueryClient()
  const { data: inv, isLoading, error } = useQuery(['inventory', invId], () => rentalService.getInventory(invId))
  const [newRoom, setNewRoom] = useState('')
  const refresh = () => qc.invalidateQueries(['inventory', invId])
  const mut = (fn, ok) => useMutation(fn, { onSuccess: () => { if (ok) toast.success(ok); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const addRoom = mut(() => rentalService.addRoom(invId, newRoom), 'Pièce ajoutée')
  const delRoom = mut((rid) => rentalService.deleteRoom(rid))
  const addItem = mut(({ roomId, label }) => rentalService.addItem(roomId, { label }), 'Élément ajouté')
  const patchItem = mut(({ itemId, data }) => rentalService.patchItem(itemId, data))
  const delItem = mut((itemId) => rentalService.deleteItem(itemId))
  const upPhoto = mut(({ itemId, file }) => rentalService.uploadItemPhoto(itemId, file), 'Photo ajoutée')
  const delPhoto = mut((photoId) => rentalService.deleteItemPhoto(photoId))
  const finalize = mut(() => rentalService.finalizeInventory(invId), 'État des lieux finalisé')

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title="État des lieux" message="La gestion locative est réservée aux plans Pro et Entreprise." />
  if (isLoading || !inv) return <div className="p-6 text-gray-500">Chargement…</div>
  const ro = inv.status !== 'draft'   // read-only

  return (
    <div className="space-y-6">
      <Link to={`/backoffice/gestion-locative/baux/${inv.lease_id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour au bail</Link>
      <Panel title={`État des lieux ${inv.type === 'entree' ? "d'entrée" : 'de sortie'}`}
        action={<div className="flex items-center gap-2">
          <StatusBadge label={inv.status} />
          {inv.has_pdf || ro ? <button onClick={() => openPdf(rentalService.inventoryPdfUrl(invId))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> PDF</button> : null}
          {!ro && <button disabled={finalize.isLoading} onClick={() => finalize.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> Finaliser</button>}
        </div>}>
        {ro && <p className="text-sm text-gray-500 mb-2">Cet état des lieux est finalisé et verrouillé (lecture seule).</p>}
        <div className="space-y-5">
          {(inv.rooms || []).map((room) => (
            <div key={room.id} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{room.name}</h3>
                {!ro && <button onClick={() => delRoom.mutate(room.id)} className="text-gray-400 hover:text-red-600"><FiTrash2 className="w-4 h-4" /></button>}
              </div>
              <div className="space-y-2">
                {room.items.map((it) => (
                  <div key={it.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-40 text-gray-700">{it.label}</span>
                    {ro ? <StatusBadge label={COND[it.condition]?.[0] || it.condition} className={COND[it.condition]?.[1]} />
                      : <select value={it.condition} onChange={(e) => patchItem.mutate({ itemId: it.id, data: { condition: e.target.value } })} className="px-2 py-1 border border-gray-200 rounded-lg text-sm">
                          <option value="bon">Bon</option><option value="moyen">Moyen</option><option value="mauvais">Mauvais</option>
                        </select>}
                    <input defaultValue={it.comment || ''} disabled={ro} placeholder="commentaire" onBlur={(e) => !ro && patchItem.mutate({ itemId: it.id, data: { comment: e.target.value } })} className="flex-1 min-w-[140px] px-2 py-1 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50" />
                    {(it.photos || []).map((ph) => <button key={ph.id} onClick={() => openPdf(rentalService.inventoryPhotoUrl(ph.id))} className="text-primary-600 text-xs underline">{ph.filename}</button>)}
                    {!ro && <label className="text-gray-400 hover:text-primary-600 cursor-pointer"><FiUploadCloud className="w-4 h-4" /><input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upPhoto.mutate({ itemId: it.id, file: f }); e.target.value = '' }} /></label>}
                    {!ro && <button onClick={() => delItem.mutate(it.id)} className="text-gray-300 hover:text-red-600"><FiTrash2 className="w-4 h-4" /></button>}
                  </div>
                ))}
                {!ro && <AddItem roomId={room.id} onAdd={(label) => addItem.mutate({ roomId: room.id, label })} />}
              </div>
            </div>
          ))}
        </div>
        {!ro && (
          <div className="flex items-center gap-2 mt-4">
            <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)} placeholder="Nouvelle pièce" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <button disabled={!newRoom} onClick={() => { addRoom.mutate(); setNewRoom('') }} className={SECONDARY_BTN}><FiPlus className="w-4 h-4" /> Ajouter une pièce</button>
          </div>
        )}
      </Panel>
    </div>
  )
}

function AddItem({ onAdd }) {
  const [v, setV] = useState('')
  return (
    <div className="flex items-center gap-2 pt-1">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Ajouter un élément" className="px-2 py-1 border border-gray-200 rounded-lg text-sm" />
      <button disabled={!v} onClick={() => { onAdd(v); setV('') }} className="text-primary-600 hover:text-primary-700 text-sm inline-flex items-center gap-1"><FiPlus className="w-3.5 h-3.5" /> Élément</button>
    </div>
  )
}
export default InventoryEditor
```
> Note : `useMutation` appelé dans le helper `mut()` respecte les règles des hooks (appels inconditionnels, ordre stable à chaque rendu). Garder les appels `mut(...)` au niveau supérieur du composant (comme ci-dessus), pas dans des boucles/conditions.

- [ ] **Step 3: Section « États des lieux » dans `LeaseDetail.jsx`** — ajouter un `Panel` qui liste les EDL du bail (entrée/sortie) via `rentalService.listInventories(id)` (nouveau `useQuery`) avec, pour chaque type, soit un lien « Ouvrir » vers `/backoffice/gestion-locative/etats-des-lieux/{invId}`, soit un bouton « Créer l'EDL d'entrée / de sortie » (mutation `createInventory` → navigate vers l'éditeur). Réutiliser le style Panel + StatusBadge existants de la page.

- [ ] **Step 4: Route** — dans `App.jsx`, importer `InventoryEditor` et ajouter en sibling du bloc gestion-locative : `<Route path="gestion-locative/etats-des-lieux/:invId" element={<InventoryEditor />} />`.

- [ ] **Step 5: Build + vérif** — `cd frontend && npm run build`. Vérifier (lecture) : kit réutilisé, tokens uniquement (pas de hex en dur), `react-icons/fi`, EDL verrouillé en lecture seule, upload photo + lien PDF.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/services/rentalService.js frontend/src/pages/backoffice/rental/InventoryEditor.jsx frontend/src/pages/backoffice/rental/LeaseDetail.jsx frontend/src/App.jsx
```
```bash
git commit -m "feat(front): éditeur d'état des lieux (pièces/éléments/photos) dans le détail du bail"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/emails/catalogue-emails.md` (§3 : « États des lieux » → socle Phase A livré)
- Modify: `docs/architecture-v2-status.md`

- [ ] **Step 1** — noter la Phase A EDL livrée (remplissage entrée/sortie + photos + PDF + UI ; décompte/comparaison/signature = Phases B/C).
- [ ] **Step 2: Commit**
```bash
git add docs/emails/catalogue-emails.md docs/architecture-v2-status.md
```
```bash
git commit -m "docs(rental): état des lieux Phase A (remplissage + photos + PDF + UI)"
```

---

## Self-Review

**Spec coverage (Phase A)** — la spec §12 définit la Phase A = « entités Inventory/Room/Item/Photo + jeu par défaut + endpoints de remplissage (pièces/éléments/photos S3) + PDF EDL + UI éditeur (LeaseDetail) ». Couverture : modèles+create+detail (T1), édition+finalize+verrou (T2), photos S3 (T3), PDF (T4), UI éditeur (T5), docs (T6). ✅ Complet. Décompte de caution + comparaison entrée↔sortie + signature 3a9dSign = Phases B/C (hors périmètre).

**Placeholder scan** — aucun « TBD/TODO ». Le PDF gère l'absence de titre/nom via `'-'`. `finalize` génère et stocke le PDF (Task 4 complète l'enqueue déjà posé en Task 2 — garder l'`enqueue(INVENTORY_FINALIZED)` unique).

**Type/route consistency** — `_inventory_dict(db, inv, full)` renvoie `rooms[].items[].photos[]` — exactement ce que consomme l'éditeur. Les endpoints EDL sont sous `/backoffice/gestion-locative/…` (gated, agency-scopé). `rentalService` frappe exactement ces chemins. Upload photo = corps `File` brut + `?filename=` (le back lit `request.body()`), pas de `FormData`. Verrou `status != 'draft'` sur toutes les écritures. Réutilise `_gate`, `err`, `iso`, `num`, `json_body`, `enqueue`, `storage.docs_storage`, `Response`, `uuid`, `ClientRO`, `PropertyRO`.

**Sécurité** — cloisonnement agence via `_owned_inventory/room/item` (404 uniforme) ; clé S3 serveur (pas de traversal) ; plafond 10 Mo + nosniff ; download contrôlé (agence du bail) ; EDL finalisé verrouillé.

**Note d'exécution** — restart `rental` après T1/T2/T3/T4 (nouveaux endpoints/tables ; MinIO up pour T3/T4). T5 : `npm run build` + revue de charte. Le worker/relay ne sont pas requis en Phase A (pas d'email ; `INVENTORY_FINALIZED` est émis mais non consommé — c'est voulu, prévu pour usage futur). Restart via `run_in_background: true`.
