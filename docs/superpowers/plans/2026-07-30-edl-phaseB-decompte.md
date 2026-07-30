# État des lieux — Phase B (décompte de caution + comparaison) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À partir de l'EDL de sortie (Phase A), permettre à l'agence de bâtir un **décompte de caution** : lignes de retenue chiffrées, calcul automatique de la **caution restituée** et du **solde à réclamer si les dégâts dépassent la caution**, une **vue comparaison** entrée↔sortie, la **finalisation** qui pilote la restitution du dépôt, et l'**email de décompte de sortie** (avec PDF joint). Signature 3a9dSign = Phase C (plan séparé).

**Architecture:** Extension du service `rental` (nouvelles entités `DepositSettlement`/`DeductionLine` liées au `Lease`), d'un endpoint de comparaison des EDL, d'un nouvel événement `rental.deposit.settled` consommé par `notification` (email + PDF joint via endpoint interne à jeton), et de l'UI back-office (page décompte reliée au détail du bail). Réutilise les patrons existants (deposit-return, quittance + pièce jointe, kit back-office EDL Phase A).

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (`Numeric`), reportlab, httpx, RabbitMQ (semsar_events) ; React 18 + react-query 3 + react-icons/fi + Tailwind.

## Global Constraints

- Service/schéma/rôle `rental` (port 8518) ; `notification` (worker + SMTP). Erreurs `{"error": "..."}` via `err()`.
- Toute route back-office : `_gate(principal)` d'abord, puis cloisonnement `agency_id` (404 sinon). Endpoints internes à `x-internal-token` (`x_internal_token != settings.internal_token → err("Forbidden", 403)`).
- **Un décompte/lignes finalisé est verrouillé** : refuser l'édition si `settlement.status != 'draft'`.
- **Calcul** (au `finalize`) : `total = Σ lignes.amount` ; `refunded = max(0, deposit − total)` ; `balance_due = max(0, total − deposit)`.
- **Anti-doublon dépôt** : `finalize` refuse (400) si `lease.deposit_returned_at is not None` (une restitution simple OU un décompte a déjà eu lieu). La finalisation pose `lease.deposit_returned_at = now()` et `lease.deposit_return_amount = refunded` — exclusif avec la route `deposit-return` existante.
- Un décompte est **unique par bail** (`UNIQUE(lease_id)`).
- Montants JSON via `num(...)`. Devise `Đh`. Design SemsarOut : kit `components/backoffice/ui.jsx` + tokens, `react-icons/fi`, react-query + `react-toastify`, 403 → `GatedNotice`. Emails : contenu aligné à gauche, boutons/hero/footer centrés (patron existant), lien « Voir le bien » si `property_id`.
- Nouvel événement `rental.deposit.settled` : **doit** être ajouté à `bindings=[...]` dans `services/notification/app/worker.py` (pas de wildcard `rental.#`), sinon l'email n'est jamais déclenché.
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. CRITIQUE : `git commit` = commande bash SEULE (jamais `git add && git commit` — un hook du repo produit un faux positif sur la forme composée). `git add` puis `git commit` = deux appels Bash séparés.
- DB dev = `semsar_dev`. Lancer un service pour vérifier via le paramètre Bash `run_in_background: true` (un `&` final est tué au retour de l'appel). Restart `rental` après ajout d'endpoints/tables ; restart le worker `notification` pour la Task 3 ; `npm run build` doit passer après la Task 4.
- **Périmètre Phase B** : décompte (lignes + calcul + finalisation + restitution dépôt), comparaison entrée↔sortie, email de décompte de sortie + PDF. HORS Phase B : signature 3a9dSign (Phase C).

---

### Task 1: Décompte — modèles, création/lecture, lignes de retenue, comparaison EDL

**Files:**
- Modify: `services/rental/app/models.py` (DepositSettlement, DeductionLine)
- Modify: `services/rental/app/events.py` (`DEPOSIT_SETTLED`)
- Modify: `services/rental/app/main.py` (helpers + endpoints décompte + comparaison)

**Interfaces:**
- Produces: `models.DepositSettlement/DeductionLine`; `events.DEPOSIT_SETTLED`; `_settlement_dict(db, s)`, `_owned_settlement(db, sid, principal)`; `POST/GET /backoffice/gestion-locative/leases/{id}/settlement`; `POST /…/settlements/{sid}/lines`, `DELETE /…/deduction-lines/{lid}`; `GET /…/leases/{id}/inventories/compare`. Consumes Phase A: `_owned_item`, `Inventory/InventoryRoom/InventoryItem`, `_gate`, `err`, `num`, `iso`, `json_body`, `Lease`.

- [ ] **Step 1: Modèles** — dans `services/rental/app/models.py` (après les entités Inventory de Phase A)
```python
class DepositSettlement(Base):
    __tablename__ = "deposit_settlement"
    __table_args__ = (UniqueConstraint("lease_id", name="uq_settlement_lease"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    deposit_amount = Column(Numeric(12, 2), default=0)        # snapshot caution au décompte
    total_deductions = Column(Numeric(12, 2), default=0)
    refunded_amount = Column(Numeric(12, 2), default=0)
    balance_due = Column(Numeric(12, 2), default=0)           # solde à réclamer (dégâts > caution)
    status = Column(String(20), default="draft")             # draft | finalized
    finalized_at = Column(DateTime)
    sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DeductionLine(Base):
    __tablename__ = "deduction_line"
    id = Column(Integer, primary_key=True, autoincrement=True)
    settlement_id = Column(Integer, index=True, nullable=False)
    label = Column(String(160), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    item_id = Column(Integer)                                 # rattachement facultatif à un élément dégradé
    created_at = Column(DateTime, default=datetime.utcnow)
```
(`Numeric`, `UniqueConstraint`, `Text` déjà importés.)

- [ ] **Step 2: Événement** — dans `services/rental/app/events.py`, ajouter :
```python
DEPOSIT_SETTLED = "rental.deposit.settled"
```

- [ ] **Step 3: Import + helpers** — dans `main.py`, ajouter `DeductionLine, DepositSettlement` à l'import `from .models import (...)`, puis :
```python
def _owned_settlement(db, sid: int, principal: Principal):
    s = db.get(DepositSettlement, sid)
    if s is None or s.agency_id != principal.agency_id:
        return None
    return s


def _settlement_dict(db: Session, s: DepositSettlement) -> dict:
    lines = (db.query(DeductionLine).filter(DeductionLine.settlement_id == s.id)
             .order_by(DeductionLine.id).all())
    total = sum((l.amount or 0) for l in lines)
    deposit = s.deposit_amount or 0
    refunded = deposit - total if deposit > total else 0
    balance = total - deposit if total > deposit else 0
    return {"id": s.id, "lease_id": s.lease_id, "status": s.status,
            "deposit_amount": num(deposit), "total_deductions": num(total),
            "refunded_amount": num(refunded), "balance_due": num(balance),
            "finalized_at": iso(s.finalized_at),
            "lines": [{"id": l.id, "label": l.label, "amount": num(l.amount),
                       "item_id": l.item_id} for l in lines]}
```
> Le décompte calcule `total/refunded/balance` **en direct** depuis les lignes pour l'affichage (brouillon). La Task 2 (`finalize`) fige ces valeurs dans les colonnes pour l'email/PDF.

- [ ] **Step 4: Endpoints décompte (création/lecture + lignes)** — dans `main.py`
```python
@app.post("/backoffice/gestion-locative/leases/{lease_id}/settlement", status_code=201)
def create_settlement(lease_id: int, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    if db.query(DepositSettlement).filter(DepositSettlement.lease_id == lease_id).first():
        return err("Un décompte existe déjà pour ce bail.", 400)
    s = DepositSettlement(lease_id=lease_id, agency_id=principal.agency_id,
                          deposit_amount=l.deposit_amount or 0)
    db.add(s)
    db.commit()
    return _settlement_dict(db, s)


@app.get("/backoffice/gestion-locative/leases/{lease_id}/settlement")
def get_settlement(lease_id: int, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    s = db.query(DepositSettlement).filter(DepositSettlement.lease_id == lease_id).first()
    if s is None:
        return err("Aucun décompte pour ce bail.", 404)
    return _settlement_dict(db, s)


@app.post("/backoffice/gestion-locative/settlements/{sid}/lines", status_code=201)
async def add_deduction_line(sid: int, request: Request,
                             principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    s = _owned_settlement(db, sid, principal)
    if s is None:
        return err("Décompte introuvable.", 404)
    if s.status != "draft":
        return err("Décompte verrouillé (finalisé).", 400)
    data = await json_body(request)
    label = (data.get("label") or "").strip()
    if not label:
        return err("Le libellé de la retenue est requis.", 400)
    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        return err("Montant invalide.", 400)
    if amount <= 0:
        return err("Le montant doit être positif.", 400)
    item_id = data.get("item_id")
    if item_id is not None:   # rattachement facultatif : l'élément doit appartenir à un EDL de ce bail
        it, inv = _owned_item(db, item_id, principal)
        if it is None or inv.lease_id != s.lease_id:
            return err("Élément invalide pour ce bail.", 400)
    line = DeductionLine(settlement_id=s.id, label=label, amount=amount, item_id=item_id)
    db.add(line)
    db.commit()
    return _settlement_dict(db, s)


@app.delete("/backoffice/gestion-locative/deduction-lines/{line_id}")
def delete_deduction_line(line_id: int, principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    line = db.get(DeductionLine, line_id)
    s = _owned_settlement(db, line.settlement_id, principal) if line else None
    if line is None or s is None:
        return err("Ligne introuvable.", 404)
    if s.status != "draft":
        return err("Décompte verrouillé.", 400)
    db.delete(line)
    db.commit()
    return _settlement_dict(db, s)
```

- [ ] **Step 5: Endpoint comparaison EDL** — dans `main.py`
```python
_COND_RANK = {"bon": 0, "moyen": 1, "mauvais": 2}


@app.get("/backoffice/gestion-locative/leases/{lease_id}/inventories/compare")
def compare_inventories(lease_id: int, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    invs = {i.type: i for i in db.query(Inventory).filter(Inventory.lease_id == lease_id).all()}
    entree, sortie = invs.get("entree"), invs.get("sortie")

    def _by_room(inv):
        out = {}
        if inv is None:
            return out
        rooms = db.query(InventoryRoom).filter(InventoryRoom.inventory_id == inv.id).all()
        for r in rooms:
            items = db.query(InventoryItem).filter(InventoryItem.room_id == r.id).all()
            out[r.name] = {it.label: it for it in items}
        return out

    e_rooms, s_rooms = _by_room(entree), _by_room(sortie)
    room_names = list(dict.fromkeys(list(e_rooms.keys()) + list(s_rooms.keys())))
    rooms = []
    for rname in room_names:
        e_items, s_items = e_rooms.get(rname, {}), s_rooms.get(rname, {})
        labels = list(dict.fromkeys(list(e_items.keys()) + list(s_items.keys())))
        items = []
        for label in labels:
            ei, si = e_items.get(label), s_items.get(label)
            degraded = bool(ei and si and _COND_RANK.get(si.condition, 0) > _COND_RANK.get(ei.condition, 0))
            items.append({"label": label,
                          "entree": ei.condition if ei else None,
                          "sortie": si.condition if si else None,
                          "sortie_comment": si.comment if si else None,
                          "sortie_item_id": si.id if si else None,
                          "degraded": degraded})
        rooms.append({"name": rname, "items": items})
    return {"has_entree": entree is not None, "has_sortie": sortie is not None, "rooms": rooms}
```

- [ ] **Step 6: Tables + vérif** — créer les tables :
```bash
cd /home/younes/Documents/work/0semsar
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" PYTHONPATH=services/rental python3 -c "from app.db import init_db; init_db(); print('ok')"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "\dt rental.deposit_settlement rental.deduction_line"
```
Restart rental (Bash `run_in_background: true`, env : `DATABASE_URL=...semsar_dev TRUST_GATEWAY_HEADERS=true INTERNAL_TOKEN=change-me-internal RABBITMQ_URL=amqp://semsar:semsar@localhost:5672/ EVENTS_EXCHANGE=semsar.events LISTING_URL=http://localhost:8012 CRM_URL=http://localhost:8013 IDENTITY_URL=http://localhost:8501 S3_ENDPOINT_URL=http://localhost:9000 S3_ACCESS_KEY=semsar S3_SECRET_KEY=semsar-secret RENTAL_DOCS_BUCKET=semsar-rental-docs`). Avec un bail de démo (agence 1) ayant un `deposit_amount` (ex. bail 16) :
```bash
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases/16/settlement $H | python3 -m json.tool
# -> snapshot deposit_amount, total 0, refunded=deposit, balance 0. Note l'id (sid).
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/settlements/<sid>/lines $H -d '{"label":"Plan de travail brûlé","amount":1500}' | python3 -m json.tool
# -> total 1500, refunded = deposit-1500. Ajoute une 2e ligne qui dépasse la caution -> balance_due > 0, refunded 0.
curl -s http://localhost:8518/backoffice/gestion-locative/leases/16/inventories/compare $H | python3 -m json.tool | head -30
```
Vérifs : montant ≤ 0 → 400 ; `item_id` d'un autre bail → 400 ; doublon décompte → 400 ; cross-agency (agence 999) sur settlement/lines/compare → 404. Nettoyer (`DELETE FROM rental.deduction_line; DELETE FROM rental.deposit_settlement;`) ou garder pour la Task 2.

- [ ] **Step 7: Commits** (deux changements logiques)
```bash
git add services/rental/app/models.py services/rental/app/events.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): décompte de caution — modèles + lignes de retenue + calcul en direct"
```
Puis, si tu préfères isoler la comparaison, elle peut être commitée séparément ; sinon le commit ci-dessus couvre l'ensemble de la Task 1 (endpoints décompte + comparaison). Un seul commit est acceptable ici.

---

### Task 2: Finalisation (calcul + restitution dépôt + événement) + PDF du décompte

**Files:**
- Modify: `services/rental/app/pdf.py` (`render_settlement_pdf`)
- Modify: `services/rental/app/main.py` (finalize + endpoints PDF back-office & interne)

**Interfaces:**
- Produces: `pdf.render_settlement_pdf(s, lines, tenant_name, landlord_name, property_title)`; `POST /…/settlements/{sid}/finalize`; `GET /…/settlements/{sid}.pdf`; `GET /internal/settlements/{sid}.pdf`. Émet `events.DEPOSIT_SETTLED`.

- [ ] **Step 1: `render_settlement_pdf`** — dans `services/rental/app/pdf.py` (mirror `render_receipt_pdf`)
```python
def render_settlement_pdf(s, lines, tenant_name: str, landlord_name: str, property_title: str) -> bytes:
    """Décompte de caution PDF. `s` = DepositSettlement finalisé ; `lines` = liste DeductionLine."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("Header", parent=styles["Heading1"], fontSize=24,
                          textColor=colors.HexColor("#0B1220"), spaceAfter=10)
    info = ParagraphStyle("Info", parent=styles["Normal"], fontSize=10, leading=16)

    def money(v):
        return f"{float(v or 0):,.2f} Đh".replace(",", " ")

    deposit = float(s.deposit_amount or 0)
    total = float(s.total_deductions or 0)
    refunded = float(s.refunded_amount or 0)
    balance = float(s.balance_due or 0)
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph("<b>DÉCOMPTE DE CAUTION</b>", head),
        Paragraph(f"Bien : {property_title or '-'}", info),
        Paragraph(f"Bailleur : {landlord_name or '-'}", info),
        Paragraph(f"Locataire : {tenant_name or '-'}", info),
        Spacer(1, 12),
        Paragraph(f"Dépôt de garantie : {money(deposit)}", info),
        Paragraph("<b>Retenues :</b>", info),
    ]
    if lines:
        for l in lines:
            story.append(Paragraph(f"• {l.label} : {money(l.amount)}", info))
    else:
        story.append(Paragraph("• Aucune retenue", info))
    story += [
        Paragraph(f"<b>Total des retenues : {money(total)}</b>", info),
        Spacer(1, 8),
        Paragraph(f"<b>Caution restituée : {money(refunded)}</b>", info),
    ]
    if balance > 0:
        story.append(Paragraph(f"<b>Solde restant à la charge du locataire : {money(balance)}</b>", info))
    story += [Spacer(1, 12),
              Paragraph("Décompte établi sur la base de l'état des lieux de sortie contradictoire.", info)]
    doc.build(story)
    return buf.getvalue()
```

- [ ] **Step 2: `finalize_settlement`** — dans `main.py`
```python
@app.post("/backoffice/gestion-locative/settlements/{sid}/finalize")
def finalize_settlement(sid: int, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    s = _owned_settlement(db, sid, principal)
    if s is None:
        return err("Décompte introuvable.", 404)
    if s.status != "draft":
        return err("Décompte déjà finalisé.", 400)
    lease = db.get(Lease, s.lease_id)
    if lease is None:
        return err("Bail introuvable.", 404)
    if lease.deposit_returned_at is not None:
        return err("Dépôt déjà restitué pour ce bail.", 400)
    lines = db.query(DeductionLine).filter(DeductionLine.settlement_id == s.id).all()
    total = sum((l.amount or 0) for l in lines)
    deposit = s.deposit_amount or 0
    refunded = deposit - total if deposit > total else 0
    balance = total - deposit if total > deposit else 0
    s.total_deductions = total
    s.refunded_amount = refunded
    s.balance_due = balance
    s.status = "finalized"
    s.finalized_at = datetime.utcnow()
    s.sent_at = datetime.utcnow()
    lease.deposit_returned_at = datetime.utcnow()
    lease.deposit_return_amount = refunded
    enqueue(db, "lease", lease.id, events.DEPOSIT_SETTLED, {
        "id": s.id, "lease_id": lease.id, "tenant_client_id": lease.tenant_client_id,
        "property_id": lease.property_id, "deposit_amount": num(deposit),
        "total_deductions": num(total), "refunded_amount": num(refunded),
        "balance_due": num(balance)})
    db.commit()
    return _settlement_dict(db, s)
```

- [ ] **Step 3: Endpoints PDF** — dans `main.py` (rendu à la volée, comme `receipt.pdf` ; helper commun pour les noms)
```python
def _settlement_pdf_bytes(db, s):
    lines = db.query(DeductionLine).filter(DeductionLine.settlement_id == s.id).order_by(DeductionLine.id).all()
    lease = db.get(Lease, s.lease_id)
    mandate = db.get(Mandate, lease.mandate_id) if lease else None
    tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
    landlord = db.get(ClientRO, mandate.landlord_client_id) if mandate else None
    prop = db.get(PropertyRO, lease.property_id) if lease else None
    from . import pdf as pdf_mod
    return pdf_mod.render_settlement_pdf(
        s, lines,
        tenant_name=(f"{tenant.first_name} {tenant.last_name}" if tenant else None),
        landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        property_title=(prop.title if prop else None))


@app.get("/backoffice/gestion-locative/settlements/{sid}.pdf")
def settlement_pdf(sid: int, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    s = _owned_settlement(db, sid, principal)
    if s is None:
        return err("Décompte introuvable.", 404)
    data = _settlement_pdf_bytes(db, s)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=decompte-caution-{sid}.pdf"})


@app.get("/internal/settlements/{sid}.pdf", include_in_schema=False)
def internal_settlement_pdf(sid: int, x_internal_token: str = Header(default=""),
                            db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    s = db.get(DepositSettlement, sid)
    if s is None:
        return err("Décompte introuvable.", 404)
    data = _settlement_pdf_bytes(db, s)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=decompte-caution-{sid}.pdf"})
```
> **Route ordering** : enregistrer `settlements/{sid}.pdf` AVANT toute route `settlements/{sid}/...` n'est pas nécessaire (le suffixe `.pdf` + le segment distinct évitent la collision), mais placer la route `.pdf` près des autres `settlements/*`. Si un 422 apparaît sur `{sid}.pdf`, déplacer cette route avant une éventuelle route `settlements/{sid}` bare (il n'y en a pas ici).

- [ ] **Step 4: Vérif** — restart rental. Sur le décompte de la Task 1 (avec des lignes) : `finalize` → `status:"finalized"`, `refunded_amount`/`balance_due` figés, et le bail passe `deposit_returned_at` non nul + `deposit_return_amount = refunded` (vérifier en base). Re-`finalize` → 400. `finalize` sur un bail dont le dépôt est déjà restitué (poser `deposit_returned_at` à la main sur un autre bail) → 400. `GET settlements/{sid}.pdf` → `application/pdf`, taille > 1000, `file` = PDF (avec les lignes + solde si dégâts > caution). `GET /internal/settlements/{sid}.pdf` avec le bon `x-internal-token` → 200 ; mauvais token → 403. Vérifier qu'une ligne outbox `rental.deposit.settled` a été écrite. Nettoyer.

- [ ] **Step 5: Commit**
```bash
git add services/rental/app/pdf.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): finalisation du décompte (calcul + restitution dépôt + événement) + PDF"
```

---

### Task 3: Email de décompte de sortie (notification) + PDF joint

**Files:**
- Modify: `services/notification/app/handlers.py` (`_fetch_settlement_pdf`, `_handle_deposit_settled`, branche dispatch)
- Modify: `services/notification/app/worker.py` (binding `rental.deposit.settled`)
- Create: `services/notification/app/templates/deposit_settlement.html`

**Interfaces:**
- Consumes: `events.DEPOSIT_SETTLED` payload (`id, lease_id, tenant_client_id, property_id, deposit_amount, total_deductions, refunded_amount, balance_due`), rental internal `GET /internal/settlements/{sid}.pdf`.

- [ ] **Step 1: Helper fetch PDF** — dans `services/notification/app/handlers.py` (mirror `_fetch_receipt_pdf`)
```python
def _fetch_settlement_pdf(settlement_id):
    """PDF du décompte via l'endpoint interne (token-auth) de `rental`. `None` si échec (email
    envoyé sans pièce jointe — pas de blocage)."""
    base = os.environ.get("RENTAL_URL", "http://localhost:8518")
    try:
        r = httpx.get(f"{base}/internal/settlements/{settlement_id}.pdf",
                      headers={"x-internal-token": os.environ.get("INTERNAL_TOKEN", "")}, timeout=10.0)
        return r.content if r.status_code == 200 else None
    except httpx.HTTPError:
        return None
```

- [ ] **Step 2: Handler** — dans `handlers.py` (mirror `_handle_rent_paid` + `_handle_deposit_returned`)
```python
def _handle_deposit_settled(db, payload: dict) -> None:
    """`rental.deposit.settled` : décompte de sortie au locataire (retenues + restitué + solde)."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    pdf = _fetch_settlement_pdf(payload.get("id"))
    atts = [(f"Decompte-caution-{payload.get('id')}.pdf", pdf, "pdf")] if pdf else None
    _try_send(db, to, "deposit_settlement.html", "deposit_settlement", from_email=_contact(),
              attachments=atts, name=tenant.get("name"),
              deposit_amount=payload.get("deposit_amount"),
              total_deductions=payload.get("total_deductions"),
              refunded_amount=payload.get("refunded_amount"),
              balance_due=payload.get("balance_due"),
              property_id=payload.get("property_id"))
```

- [ ] **Step 3: Branche dispatch** — dans `handle_event` (`handlers.py`), après la branche `rental.deposit.returned` :
```python
        elif routing_key == "rental.deposit.settled":
            _handle_deposit_settled(db, payload)
```

- [ ] **Step 4: Binding worker** — dans `services/notification/app/worker.py`, ajouter `"rental.deposit.settled"` à la liste `bindings=[...]` (à côté de `"rental.deposit.returned"`).

- [ ] **Step 5: Gabarit email** — créer `services/notification/app/templates/deposit_settlement.html`.
  **Méthode** : COPIER `services/notification/app/templates/deposit_return.html` verbatim (même `{% extends %}`, mêmes blocs `subject`/contenu, mêmes macros `button(...)`, même structure header/hero/footer centrés + **contenu aligné à gauche**), puis adapter le contenu :
  - Sujet : `Décompte de votre dépôt de garantie`.
  - Corps (aligné à gauche) : salutation `{{ name }}`, une phrase d'intro, puis le récapitulatif :
    - `Dépôt de garantie : {{ deposit_amount }} {{ currency }}`
    - `Total des retenues : {{ total_deductions }} {{ currency }}`
    - `Caution restituée : {{ refunded_amount }} {{ currency }}`
    - un bloc **conditionnel** : `{% if balance_due and balance_due|float > 0 %}` → mention en évidence `Solde restant à votre charge : {{ balance_due }} {{ currency }}` + phrase indiquant qu'un décompte détaillé est joint et que l'agence reviendra vers le locataire pour le règlement ; `{% else %}` → phrase de clôture « le solde vous sera restitué ».
    - le **PDF détaillé** est joint à l'email (le mentionner).
  - Lien vers le bien (comme sur les emails candidature) : `{% if property_id %}` un `<table role="presentation" width="100%"><tr><td align="center">{{ button(app.base_url ~ "/annonces/" ~ property_id, "Voir le bien") }}</td></tr></table>{% endif %}`.
  Respecter la charte email existante (couleurs via `brand`, `currency` = `Đh`). Ne pas inventer de nouvelles macros — réutiliser celles de `deposit_return.html`/`base.html`.

- [ ] **Step 6: Vérif (E2E)** — restart le worker notification et le relay/rental si besoin (via Bash `run_in_background: true`, env SMTP depuis `services/notification/.env` + `RENTAL_URL=http://localhost:8518 INTERNAL_TOKEN=change-me-internal`). Test de rendu isolé d'abord :
```bash
cd /home/younes/Documents/work/0semsar
PYTHONPATH=services/notification python3 -c "
from app.render import render_email
s,h,t = render_email('deposit_settlement.html', name='Younes', deposit_amount=13000, total_deductions=15000, refunded_amount=0, balance_due=2000, property_id=2, currency='Đh')
print('SUBJECT:', s); print('has solde:', 'Solde' in h); print('has link:', '/annonces/2' in h)
"
```
Expected : sujet correct, `has solde: True`, `has link: True`. Puis, si l'env SMTP + RabbitMQ tourne, finaliser un décompte via l'API (Task 2) et vérifier dans les logs `notification` la ligne `deposit_settlement | sent` (PDF joint récupéré via l'endpoint interne). Sinon, documenter le rendu isolé comme preuve et signaler que l'E2E complet nécessite le mesh (`bash scripts/dev-mesh-up.sh`).

- [ ] **Step 7: Commit**
```bash
git add services/notification/app/handlers.py services/notification/app/worker.py services/notification/app/templates/deposit_settlement.html
```
```bash
git commit -m "feat(notification): email de décompte de sortie (retenues + solde) avec PDF joint"
```

---

### Task 4: UI back-office — comparaison + décompte de caution

**Files:**
- Modify: `frontend/src/services/rentalService.js` (méthodes décompte/comparaison)
- Create: `frontend/src/pages/backoffice/rental/SettlementEditor.jsx`
- Modify: `frontend/src/pages/backoffice/rental/LeaseDetail.jsx` (lien « Décompte de sortie »)
- Modify: `frontend/src/App.jsx` (route)

**Interfaces:**
- Produces: route `/backoffice/gestion-locative/decompte/:leaseId` ; lien depuis LeaseDetail.

- [ ] **Step 1: `rentalService.js`** — ajouter au bloc back-office (`B = '/backoffice/gestion-locative'`)
```jsx
  // Décompte de caution + comparaison EDL
  getSettlement: async (leaseId) => (await api.get(`${B}/leases/${leaseId}/settlement`)).data,
  createSettlement: async (leaseId) => (await api.post(`${B}/leases/${leaseId}/settlement`)).data,
  addDeductionLine: async (sid, data) => (await api.post(`${B}/settlements/${sid}/lines`, data)).data,
  deleteDeductionLine: async (lineId) => (await api.delete(`${B}/deduction-lines/${lineId}`)).data,
  finalizeSettlement: async (sid) => (await api.post(`${B}/settlements/${sid}/finalize`)).data,
  settlementPdfUrl: (sid) => `${B}/settlements/${sid}.pdf`,
  compareInventories: async (leaseId) => (await api.get(`${B}/leases/${leaseId}/inventories/compare`)).data,
```

- [ ] **Step 2: `SettlementEditor.jsx`** — page décompte (kit back-office). Charge le décompte (`getSettlement` ; 404 → bouton « Créer le décompte ») et la comparaison (`compareInventories`). Affiche : la comparaison entrée↔sortie (dégradations surlignées), les lignes de retenue (ajout libellé + montant + rattachement facultatif à un élément dégradé, suppression), le calcul en direct (dépôt / total / restitué / **solde à réclamer** en rouge si > 0), « Finaliser le décompte » + lien PDF. Lecture seule si `status === 'finalized'`.
```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiPlus, FiTrash2, FiDownload, FiLock, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, Field, EmptyState, GatedNotice, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const COND = { bon: ['Bon', 'bg-emerald-50 text-emerald-700'], moyen: ['Moyen', 'bg-amber-100 text-amber-700'], mauvais: ['Mauvais', 'bg-red-100 text-red-700'] }
const money = (v) => `${Number(v || 0).toLocaleString('fr-FR')} Đh`
async function openPdf(url) {
  try { const r = await api.get(url, { responseType: 'blob' }); const u = URL.createObjectURL(r.data); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000) }
  catch { toast.error('PDF indisponible') }
}

function SettlementEditor() {
  const { leaseId } = useParams()
  const qc = useQueryClient()
  const { data: s, isLoading, error } = useQuery(['settlement', leaseId], () => rentalService.getSettlement(leaseId), { retry: false })
  const { data: cmp } = useQuery(['inv-compare', leaseId], () => rentalService.compareInventories(leaseId), { retry: false })
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [itemId, setItemId] = useState('')
  const refresh = () => qc.invalidateQueries(['settlement', leaseId])
  const notFound = error?.response?.status === 404

  const create = useMutation(() => rentalService.createSettlement(leaseId), { onSuccess: () => { toast.success('Décompte créé'); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const addLine = useMutation(() => rentalService.addDeductionLine(s.id, { label, amount: Number(amount), item_id: itemId ? Number(itemId) : null }), { onSuccess: () => { toast.success('Retenue ajoutée'); setLabel(''); setAmount(''); setItemId(''); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const delLine = useMutation((lineId) => rentalService.deleteDeductionLine(lineId), { onSuccess: refresh, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const finalize = useMutation(() => rentalService.finalizeSettlement(s.id), { onSuccess: () => { toast.success('Décompte finalisé — email envoyé au locataire'); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title="Décompte de caution" message="La gestion locative est réservée aux plans Pro et Entreprise." />
  if (isLoading) return <div className="p-6 text-gray-500">Chargement…</div>

  const degraded = []
  ;(cmp?.rooms || []).forEach((r) => r.items.forEach((it) => { if (it.degraded && it.sortie_item_id) degraded.push({ ...it, room: r.name }) }))
  const ro = s && s.status === 'finalized'

  return (
    <div className="space-y-6">
      <Link to={`/backoffice/gestion-locative/baux/${leaseId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour au bail</Link>

      {cmp && (
        <Panel title="Comparaison entrée ↔ sortie">
          {!cmp.has_sortie ? <EmptyState title="Pas d'état des lieux de sortie" description="Réalisez l'EDL de sortie pour comparer et justifier les retenues." /> : (
            <div className="space-y-4">
              {cmp.rooms.map((r) => (
                <div key={r.name}>
                  <h4 className="font-medium text-gray-900 mb-1">{r.name}</h4>
                  <div className="space-y-1">
                    {r.items.map((it) => (
                      <div key={it.label} className={`flex flex-wrap items-center gap-2 text-sm px-2 py-1 rounded-lg ${it.degraded ? 'bg-red-50' : ''}`}>
                        <span className="w-40 text-gray-700">{it.label}</span>
                        <StatusBadge label={COND[it.entree]?.[0] || '—'} className={COND[it.entree]?.[1] || 'bg-gray-100 text-gray-500'} />
                        <span className="text-gray-400">→</span>
                        <StatusBadge label={COND[it.sortie]?.[0] || '—'} className={COND[it.sortie]?.[1] || 'bg-gray-100 text-gray-500'} />
                        {it.degraded && <span className="inline-flex items-center gap-1 text-red-600 text-xs"><FiAlertTriangle className="w-3.5 h-3.5" /> dégradé</span>}
                        {it.sortie_comment && <span className="text-gray-500 text-xs">— {it.sortie_comment}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Décompte de caution"
        action={s && <div className="flex items-center gap-2">
          <StatusBadge label={ro ? 'Finalisé' : 'Brouillon'} className={ro ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-700'} />
          <button onClick={() => openPdf(rentalService.settlementPdfUrl(s.id))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> PDF</button>
          {!ro && <button disabled={finalize.isLoading} onClick={() => finalize.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> Finaliser</button>}
        </div>}>
        {notFound || !s ? (
          <EmptyState title="Aucun décompte" description="Créez le décompte pour saisir les retenues sur la caution."
            action={<button onClick={() => create.mutate()} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> Créer le décompte</button>} />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              {s.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-sm border-b border-gray-100 py-1">
                  <span className="text-gray-700">{l.label}</span>
                  <span className="flex items-center gap-3"><span className="text-gray-900 font-medium">{money(l.amount)}</span>
                    {!ro && <button onClick={() => delLine.mutate(l.id)} className="text-gray-300 hover:text-red-600"><FiTrash2 className="w-4 h-4" /></button>}</span>
                </div>
              ))}
              {s.lines.length === 0 && <p className="text-sm text-gray-400">Aucune retenue.</p>}
            </div>

            {!ro && (
              <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                <div className="flex-1 min-w-[160px]"><Field label="Libellé de la retenue" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Plan de travail brûlé" /></div>
                <div className="w-32"><Field label="Montant (Đh)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="px-2 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">Élément (facultatif)</option>
                  {degraded.map((d) => <option key={d.sortie_item_id} value={d.sortie_item_id}>{d.room} — {d.label}</option>)}
                </select>
                <button disabled={!label || !amount || addLine.isLoading} onClick={() => addLine.mutate()} className={SECONDARY_BTN}><FiPlus className="w-4 h-4" /> Ajouter</button>
              </div>
            )}

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-gray-100 pt-3 text-sm">
              <div><dt className="text-gray-500">Dépôt</dt><dd className="mt-1 text-gray-900 font-medium">{money(s.deposit_amount)}</dd></div>
              <div><dt className="text-gray-500">Total retenues</dt><dd className="mt-1 text-gray-900 font-medium">{money(s.total_deductions)}</dd></div>
              <div><dt className="text-gray-500">Caution restituée</dt><dd className="mt-1 text-emerald-700 font-semibold">{money(s.refunded_amount)}</dd></div>
              <div><dt className="text-gray-500">Solde à réclamer</dt><dd className={`mt-1 font-semibold ${Number(s.balance_due) > 0 ? 'text-red-600' : 'text-gray-400'}`}>{money(s.balance_due)}</dd></div>
            </dl>
            {Number(s.balance_due) > 0 && <p className="text-sm text-red-600 inline-flex items-center gap-1"><FiAlertTriangle className="w-4 h-4" /> Les dégâts dépassent la caution : un solde reste à la charge du locataire (recouvrement à traiter hors plateforme).</p>}
          </div>
        )}
      </Panel>
    </div>
  )
}
export default SettlementEditor
```
> Le `Field` du kit doit accepter `label`/`value`/`onChange`/`type`/`placeholder` (vérifier dans `ui.jsx` ; l'éditeur EDL Phase A l'utilise déjà). Si `EmptyState` n'accepte pas de prop `action`, placer le bouton « Créer le décompte » juste sous l'`EmptyState` au lieu de le passer en prop.

- [ ] **Step 3: Lien depuis `LeaseDetail.jsx`** — dans la section « États des lieux » (ou juste après), ajouter un lien/bouton « Décompte de sortie » vers `/backoffice/gestion-locative/decompte/{id}` (style `SECONDARY_BTN` + icône `react-icons/fi`, ex. `FiFileText`/`FiDollarSign`). Réutiliser le style existant de la page.

- [ ] **Step 4: Route** — dans `App.jsx`, importer `SettlementEditor` et ajouter, en sibling des autres routes `gestion-locative/*` : `<Route path="gestion-locative/decompte/:leaseId" element={<SettlementEditor />} />`.

- [ ] **Step 5: Build + charte** — `cd frontend && npm run build` (doit passer). Vérifier (lecture) : kit only, aucun hex en dur, `react-icons/fi`, `Đh`, react-query, décompte finalisé en lecture seule, hooks appelés inconditionnellement au niveau supérieur (les `useMutation`/`useQuery` ci-dessus sont tous top-level avant les early returns).

- [ ] **Step 6: Commit**
```bash
git add frontend/src/services/rentalService.js frontend/src/pages/backoffice/rental/SettlementEditor.jsx frontend/src/pages/backoffice/rental/LeaseDetail.jsx frontend/src/App.jsx
```
```bash
git commit -m "feat(front): décompte de caution + comparaison EDL (page reliée au détail du bail)"
```

---

### Task 5: Documentation

**Files:**
- Modify: `docs/emails/catalogue-emails.md` (décompte de sortie livré)
- Modify: `docs/architecture-v2-status.md` (EDL Phase B livrée)
- Modify: `docs/superpowers/specs/2026-07-30-etat-des-lieux-design.md` (§12 : Phase B cochée)

- [ ] **Step 1** — noter le décompte de sortie (email + PDF), la comparaison, la finalisation qui pilote la restitution du dépôt (Phase B livrée). Phase C (signature 3a9dSign) reste à venir.
- [ ] **Step 2: Commit**
```bash
git add docs/emails/catalogue-emails.md docs/architecture-v2-status.md docs/superpowers/specs/2026-07-30-etat-des-lieux-design.md
```
```bash
git commit -m "docs(rental): état des lieux Phase B (décompte + comparaison + email de sortie)"
```

---

## Self-Review

**Spec coverage (Phase B)** — la spec §12 définit la Phase B = « `DepositSettlement`/`DeductionLine` + calcul + finalisation (restitution dépôt + `rental.deposit.settled` + email décompte + PDF joint) + vue comparaison entrée↔sortie + UI décompte ». Couverture : modèles+CRUD lignes+comparaison (T1), finalisation+calcul+événement+PDF (T2), email+PDF joint+binding (T3), UI comparaison+décompte (T4), docs (T5). ✅ Complet. Signature 3a9dSign = Phase C (hors périmètre).

**Placeholder scan** — aucun « TBD/TODO ». Le gabarit email est décrit par « copier `deposit_return.html` + adapter » avec la copie exacte, les variables, le bloc conditionnel `balance_due` et le lien bien — pas de macro inventée (dépend des macros réelles de `base.html`, non réécrites à l'aveugle). Le PDF, les endpoints et les handlers ont du code complet.

**Type/route consistency** — `_settlement_dict` renvoie `{id, lease_id, status, deposit_amount, total_deductions, refunded_amount, balance_due, lines[]}` — exactement ce que consomme `SettlementEditor`. `compare_inventories` renvoie `{has_entree, has_sortie, rooms[].items[]{label, entree, sortie, sortie_comment, sortie_item_id, degraded}}` — consommé tel quel. `rentalService` frappe les chemins exacts sous `B`. Le payload `DEPOSIT_SETTLED` (T2) porte exactement les clés lues par `_handle_deposit_settled` (T3). Le binding worker `rental.deposit.settled` est ajouté (T3 Step 4) — sinon l'email ne partirait jamais. Calcul cohérent T1(direct)/T2(figé) : mêmes formules `refunded = deposit>total ? deposit-total : 0`, `balance = total>deposit ? total-deposit : 0`.

**Sécurité** — `_gate` + `_owned_settlement`/`_owned_item`/`agency_id` (404) sur toutes les routes back-office ; endpoint interne à `x-internal-token` (403) ; anti-doublon dépôt (`lease.deposit_returned_at`) exclusif avec `deposit-return` ; verrou `status != 'draft'` sur lignes/finalize ; `item_id` d'une ligne validé à ce bail (pas de rattachement cross-bail).

**Note d'exécution** — restart `rental` après T1/T2 (tables + endpoints) ; restart le worker `notification` après T3 (nouveau binding + handler) ; `npm run build` après T4. L'E2E email complet nécessite le mesh (`bash scripts/dev-mesh-up.sh`) — à défaut, la T3 documente le rendu isolé du gabarit comme preuve.
