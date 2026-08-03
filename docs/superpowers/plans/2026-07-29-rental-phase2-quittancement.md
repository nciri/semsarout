# Gestion locative — Phase 2 (quittancement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le quittancement au service `rental` : échéances de loyer (`RentPeriod`) générées en flux roulant mensuel, enregistrement manuel des paiements, quittance (email + PDF), relance loyer impayé (dunning) et avis de virement au propriétaire.

**Architecture:** Extension du service `rental` (Phase 1) — nouvelle entité `RentPeriod` (dénormalisée `agency_id` pour le cloisonnement), événement `rental.rent.paid` (outbox), génération/relance/virement pilotés par l'ordonnanceur `notification` via des endpoints internes `rental`, quittance PDF via `reportlab` (patron `billing`). Les emails suivent le worker/templates existants ; les personnes (locataire/propriétaire) sont résolues via `crm`.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, psycopg3, RabbitMQ (`semsar.events`), Jinja2, reportlab, Brevo SMTP.

## Global Constraints

- Service/rôle/schéma `rental` (ADR-0002), port 8518. Erreurs legacy `{"error": "..."}` via `util.err()`.
- Événements via **outbox** uniquement (`enqueue(...)` avant `db.commit()`). Idempotence consumer via `processed_message`.
- Cloisonnement agence : toute route back-office filtrée par `principal.agency_id` (`RentPeriod.agency_id` dénormalisé depuis le bail). Endpoints internes protégés par `x-internal-token`.
- Gating : `_gate(principal)` (feature `rental`) en tête de chaque route back-office (helper existant Phase 1).
- Devise emails/PDF : `Đh`. Design SemsarOut (base.html + `_components` + icônes PNG hébergées, Gmail-compat).
- Paiement = **saisie manuelle** (pas d'intégration passerelle).
- Cadence de relance loyer impayé : **J+3 après échéance, puis toutes les 7 j, max 3** (idempotent `reminder_count`/`last_reminder_at`) — même patron que la relance de facture d'abonnement (`billing`).
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. `git commit` = commande bash SEULE (séparée de `git add`).
- Secrets jamais commités. Ne pas démarrer le monolithe.
- Le mesh dev tourne (`scripts/dev-mesh-up.sh`) ; DB dev = `semsar_dev`. Lancer un service pour vérifier : utiliser le paramètre `run_in_background: true` de l'outil Bash (un `&` en fin de commande est tué à la fin de l'appel).

---

### Task 1: Modèle `RentPeriod` + génération roulante (endpoint + ordonnanceur)

**Files:**
- Modify: `services/rental/app/models.py` (ajouter `RentPeriod`)
- Modify: `services/rental/app/events.py` (ajouter `RENT_PAID`)
- Modify: `services/rental/app/main.py` (helpers + `_MONTHS_FR` + endpoint génération + liste)
- Modify: `services/notification/app/scheduler.py` (`_rental()` + `_job_generate_rent_periods` + run_once)
- Modify: `scripts/dev-mesh-up.sh` (`RENTAL_URL` dans le lancement de l'ordonnanceur)

**Interfaces:**
- Produces: `models.RentPeriod`; `events.RENT_PAID`; `_rent_period_dict(rp)`, `_MONTHS_FR`; `POST /internal/rent-periods/generate`; `GET /backoffice/gestion-locative/leases/{id}/rent-periods`; scheduler `_rental()`, `_job_generate_rent_periods(db)`.

- [ ] **Step 1: Modèle `RentPeriod`** — dans `services/rental/app/models.py`, ajouter (après `Lease`). Importer `UniqueConstraint` dans la ligne d'import sqlalchemy.
```python
class RentPeriod(Base):
    __tablename__ = "rent_period"
    __table_args__ = (UniqueConstraint("lease_id", "year", "month", name="uq_rent_period_lease_ym"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)   # dénormalisé (cloisonnement)
    period_label = Column(String(40))                         # ex "Août 2026"
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    rent_amount = Column(Numeric(12, 2), nullable=False)
    charges_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), nullable=False)
    due_date = Column(DateTime)
    status = Column(String(20), default="pending")            # pending|paid|partial|late
    paid_amount = Column(Numeric(12, 2))
    paid_at = Column(DateTime)
    payment_method = Column(String(20))                       # virement|cheque|especes|carte
    receipt_number = Column(String(30), unique=True)          # n° de quittance (à l'encaissement)
    reminder_count = Column(Integer, default=0)               # relance loyer impayé (dunning)
    last_reminder_at = Column(DateTime)
    payout_sent_at = Column(DateTime)                         # avis de virement propriétaire
    created_at = Column(DateTime, default=datetime.utcnow)
```
Modifier l'import en tête de `models.py` :
```python
from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text, UniqueConstraint
```

- [ ] **Step 2: Événement** — dans `services/rental/app/events.py`
```python
RENT_PAID = "rental.rent.paid"
```

- [ ] **Step 3: Helpers `main.py`** — dans `services/rental/app/main.py`, importer `RentPeriod` (ligne `from .models import Lease, Mandate` → `Lease, Mandate, RentPeriod`), ajouter la constante des mois et le dict helper (après `_emit_lease`)
```python
_MONTHS_FR = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
              "Septembre", "Octobre", "Novembre", "Décembre"]


def _rent_period_dict(rp: RentPeriod) -> dict:
    return {
        "id": rp.id, "lease_id": rp.lease_id, "agency_id": rp.agency_id,
        "period_label": rp.period_label, "year": rp.year, "month": rp.month,
        "rent_amount": num(rp.rent_amount), "charges_amount": num(rp.charges_amount),
        "total_amount": num(rp.total_amount), "due_date": iso(rp.due_date), "status": rp.status,
        "paid_amount": num(rp.paid_amount), "paid_at": iso(rp.paid_at),
        "payment_method": rp.payment_method, "receipt_number": rp.receipt_number,
        "created_at": iso(rp.created_at),
    }
```

- [ ] **Step 4: Endpoint de génération + liste** — dans `main.py`
```python
@app.post("/internal/rent-periods/generate", include_in_schema=False)
def internal_generate_rent_periods(x_internal_token: str = Header(default=""),
                                   db: Session = Depends(get_db)):
    """Crée l'échéance du mois courant pour chaque bail actif (idempotent). Appelé par l'ordonnanceur."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    now = datetime.utcnow()
    y, m = now.year, now.month
    created = 0
    for l in db.query(Lease).filter(Lease.status == "active").all():
        if db.query(RentPeriod).filter(RentPeriod.lease_id == l.id, RentPeriod.year == y,
                                       RentPeriod.month == m).first():
            continue
        rent = l.rent_amount or 0
        charges = l.charges_amount or 0
        day = min(int(l.payment_day or 1), 28)
        rp = RentPeriod(lease_id=l.id, agency_id=l.agency_id, period_label=f"{_MONTHS_FR[m]} {y}",
                        year=y, month=m, rent_amount=rent, charges_amount=charges,
                        total_amount=rent + charges, due_date=datetime(y, m, day), status="pending")
        db.add(rp)
        created += 1
    db.commit()
    return {"created": created}


@app.get("/backoffice/gestion-locative/leases/{lease_id}/rent-periods")
def list_rent_periods(lease_id: int, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    q = (db.query(RentPeriod).filter(RentPeriod.lease_id == lease_id)
         .order_by(RentPeriod.year.desc(), RentPeriod.month.desc()))
    return {"rent_periods": [_rent_period_dict(rp) for rp in q.all()]}
```

- [ ] **Step 5: Ordonnanceur — helper + job de génération** — dans `services/notification/app/scheduler.py`, ajouter le helper (près de `_billing`) et le job (près des autres `_job_*`)
```python
def _rental() -> str:
    return os.environ.get("RENTAL_URL", "http://localhost:8518")
```
```python
def _job_generate_rent_periods(db) -> int:
    """Génère l'échéance du mois courant pour chaque bail actif (idempotent côté rental)."""
    try:
        r = httpx.post(f"{_rental()}/internal/rent-periods/generate", headers=_headers(), timeout=15.0)
        return r.json().get("created", 0) if r.status_code == 200 else 0
    except (httpx.HTTPError, ValueError):
        return 0
```
Dans `run_once`, ajouter (après les jobs existants, avant le `except`) :
```python
        g = _job_generate_rent_periods(db)
        if g:
            logger.info("échéances de loyer générées", extra={"count": g})
```

- [ ] **Step 6: `RENTAL_URL` pour l'ordonnanceur** — dans `scripts/dev-mesh-up.sh`, au bloc de lancement de l'ordonnanceur (`python3 -m app.scheduler`), ajouter `RENTAL_URL=http://localhost:8518` à l'`env` (à côté de `BILLING_URL`/`AGENCY_URL`).

- [ ] **Step 7: Créer la table + vérifier la génération**

Créer la table (nouvelle table → `create_all` la crée ; redémarrer rental ou appeler init_db) :
```bash
cd /home/younes/Documents/work/0semsar
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" \
  PYTHONPATH=services/rental python3 -c "from app.db import init_db; init_db(); print('ok')"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "\d rental.rent_period" | head -5
```
Expected: table `rent_period` avec la contrainte unique.

Lancer rental (Bash `run_in_background: true`, port 8518, `DATABASE_URL=...semsar_dev`, `TRUST_GATEWAY_HEADERS=true INTERNAL_TOKEN=change-me-internal RABBITMQ_URL=amqp://semsar:semsar@localhost:5672/ EVENTS_EXCHANGE=semsar.events`). Seed un bail actif puis générer :
```bash
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
MID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates $H -d '{"property_id":1,"landlord_client_id":1,"fee_percent":8}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
LID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases $H -d "{\"mandate_id\":$MID,\"tenant_client_id\":2,\"rent_amount\":4500,\"charges_amount\":300,\"payment_day\":5}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases/$LID/sign $H >/dev/null
curl -s -X POST http://localhost:8518/internal/rent-periods/generate -H 'x-internal-token: change-me-internal'
echo
curl -s http://localhost:8518/backoffice/gestion-locative/leases/$LID/rent-periods $H
```
Expected: `{"created":1}` (ou plus s'il y a d'autres baux actifs), puis la liste contient une échéance `pending`, `period_label` du mois courant, `total_amount` 4800.

- [ ] **Step 8: Nettoyer + Commit**
```bash
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.rent_period; DELETE FROM rental.lease; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
```
(commit — commande seule)
```bash
git add services/rental/app/models.py services/rental/app/events.py services/rental/app/main.py services/notification/app/scheduler.py scripts/dev-mesh-up.sh
```
```bash
git commit -m "feat(rental): échéances de loyer (RentPeriod) + génération roulante mensuelle"
```

---

### Task 2: Enregistrement du paiement + événement `rental.rent.paid`

**Files:**
- Modify: `services/rental/app/main.py`

**Interfaces:**
- Consumes: `models.RentPeriod`, `models.Lease`, `events.RENT_PAID`.
- Produces: `_emit_rent_paid(db, rp, lease)`; `POST /backoffice/gestion-locative/rent-periods/{id}/pay`.

- [ ] **Step 1: Helper d'émission** — dans `main.py` (après `_rent_period_dict`)
```python
def _emit_rent_paid(db: Session, rp: RentPeriod, lease: Lease) -> None:
    enqueue(db, "rent_period", rp.id, events.RENT_PAID, {
        "id": rp.id, "lease_id": rp.lease_id, "agency_id": rp.agency_id,
        "tenant_client_id": lease.tenant_client_id, "property_id": lease.property_id,
        "period_label": rp.period_label, "total_amount": num(rp.total_amount),
        "paid_amount": num(rp.paid_amount), "receipt_number": rp.receipt_number,
    })
```

- [ ] **Step 2: Endpoint `/pay`** — dans `main.py`
```python
@app.post("/backoffice/gestion-locative/rent-periods/{period_id}/pay")
async def pay_rent_period(period_id: int, request: Request,
                          principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    rp = db.get(RentPeriod, period_id)
    if rp is None or rp.agency_id != principal.agency_id:
        return err("Échéance introuvable.", 404)
    data = await json_body(request)
    if data.get("amount") is None:
        return err("Le montant est requis.", 400)
    amount = float(data["amount"])
    rp.paid_amount = amount
    rp.payment_method = data.get("method", "virement")
    rp.paid_at = _parse_dt(data.get("paid_at")) or datetime.utcnow()
    rp.status = "paid" if amount >= float(rp.total_amount or 0) else "partial"
    if rp.status == "paid" and not rp.receipt_number:
        rp.receipt_number = _reference("QIT")
    lease = db.get(Lease, rp.lease_id)
    if rp.status == "paid":
        _emit_rent_paid(db, rp, lease)   # quittance envoyée par notification
    db.commit()
    return _rent_period_dict(rp)
```

- [ ] **Step 3: Vérifier le paiement + l'événement**

Relancer rental (Bash `run_in_background: true`). Seed mandat+bail+génération (comme Task 1 Step 7), récupérer l'id d'échéance, puis payer :
```bash
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
# (après avoir seedé un bail LID et généré) :
PID=$(curl -s http://localhost:8518/backoffice/gestion-locative/leases/$LID/rent-periods $H | python3 -c 'import sys,json;print(json.load(sys.stdin)["rent_periods"][0]["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/rent-periods/$PID/pay $H -d '{"amount":4800,"method":"virement"}'
echo
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "SELECT event_type FROM rental.outbox ORDER BY id DESC LIMIT 1;"
```
Expected: échéance `status":"paid"`, `receipt_number` `QIT-...` ; outbox = `rental.rent.paid`. Vérifier aussi le 404 sur une échéance d'une autre agence (IDOR) : `curl -s -o /dev/null -w '%{http_code}' -X POST .../rent-periods/$PID/pay` avec `x-semsar-agency-id: 999` → `404`.

- [ ] **Step 4: Nettoyer + Commit**
```bash
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.rent_period; DELETE FROM rental.lease; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
```
```bash
git add services/rental/app/main.py
```
```bash
git commit -m "feat(rental): enregistrement manuel du paiement de loyer + événement rent.paid"
```

---

### Task 3: Quittance de loyer PDF

**Files:**
- Create: `services/rental/app/pdf.py`
- Modify: `services/rental/app/main.py` (endpoint PDF + import `Response`)

**Interfaces:**
- Consumes: `models.RentPeriod`, `models.Lease`, `models.Mandate`, `models.PropertyRO`, `models.ClientRO`.
- Produces: `pdf.render_receipt_pdf(rp, tenant_name, landlord_name, property_title)`; `GET /backoffice/gestion-locative/rent-periods/{id}/receipt.pdf`.

- [ ] **Step 1: `pdf.py`** (patron `reportlab` de `billing._render_invoice_pdf`)
```python
"""Génération PDF du service rental — quittance de loyer (reportlab)."""
from io import BytesIO


def render_receipt_pdf(rp, tenant_name: str, landlord_name: str, property_title: str) -> bytes:
    """Quittance de loyer PDF. `rp` = RentPeriod encaissée (receipt_number présent)."""
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
    rent = float(rp.rent_amount or 0)
    charges = float(rp.charges_amount or 0)
    total = float(rp.total_amount or 0)
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph(f"<b>QUITTANCE DE LOYER</b> {rp.receipt_number or '-'}", head),
        Paragraph(f"Période : {rp.period_label or '-'}", info),
        Paragraph(f"Bien : {property_title or '-'}", info),
        Paragraph(f"Bailleur : {landlord_name or '-'}", info),
        Paragraph(f"Locataire : {tenant_name or '-'}", info),
        Spacer(1, 12),
        Paragraph(f"Loyer : {rent:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"Charges : {charges:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"<b>Total : {total:,.2f} Đh</b>".replace(",", " "), info),
        Spacer(1, 12),
        Paragraph(f"Payé le : {rp.paid_at.strftime('%d/%m/%Y') if rp.paid_at else '-'}", info),
        Paragraph("Reçu pour solde de tout compte de la période indiquée.", info),
    ]
    doc.build(story)
    return buf.getvalue()
```

- [ ] **Step 2: Endpoint PDF** — dans `main.py`. Ajouter `Response` à l'import fastapi (`from fastapi import Depends, FastAPI, Header, Request, Response`), et importer les projections (`from .models import ... PropertyRO, ClientRO, Mandate`).
```python
@app.get("/backoffice/gestion-locative/rent-periods/{period_id}/receipt.pdf")
def rent_receipt_pdf(period_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    rp = db.get(RentPeriod, period_id)
    if rp is None or rp.agency_id != principal.agency_id:
        return err("Échéance introuvable.", 404)
    if not rp.receipt_number:
        return err("Quittance indisponible : échéance non réglée.", 400)
    lease = db.get(Lease, rp.lease_id)
    mandate = db.get(Mandate, lease.mandate_id) if lease else None
    tenant = db.get(ClientRO, lease.tenant_client_id) if lease else None
    landlord = db.get(ClientRO, mandate.landlord_client_id) if mandate else None
    prop = db.get(PropertyRO, lease.property_id) if lease else None
    from . import pdf as pdf_mod
    data = pdf_mod.render_receipt_pdf(
        rp,
        tenant_name=f"{tenant.first_name} {tenant.last_name}" if tenant else None,
        landlord_name=f"{landlord.first_name} {landlord.last_name}" if landlord else None,
        property_title=prop.title if prop else None)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={rp.receipt_number}.pdf"})
```

- [ ] **Step 3: Vérifier le PDF**

Relancer rental, seed+génère+paye une échéance (Tasks 1-2 flow) pour obtenir `$PID` réglée, puis :
```bash
curl -s -o /tmp/quittance.pdf -w '%{content_type} %{size_download}\n' \
  http://localhost:8518/backoffice/gestion-locative/rent-periods/$PID/receipt.pdf $H
file /tmp/quittance.pdf
```
Expected: `application/pdf` + taille > 1000 ; `file` indique `PDF document`. Vérifier aussi 400 sur une échéance non réglée et 404 cross-agency.

- [ ] **Step 4: Nettoyer + Commit**
```bash
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.rent_period; DELETE FROM rental.lease; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
rm -f /tmp/quittance.pdf
```
```bash
git add services/rental/app/pdf.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): quittance de loyer PDF (reportlab)"
```

---

### Task 4: Email de quittance (`rental.rent.paid`)

**Files:**
- Modify: `services/notification/app/handlers.py` (handler + routage)
- Modify: `services/notification/app/worker.py` (binding)
- Create: `services/notification/app/templates/rent_receipt.html`
- Create: `frontend/public/email-icons/receipt-text.png`

**Interfaces:**
- Consumes: `rental.rent.paid` (payload Task 2) ; `recipients.client(id)`, `_try_send`, `_contact`, `_valid_email`.
- Produces: email `rent_receipt` au locataire.

- [ ] **Step 1: Icône `receipt-text.png`** (style 52px stroke #334155)
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z\"/><path d=\"M14 8H8\"/><path d=\"M16 12H8\"/><path d=\"M13 16H8\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/receipt-text.png', output_width=52, output_height=52)
print('generated receipt-text.png')
"
ls -la frontend/public/email-icons/receipt-text.png
```

- [ ] **Step 2: `rent_receipt.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Votre quittance de loyer — {{ period_label }}{% endblock %}
{% block preheader %}Merci, votre loyer est bien reçu. Voici votre quittance.{% endblock %}
{% block badge %}{{ lucide("receipt-text") }}{% endblock %}
{% block hero_title %}Loyer bien reçu{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, votre paiement est enregistré.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Nous confirmons la réception de votre loyer pour la période <strong>{{ period_label }}</strong>. Voici votre quittance.</p>
{{ card(([("Quittance n°", receipt_number)] if receipt_number else [])
  + [("Période", period_label)]
  + [("Montant réglé", "{:,.0f}".format((paid_amount or total_amount)|float).replace(",", " ") ~ " " ~ currency)]) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Une question sur votre loyer&nbsp;? Écrivez-nous à <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 3: Handler** — dans `services/notification/app/handlers.py` (après `_handle_lease_signed`), en calquant `_handle_contract_signed`
```python
def _handle_rent_paid(db, payload):
    """rental.rent.paid → quittance de loyer au locataire."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "rent_receipt.html", "rent_receipt", from_email=_contact(),
              name=tenant.get("name"), period_label=payload.get("period_label"),
              receipt_number=payload.get("receipt_number"),
              paid_amount=payload.get("paid_amount"), total_amount=payload.get("total_amount"))
```

- [ ] **Step 4: Routage** — dans `handle_event`, ajouter
```python
    elif routing_key == "rental.rent.paid":
        _handle_rent_paid(db, payload)
```

- [ ] **Step 5: Binding worker** — dans `services/notification/app/worker.py`, ajouter `"rental.rent.paid"` à `bindings=[...]`.

- [ ] **Step 6: Test E2E** — redémarrer le worker notification (pour charger le nouveau binding + handler), seed un locataire +addressé, payer une échéance, vérifier `notification_log`
```bash
cd /home/younes/Documents/work/0semsar
# redémarrer le worker notification (identifié par son env, cmdline partagée)
for p in $(pgrep -f 'python3 -m app.worker'); do grep -qz 'SERVICE_NAME=notification' /proc/$p/environ 2>/dev/null && kill -9 "$p"; done
# relancer UN worker via Bash run_in_background:true :
#   env SERVICE_NAME=notification DATABASE_URL="postgresql+psycopg://notification:notification@localhost:5432/semsar_dev" \
#   RABBITMQ_URL="amqp://semsar:semsar@localhost:5672/" EVENTS_EXCHANGE=semsar.events OPENSEARCH_URL=http://localhost:9200 \
#   MONOLITH_URL=http://localhost:7000 INTERNAL_TOKEN=change-me-internal PYTHONPATH=services/notification python3 -m app.worker
CID=$(PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -tAc "INSERT INTO crm.client (first_name,last_name,email,client_type,agency_id,created_at,updated_at) VALUES ('Test','Loc','nciriyounes2005+rent@gmail.com','tenant',1,now(),now()) RETURNING id;")
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
MID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates $H -d '{"property_id":1,"landlord_client_id":1,"fee_percent":8}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
LID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases $H -d "{\"mandate_id\":$MID,\"tenant_client_id\":$CID,\"rent_amount\":4500,\"charges_amount\":300,\"payment_day\":5}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases/$LID/sign $H >/dev/null
curl -s -X POST http://localhost:8518/internal/rent-periods/generate -H 'x-internal-token: change-me-internal' >/dev/null
PID=$(curl -s http://localhost:8518/backoffice/gestion-locative/leases/$LID/rent-periods $H | python3 -c 'import sys,json;print(json.load(sys.stdin)["rent_periods"][0]["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/rent-periods/$PID/pay $H -d '{"amount":4800,"method":"virement"}' >/dev/null
sleep 10
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "SELECT recipient,template,status FROM notification.notification_log WHERE recipient='nciriyounes2005+rent@gmail.com' ORDER BY created_at DESC LIMIT 1;"
```
Expected: `nciriyounes2005+rent@gmail.com | rent_receipt | sent`.

- [ ] **Step 7: Nettoyer**
```bash
PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -c "DELETE FROM crm.client WHERE email='nciriyounes2005+rent@gmail.com';"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "DELETE FROM notification.notification_log WHERE recipient='nciriyounes2005+rent@gmail.com';"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.rent_period; DELETE FROM rental.lease; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
```

- [ ] **Step 8: Commit**
```bash
git add services/notification/app/handlers.py services/notification/app/worker.py services/notification/app/templates/rent_receipt.html frontend/public/email-icons/receipt-text.png
```
```bash
git commit -m "feat(notification): email de quittance de loyer (rental.rent.paid)"
```

---

### Task 5: Relance loyer impayé (dunning)

**Files:**
- Modify: `services/rental/app/main.py` (endpoints internes due-reminders + reminder-sent)
- Modify: `services/notification/app/scheduler.py` (job + run_once)
- Create: `services/notification/app/templates/rent_overdue.html`

**Interfaces:**
- Consumes: `models.RentPeriod`, `models.Lease`.
- Produces: `GET /internal/rent-periods/due-reminders`, `POST /internal/rent-periods/{id}/reminder-sent`; scheduler `_job_rent_overdue_reminders(db)`; email `rent_overdue` au locataire.

- [ ] **Step 1: Endpoints internes** — dans `services/rental/app/main.py` (cadence identique au dunning billing)
```python
_RENT_FIRST_REMINDER_DAYS = 3
_RENT_REMINDER_INTERVAL_DAYS = 7
_RENT_MAX_REMINDERS = 3


@app.get("/internal/rent-periods/due-reminders", include_in_schema=False)
def internal_rent_due_reminders(x_internal_token: str = Header(default=""),
                                db: Session = Depends(get_db)):
    """Échéances impayées dues pour une relance (J+3 après échéance, puis toutes les 7 j, max 3)."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    from datetime import timedelta
    now = datetime.utcnow()
    out = []
    rows = (db.query(RentPeriod)
            .filter(RentPeriod.status.in_(["pending", "partial", "late"]),
                    RentPeriod.due_date.isnot(None)).all())
    for rp in rows:
        count = rp.reminder_count or 0
        if count >= _RENT_MAX_REMINDERS:
            continue
        if count == 0:
            due = rp.due_date <= now - timedelta(days=_RENT_FIRST_REMINDER_DAYS)
        else:
            due = rp.last_reminder_at is not None and \
                rp.last_reminder_at <= now - timedelta(days=_RENT_REMINDER_INTERVAL_DAYS)
        if not due:
            continue
        lease = db.get(Lease, rp.lease_id)
        out.append({"id": rp.id, "tenant_client_id": lease.tenant_client_id if lease else None,
                    "period_label": rp.period_label, "total_amount": num(rp.total_amount),
                    "reminder_count": count})
    return {"rent_periods": out}


@app.post("/internal/rent-periods/{period_id}/reminder-sent", include_in_schema=False)
def internal_rent_reminder_sent(period_id: int, x_internal_token: str = Header(default=""),
                                db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    rp = db.get(RentPeriod, period_id)
    if rp is not None and rp.status in ("pending", "partial", "late"):
        rp.reminder_count = (rp.reminder_count or 0) + 1
        rp.last_reminder_at = datetime.utcnow()
        if rp.status == "pending":
            rp.status = "late"
        db.commit()
    return {"ok": True}
```

- [ ] **Step 2: `rent_overdue.html`** (icône `credit-card`, déjà présente)
```html
{% extends "base.html" %}
{% from "_components.html" import button, card, lucide with context %}
{% set final = (reminder_count or 0) >= 2 %}
{% block subject %}{% if final %}Dernier rappel : loyer {{ period_label }} impayé{% else %}Rappel : votre loyer {{ period_label }} reste à régler{% endif %}{% endblock %}
{% block preheader %}Un règlement rapide évite tout désagrément. Merci de régulariser votre loyer.{% endblock %}
{% block badge %}{{ lucide("credit-card") }}{% endblock %}
{% block hero_title %}{% if final %}Dernier rappel de loyer{% else %}Loyer en attente{% endif %}{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, votre loyer n'a pas encore été réglé.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Sauf erreur de notre part, le loyer de la période <strong>{{ period_label }}</strong> reste impayé. Merci de procéder à son règlement dans les meilleurs délais.</p>
{{ card([("Période", period_label)]
  + [("Montant dû", "{:,.0f}".format(total_amount|float).replace(",", " ") ~ " " ~ currency)]) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Vous avez déjà réglé&nbsp;? Merci de ne pas tenir compte de ce message. Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 3: Job ordonnanceur** — dans `services/notification/app/scheduler.py` (calque `_job_unpaid_invoice_reminders`)
```python
def _job_rent_overdue_reminders(db) -> int:
    """Relance loyer impayé : échéances non réglées, cadence J+3 puis toutes les 7 j (max 3)."""
    try:
        r = httpx.get(f"{_rental()}/internal/rent-periods/due-reminders", headers=_headers(), timeout=10.0)
        periods = r.json().get("rent_periods", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for rp in periods:
        tenant = recipients.client(rp.get("tenant_client_id"))
        to = (tenant.get("email") or "").strip()
        if _valid_email(to):
            _try_send(db, to, "rent_overdue.html", "rent_overdue", from_email=_contact(),
                      name=tenant.get("name"), period_label=rp.get("period_label"),
                      total_amount=rp.get("total_amount"), reminder_count=rp.get("reminder_count", 0))
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_rental()}/internal/rent-periods/{rp['id']}/reminder-sent",
                       headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent
```
Dans `run_once`, ajouter :
```python
        ro = _job_rent_overdue_reminders(db)
        if ro:
            logger.info("relances loyer envoyées", extra={"count": ro})
```

- [ ] **Step 4: Test E2E** — seed un locataire +addressé + une échéance en retard (due_date il y a 4 j, reminder_count 0), lancer le job, vérifier l'envoi

Redémarrer rental (pour charger les nouveaux endpoints). Seed :
```bash
cd /home/younes/Documents/work/0semsar
CID=$(PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -tAc "INSERT INTO crm.client (first_name,last_name,email,client_type,agency_id,created_at,updated_at) VALUES ('Test','Loc','nciriyounes2005+overdue@gmail.com','tenant',1,now(),now()) RETURNING id;")
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
MID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates $H -d '{"property_id":1,"landlord_client_id":1,"fee_percent":8}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
LID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases $H -d "{\"mandate_id\":$MID,\"tenant_client_id\":$CID,\"rent_amount\":4500,\"charges_amount\":300,\"payment_day\":5}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases/$LID/sign $H >/dev/null
# insérer une échéance en retard directement (due il y a 4 jours)
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "INSERT INTO rental.rent_period (lease_id, agency_id, period_label, year, month, rent_amount, charges_amount, total_amount, due_date, status, reminder_count, created_at) VALUES ($LID, 1, 'Test', 2026, 7, 4500, 300, 4800, (now() AT TIME ZONE 'UTC') - interval '4 days', 'pending', 0, now());"
```
Lancer le job directement (comme pour les chantiers précédents) :
```bash
env SERVICE_NAME=notification DATABASE_URL="postgresql+psycopg://notification:notification@localhost:5432/semsar_dev" \
  RABBITMQ_URL="amqp://semsar:semsar@localhost:5672/" EVENTS_EXCHANGE=semsar.events OPENSEARCH_URL=http://localhost:9200 \
  INTERNAL_TOKEN=change-me-internal CRM_URL=http://localhost:8013 RENTAL_URL=http://localhost:8518 IDENTITY_URL=http://localhost:8501 \
  PYTHONPATH=services/notification python3 -c "
from app.handlers import load_dotenv; load_dotenv()
from app.scheduler import _job_rent_overdue_reminders
from app.db import SessionLocal
db=SessionLocal(); print('sent:', _job_rent_overdue_reminders(db)); db.close()"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "SELECT recipient,template,status FROM notification.notification_log WHERE recipient='nciriyounes2005+overdue@gmail.com' ORDER BY created_at DESC LIMIT 1;"
```
Expected: `sent: 1` puis `nciriyounes2005+overdue@gmail.com | rent_overdue | sent`. Relancer le job une 2ᵉ fois → 0 envoi (idempotent, reminder_count=1, <7 j).

- [ ] **Step 5: Nettoyer + Commit**
```bash
PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -c "DELETE FROM crm.client WHERE email='nciriyounes2005+overdue@gmail.com';"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "DELETE FROM notification.notification_log WHERE recipient='nciriyounes2005+overdue@gmail.com';"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.rent_period; DELETE FROM rental.lease; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
```
```bash
git add services/rental/app/main.py services/notification/app/scheduler.py services/notification/app/templates/rent_overdue.html
```
```bash
git commit -m "feat(rental): relance loyer impayé (dunning échelonné)"
```

---

### Task 6: Avis de virement au propriétaire

**Files:**
- Modify: `services/rental/app/main.py` (endpoints internes due-payouts + payout-sent)
- Modify: `services/notification/app/scheduler.py` (job + run_once)
- Create: `services/notification/app/templates/landlord_payout.html`
- Create: `frontend/public/email-icons/banknote.png`

**Interfaces:**
- Consumes: `models.RentPeriod`, `models.Lease`, `models.Mandate`.
- Produces: `GET /internal/rent-periods/due-payouts`, `POST /internal/rent-periods/{id}/payout-sent`; scheduler `_job_landlord_payouts(db)`; email `landlord_payout` au propriétaire.

- [ ] **Step 1: Endpoints internes** — dans `main.py` (net reversé = payé − honoraires de gestion `fee_percent`)
```python
@app.get("/internal/rent-periods/due-payouts", include_in_schema=False)
def internal_rent_due_payouts(x_internal_token: str = Header(default=""),
                              db: Session = Depends(get_db)):
    """Loyers encaissés à reverser au propriétaire (avis de virement non encore envoyé)."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    out = []
    rows = (db.query(RentPeriod)
            .filter(RentPeriod.status == "paid", RentPeriod.payout_sent_at.is_(None)).all())
    for rp in rows:
        lease = db.get(Lease, rp.lease_id)
        mandate = db.get(Mandate, lease.mandate_id) if lease else None
        if mandate is None:
            continue
        fee = float(mandate.fee_percent or 0)
        gross = float(rp.paid_amount or rp.total_amount or 0)
        net = round(gross * (1 - fee / 100.0), 2)
        out.append({"id": rp.id, "landlord_client_id": mandate.landlord_client_id,
                    "period_label": rp.period_label, "gross_amount": gross,
                    "fee_percent": fee, "net_amount": net})
    return {"rent_periods": out}


@app.post("/internal/rent-periods/{period_id}/payout-sent", include_in_schema=False)
def internal_rent_payout_sent(period_id: int, x_internal_token: str = Header(default=""),
                              db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    rp = db.get(RentPeriod, period_id)
    if rp is not None:
        rp.payout_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}
```

- [ ] **Step 2: Icône `banknote.png`**
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/banknote.png', output_width=52, output_height=52)
print('generated banknote.png')
"
ls -la frontend/public/email-icons/banknote.png
```

- [ ] **Step 3: `landlord_payout.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Virement de vos loyers — {{ period_label }}{% endblock %}
{% block preheader %}Vos loyers de la période {{ period_label }} vous sont reversés.{% endblock %}
{% block badge %}{{ lucide("banknote") }}{% endblock %}
{% block hero_title %}Reversement de vos loyers{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, voici le détail de votre reversement.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Le loyer de la période <strong>{{ period_label }}</strong> a été encaissé. Après déduction des honoraires de gestion, le montant net vous est reversé.</p>
{{ card([("Période", period_label)]
  + [("Loyer encaissé", "{:,.0f}".format(gross_amount|float).replace(",", " ") ~ " " ~ currency)]
  + ([("Honoraires", (fee_percent|string) ~ " %")] if fee_percent else [])
  + [("Net reversé", "{:,.0f}".format(net_amount|float).replace(",", " ") ~ " " ~ currency)]) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Une question sur votre gestion locative&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 4: Job ordonnanceur** — dans `scheduler.py`
```python
def _job_landlord_payouts(db) -> int:
    """Avis de virement : loyers encaissés à reverser au propriétaire (net des honoraires)."""
    try:
        r = httpx.get(f"{_rental()}/internal/rent-periods/due-payouts", headers=_headers(), timeout=10.0)
        periods = r.json().get("rent_periods", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for rp in periods:
        landlord = recipients.client(rp.get("landlord_client_id"))
        to = (landlord.get("email") or "").strip()
        if _valid_email(to):
            _try_send(db, to, "landlord_payout.html", "landlord_payout", from_email=_contact(),
                      name=landlord.get("name"), period_label=rp.get("period_label"),
                      gross_amount=rp.get("gross_amount"), fee_percent=rp.get("fee_percent"),
                      net_amount=rp.get("net_amount"))
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_rental()}/internal/rent-periods/{rp['id']}/payout-sent",
                       headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent
```
Dans `run_once`, ajouter :
```python
        po = _job_landlord_payouts(db)
        if po:
            logger.info("avis de virement envoyés", extra={"count": po})
```

- [ ] **Step 5: Test E2E** — seed un propriétaire +addressé + une échéance `paid` (payout_sent_at NULL), lancer le job, vérifier l'envoi
```bash
cd /home/younes/Documents/work/0semsar
LID_OWNER=$(PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -tAc "INSERT INTO crm.client (first_name,last_name,email,client_type,agency_id,created_at,updated_at) VALUES ('Test','Owner','nciriyounes2005+payout@gmail.com','landlord',1,now(),now()) RETURNING id;")
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
MID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates $H -d "{\"property_id\":1,\"landlord_client_id\":$LID_OWNER,\"fee_percent\":8}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
LID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases $H -d "{\"mandate_id\":$MID,\"tenant_client_id\":2,\"rent_amount\":4500,\"charges_amount\":300,\"payment_day\":5}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases/$LID/sign $H >/dev/null
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "INSERT INTO rental.rent_period (lease_id, agency_id, period_label, year, month, rent_amount, charges_amount, total_amount, status, paid_amount, paid_at, receipt_number, created_at) VALUES ($LID, 1, 'Test payout', 2026, 7, 4500, 300, 4800, 'paid', 4800, now(), 'QIT-TEST-0001', now());"
env SERVICE_NAME=notification DATABASE_URL="postgresql+psycopg://notification:notification@localhost:5432/semsar_dev" \
  RABBITMQ_URL="amqp://semsar:semsar@localhost:5672/" EVENTS_EXCHANGE=semsar.events OPENSEARCH_URL=http://localhost:9200 \
  INTERNAL_TOKEN=change-me-internal CRM_URL=http://localhost:8013 RENTAL_URL=http://localhost:8518 IDENTITY_URL=http://localhost:8501 \
  PYTHONPATH=services/notification python3 -c "
from app.handlers import load_dotenv; load_dotenv()
from app.scheduler import _job_landlord_payouts
from app.db import SessionLocal
db=SessionLocal(); print('sent:', _job_landlord_payouts(db)); db.close()"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "SELECT recipient,template,status FROM notification.notification_log WHERE recipient='nciriyounes2005+payout@gmail.com' ORDER BY created_at DESC LIMIT 1;"
```
Expected: `sent: 1` puis `nciriyounes2005+payout@gmail.com | landlord_payout | sent` (net = 4800 × 0,92 = 4416 Đh). 2ᵉ passage → 0 (payout_sent_at posé).

- [ ] **Step 6: Nettoyer + Commit**
```bash
PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -c "DELETE FROM crm.client WHERE email='nciriyounes2005+payout@gmail.com';"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "DELETE FROM notification.notification_log WHERE recipient='nciriyounes2005+payout@gmail.com';"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.rent_period; DELETE FROM rental.lease; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
```
```bash
git add services/rental/app/main.py services/notification/app/scheduler.py services/notification/app/templates/landlord_payout.html frontend/public/email-icons/banknote.png
```
```bash
git commit -m "feat(rental): avis de virement des loyers au propriétaire (net des honoraires)"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/emails/catalogue-emails.md`

- [ ] **Step 1: Statuts** — passer à ✅ (Phase 2) : « Quittance de loyer », « Relances impayés » (loyer), « Propriétaire : avis de virement des loyers ». Laisser 🔴 « CRG », « révision IRL », « régularisation des charges », « restitution du dépôt », candidature (Phases 3-4). Mettre à jour le bandeau §3 pour refléter « Phases 1-2 livrées (mandats, baux, quittancement) ; Phases 3-5 à venir ».

- [ ] **Step 2: Commit**
```bash
git add docs/emails/catalogue-emails.md
```
```bash
git commit -m "docs(rental): statut Phase 2 (quittancement, quittance, relance loyer, virement)"
```

---

## Self-Review

**Spec coverage (Phase 2)** — la spec §14 définit la Phase 2 = « RentPeriod, génération roulante, /pay, rental.rent.paid, quittance (email + PDF), relance loyer impayé (dunning), avis de virement propriétaire ». Couverture : RentPeriod + génération (T1), /pay + rent.paid (T2), quittance PDF (T3), quittance email (T4), dunning (T5), avis de virement (T6), docs (T7). ✅ Complet. CRG / IRL / charges / dépôt / candidature = Phases 3-4 (hors périmètre, plans séparés).

**Placeholder scan** — aucun « TBD/TODO ». Le titre du bien dans le PDF vient de `PropertyRO` (peut être vide → `'-'`, géré) ; les noms via `ClientRO` (peut être vide → `'-'`). L'email de quittance résout le locataire via `crm` (chemin éprouvé), indépendant des projections RO.

**Type consistency** — `_emit_rent_paid` produit `tenant_client_id, period_label, receipt_number, paid_amount, total_amount` — exactement ce que lit `_handle_rent_paid`. Les endpoints `due-reminders`/`due-payouts` renvoient `tenant_client_id`/`landlord_client_id`, `period_label`, montants — exactement ce que lisent `_job_rent_overdue_reminders`/`_job_landlord_payouts`. `RentPeriod.agency_id` (dénormalisé) sert le cloisonnement de `/pay` et `receipt.pdf`. `_gate`, `_reference`, `_parse_dt`, `num`, `iso` réutilisés de la Phase 1.

**Cohérence dunning** — cadence et champs (`reminder_count`/`last_reminder_at`, J+3/7 j/max 3) identiques au dunning `billing` déjà en prod, réduisant le risque.

**Note d'exécution** — le mesh dev tourne déjà (Phase 1). Redémarrer **rental** après T1/T2/T5/T6 (nouveaux endpoints) et le **worker notification** après T4 (nouveau binding), via le paramètre `run_in_background: true` de l'outil Bash (un `&` en fin de commande shell est tué à la fin de l'appel). Les jobs d'ordonnanceur peuvent être testés en direct via `python3 -c "...import _job_...; run"` (comme les chantiers précédents) sans attendre le cycle de 15 min.
