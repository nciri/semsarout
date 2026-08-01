# Gestion locative — Phase 3 (périodique & révisions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter le service `rental` avec les processus périodiques et de fin de cycle : compte-rendu de gestion (CRG) au propriétaire (email + PDF), avis d'échéance de mandat (J-60), restitution du dépôt de garantie, révision de loyer, et régularisation annuelle des charges.

**Architecture:** Extension du service `rental` (Phases 1-2). Deux familles : **piloté par l'ordonnanceur** (CRG mensuel, avis d'échéance de mandat) via des endpoints internes `rental` + jobs `_job_*` ; **déclenché par l'agence** (restitution du dépôt, révision de loyer, régularisation des charges) via des routes back-office qui émettent des événements outbox consommés par le worker `notification`. Le CRG agrège les `RentPeriod` payées ; PDF via `reportlab`. Personnes résolues via `crm`.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, psycopg3, RabbitMQ (`semsar.events`), Jinja2, reportlab, Brevo SMTP.

## Global Constraints

- Service/rôle/schéma `rental` (ADR-0002), port 8518. Erreurs legacy `{"error": "..."}` via `util.err()`.
- Événements via **outbox** uniquement (`enqueue(...)` avant `db.commit()`). Idempotence consumer via `handle_event`/`processed_message`. Le routage notification se fait sur **`routing_key`** (pas `event_type`).
- Cloisonnement agence : routes back-office filtrées par `principal.agency_id` (via `agency_id` dénormalisé sur chaque entité). Endpoints internes protégés par `x-internal-token`.
- Gating : `_gate(principal)` (feature `rental`) en tête de chaque route back-office (helper existant).
- Devise emails/PDF : `Đh`. Design SemsarOut (base.html + `_components` + icônes PNG hébergées, Gmail-compat, 52px stroke #334155 générées via cairosvg).
- Idempotence des jobs ordonnanceur : marqueur `*_sent_at` / table dédiée `(entité, période)`. Job = poll endpoint interne → `_try_send` → `db.commit()` → POST `*-sent` (même si email absent, anti-boucle) — patron identique au dunning existant.
- Émissions événementielles agence : les `_handle_*` prennent `(db, payload)`, résolvent le destinataire via `recipients.client(id)`, envoient via `_try_send(..., from_email=_contact())` — patron identique à `_handle_lease_signed`.
- Commits : Conventional Commits, un changement logique par commit, **pas d'attribution IA**. `git commit` = commande bash SEULE (séparée de `git add`).
- Secrets jamais commités. Ne pas démarrer le monolithe. Le mesh dev tourne ; DB dev = `semsar_dev`.
- Lancer un service pour vérifier via le paramètre `run_in_background: true` de l'outil Bash (un `&` en fin de commande est tué à la fin de l'appel). Restart rental après ajout d'endpoints ; restart worker notification après ajout de bindings ; jobs ordonnanceur testables en direct via `python3 -c`.

---

### Task 1: Compte-rendu de gestion (CRG) — données + agrégation + ordonnanceur + email

**Files:**
- Modify: `services/rental/app/models.py` (ajouter `CrgReport`)
- Modify: `services/rental/app/main.py` (`_prev_period`, endpoints due-crg + crg-sent + list CRG)
- Modify: `services/notification/app/scheduler.py` (`_job_crg_reports` + run_once)
- Create: `services/notification/app/templates/crg_report.html`
- Create: `frontend/public/email-icons/chart-column.png`

**Interfaces:**
- Produces: `models.CrgReport`; `GET /internal/mandates/due-crg`, `POST /internal/mandates/{id}/crg-sent`, `GET /backoffice/gestion-locative/mandates/{id}/crg`; scheduler `_job_crg_reports(db)`.

- [ ] **Step 1: Modèle `CrgReport`** — dans `services/rental/app/models.py` (après `RentPeriod`)
```python
class CrgReport(Base):
    __tablename__ = "crg_report"
    __table_args__ = (UniqueConstraint("mandate_id", "year", "month", name="uq_crg_mandate_ym"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    mandate_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    period_label = Column(String(40))
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    rent_collected = Column(Numeric(12, 2), default=0)
    fees = Column(Numeric(12, 2), default=0)
    net = Column(Numeric(12, 2), default=0)
    sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: Helpers + endpoints CRG** — dans `main.py` (importer `CrgReport` depuis `.models`)
```python
def _prev_period(now: datetime) -> tuple[int, int]:
    """Mois précédent (couvert par le CRG émis en début de mois courant)."""
    return (now.year - 1, 12) if now.month == 1 else (now.year, now.month - 1)


def _crg_aggregate(db, mandate, y: int, m: int) -> dict:
    """Agrège les loyers encaissés des baux d'un mandat pour un mois donné."""
    lease_ids = [l.id for l in db.query(Lease).filter(Lease.mandate_id == mandate.id).all()]
    collected = 0.0
    if lease_ids:
        rows = (db.query(RentPeriod)
                .filter(RentPeriod.lease_id.in_(lease_ids), RentPeriod.year == y,
                        RentPeriod.month == m, RentPeriod.status == "paid").all())
        collected = sum(float(rp.paid_amount or rp.total_amount or 0) for rp in rows)
    fee_pct = float(mandate.fee_percent or 0)
    fees = round(collected * fee_pct / 100.0, 2)
    return {"rent_collected": round(collected, 2), "fees": fees,
            "net": round(collected - fees, 2)}


@app.get("/internal/mandates/due-crg", include_in_schema=False)
def internal_mandates_due_crg(x_internal_token: str = Header(default=""),
                              db: Session = Depends(get_db)):
    """Mandats actifs avec des loyers encaissés le mois dernier, sans CRG encore émis pour ce mois."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    y, m = _prev_period(datetime.utcnow())
    out = []
    for mnd in db.query(Mandate).filter(Mandate.status == "active").all():
        if db.query(CrgReport).filter(CrgReport.mandate_id == mnd.id, CrgReport.year == y,
                                      CrgReport.month == m).first():
            continue
        agg = _crg_aggregate(db, mnd, y, m)
        if agg["rent_collected"] <= 0:
            continue
        out.append({"mandate_id": mnd.id, "landlord_client_id": mnd.landlord_client_id,
                    "period_label": f"{_MONTHS_FR[m]} {y}", "year": y, "month": m, **agg})
    return {"reports": out}


@app.post("/internal/mandates/{mandate_id}/crg-sent", include_in_schema=False)
async def internal_mandate_crg_sent(mandate_id: int, request: Request,
                                    x_internal_token: str = Header(default=""),
                                    db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    mnd = db.get(Mandate, mandate_id)
    if mnd is None:
        return {"ok": True}
    data = await json_body(request)
    y, m = _prev_period(datetime.utcnow())
    if not db.query(CrgReport).filter(CrgReport.mandate_id == mnd.id, CrgReport.year == y,
                                      CrgReport.month == m).first():
        db.add(CrgReport(mandate_id=mnd.id, agency_id=mnd.agency_id,
                         period_label=f"{_MONTHS_FR[m]} {y}", year=y, month=m,
                         rent_collected=data.get("rent_collected", 0), fees=data.get("fees", 0),
                         net=data.get("net", 0), sent_at=datetime.utcnow()))
        db.commit()
    return {"ok": True}


@app.get("/backoffice/gestion-locative/mandates/{mandate_id}/crg")
def list_crg(mandate_id: int, principal: Principal = Depends(get_principal),
             db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    mnd = db.get(Mandate, mandate_id)
    if mnd is None or mnd.agency_id != principal.agency_id:
        return err("Mandat introuvable.", 404)
    q = (db.query(CrgReport).filter(CrgReport.mandate_id == mandate_id)
         .order_by(CrgReport.year.desc(), CrgReport.month.desc()))
    return {"reports": [{"id": c.id, "period_label": c.period_label, "year": c.year,
                         "month": c.month, "rent_collected": num(c.rent_collected),
                         "fees": num(c.fees), "net": num(c.net), "sent_at": iso(c.sent_at)}
                        for c in q.all()]}
```

- [ ] **Step 3: Icône `chart-column.png`**
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"M18 17V9\"/><path d=\"M13 17V5\"/><path d=\"M8 17v-3\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/chart-column.png', output_width=52, output_height=52)
print('generated chart-column.png')
"
ls -la frontend/public/email-icons/chart-column.png
```

- [ ] **Step 4: `crg_report.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Votre compte-rendu de gestion — {{ period_label }}{% endblock %}
{% block preheader %}Le récapitulatif de la gestion locative de votre bien pour {{ period_label }}.{% endblock %}
{% block badge %}{{ lucide("chart-column") }}{% endblock %}
{% block hero_title %}Compte-rendu de gestion{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, voici votre CRG pour {{ period_label }}.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Voici le récapitulatif de la gestion de votre bien pour la période <strong>{{ period_label }}</strong>.</p>
{{ card([("Loyers encaissés", "{:,.0f}".format(rent_collected|float).replace(",", " ") ~ " " ~ currency)]
  + [("Honoraires de gestion", "{:,.0f}".format(fees|float).replace(",", " ") ~ " " ~ currency)]
  + [("Net reversé", "{:,.0f}".format(net|float).replace(",", " ") ~ " " ~ currency)]) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Le détail complet est disponible dans votre espace SemsarOut. Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 5: Job ordonnanceur** — dans `services/notification/app/scheduler.py`
```python
def _job_crg_reports(db) -> int:
    """CRG mensuel : récapitulatif des loyers encaissés le mois dernier, au propriétaire."""
    try:
        r = httpx.get(f"{_rental()}/internal/mandates/due-crg", headers=_headers(), timeout=10.0)
        reports = r.json().get("reports", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for rep in reports:
        landlord = recipients.client(rep.get("landlord_client_id"))
        to = (landlord.get("email") or "").strip()
        if _valid_email(to):
            _try_send(db, to, "crg_report.html", "crg_report", from_email=_contact(),
                      name=landlord.get("name"), period_label=rep.get("period_label"),
                      rent_collected=rep.get("rent_collected"), fees=rep.get("fees"),
                      net=rep.get("net"))
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_rental()}/internal/mandates/{rep['mandate_id']}/crg-sent",
                       headers=_headers(), json={k: rep[k] for k in ("rent_collected", "fees", "net")},
                       timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent
```
Dans `run_once`, ajouter :
```python
        cr = _job_crg_reports(db)
        if cr:
            logger.info("CRG envoyés", extra={"count": cr})
```

- [ ] **Step 6: Test E2E** — seed un propriétaire +addressé, un mandat + bail signé, et des `RentPeriod` **payées le mois dernier**, puis lancer le job

Redémarrer rental (Bash `run_in_background: true`, port 8518, env comme les tâches précédentes). Seed :
```bash
cd /home/younes/Documents/work/0semsar
env SERVICE_NAME=rental DATABASE_URL="postgresql+psycopg://rental:rental@localhost:5432/semsar_dev" PYTHONPATH=services/rental python3 -c "from app.db import init_db; init_db(); print('crg_report table ok')"
LID_OWNER=$(PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -tAc "INSERT INTO crm.client (first_name,last_name,email,client_type,agency_id,created_at,updated_at) VALUES ('Test','Owner','nciriyounes2005+crg@gmail.com','landlord',1,now(),now()) RETURNING id;")
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
MID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates $H -d "{\"property_id\":1,\"landlord_client_id\":$LID_OWNER,\"fee_percent\":8}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
LID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases $H -d "{\"mandate_id\":$MID,\"tenant_client_id\":2,\"rent_amount\":4500,\"charges_amount\":300,\"payment_day\":5}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST http://localhost:8518/backoffice/gestion-locative/leases/$LID/sign $H >/dev/null
# période payée du mois DERNIER
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "INSERT INTO rental.rent_period (lease_id, agency_id, period_label, year, month, rent_amount, charges_amount, total_amount, status, paid_amount, paid_at, receipt_number, created_at) VALUES ($LID, 1, 'Mois dernier', EXTRACT(YEAR FROM (now() - interval '1 month'))::int, EXTRACT(MONTH FROM (now() - interval '1 month'))::int, 4500, 300, 4800, 'paid', 4800, now(), 'QIT-CRG-0001', now());"
env SERVICE_NAME=notification DATABASE_URL="postgresql+psycopg://notification:notification@localhost:5432/semsar_dev" \
  RABBITMQ_URL="amqp://semsar:semsar@localhost:5672/" EVENTS_EXCHANGE=semsar.events OPENSEARCH_URL=http://localhost:9200 \
  INTERNAL_TOKEN=change-me-internal CRM_URL=http://localhost:8013 RENTAL_URL=http://localhost:8518 IDENTITY_URL=http://localhost:8501 \
  PYTHONPATH=services/notification python3 -c "
from app.handlers import load_dotenv; load_dotenv()
from app.scheduler import _job_crg_reports
from app.db import SessionLocal
db=SessionLocal(); print('sent:', _job_crg_reports(db)); db.close()"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "SELECT recipient,template,status FROM notification.notification_log WHERE recipient='nciriyounes2005+crg@gmail.com' ORDER BY created_at DESC LIMIT 1;"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "SELECT mandate_id, period_label, rent_collected, fees, net FROM rental.crg_report;"
```
Expected: `sent: 1`, `nciriyounes2005+crg@gmail.com | crg_report | sent`, une ligne `crg_report` (net = 4800 − 8% = 4416). 2ᵉ passage → 0 (CrgReport existe).

- [ ] **Step 7: Nettoyer + Commit**
```bash
PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -c "DELETE FROM crm.client WHERE email='nciriyounes2005+crg@gmail.com';"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "DELETE FROM notification.notification_log WHERE recipient='nciriyounes2005+crg@gmail.com';"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.crg_report; DELETE FROM rental.rent_period; DELETE FROM rental.lease; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
```
```bash
git add services/rental/app/models.py services/rental/app/main.py services/notification/app/scheduler.py services/notification/app/templates/crg_report.html frontend/public/email-icons/chart-column.png
```
```bash
git commit -m "feat(rental): compte-rendu de gestion (CRG) mensuel au propriétaire (email)"
```

---

### Task 2: CRG PDF

**Files:**
- Modify: `services/rental/app/pdf.py` (ajouter `render_crg_pdf`)
- Modify: `services/rental/app/main.py` (endpoint `crg.pdf`)

**Interfaces:**
- Produces: `pdf.render_crg_pdf(crg, landlord_name, mandate_reference)`; `GET /backoffice/gestion-locative/mandates/{id}/crg/{crg_id}.pdf`.

- [ ] **Step 1: `render_crg_pdf`** — dans `services/rental/app/pdf.py`
```python
def render_crg_pdf(crg, landlord_name: str, mandate_reference: str) -> bytes:
    """Compte-rendu de gestion PDF. `crg` = CrgReport."""
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
    collected = float(crg.rent_collected or 0)
    fees = float(crg.fees or 0)
    net = float(crg.net or 0)
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph("<b>COMPTE-RENDU DE GESTION</b>", head),
        Paragraph(f"Mandat : {mandate_reference or '-'}", info),
        Paragraph(f"Période : {crg.period_label or '-'}", info),
        Paragraph(f"Propriétaire : {landlord_name or '-'}", info),
        Spacer(1, 12),
        Paragraph(f"Loyers encaissés : {collected:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"Honoraires de gestion : {fees:,.2f} Đh".replace(",", " "), info),
        Paragraph(f"<b>Net reversé : {net:,.2f} Đh</b>".replace(",", " "), info),
    ]
    doc.build(story)
    return buf.getvalue()
```

- [ ] **Step 2: Endpoint PDF** — dans `main.py`
```python
@app.get("/backoffice/gestion-locative/mandates/{mandate_id}/crg/{crg_id}.pdf")
def crg_pdf(mandate_id: int, crg_id: int, principal: Principal = Depends(get_principal),
            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    crg = db.get(CrgReport, crg_id)
    if crg is None or crg.mandate_id != mandate_id or crg.agency_id != principal.agency_id:
        return err("CRG introuvable.", 404)
    mnd = db.get(Mandate, mandate_id)
    landlord = db.get(ClientRO, mnd.landlord_client_id) if mnd else None
    from . import pdf as pdf_mod
    data = pdf_mod.render_crg_pdf(
        crg, landlord_name=(f"{landlord.first_name} {landlord.last_name}" if landlord else None),
        mandate_reference=mnd.reference if mnd else None)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=CRG-{crg.year}-{crg.month:02d}.pdf"})
```

- [ ] **Step 3: Vérifier le PDF** — relancer rental, seed un mandat + un `crg_report`, GET le PDF
```bash
H='-H x-semsar-user-id:1 -H x-semsar-agency-id:1 -H x-semsar-features:rental -H Content-Type:application/json'
MID=$(curl -s -X POST http://localhost:8518/backoffice/gestion-locative/mandates $H -d '{"property_id":1,"landlord_client_id":1,"fee_percent":8}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
CRG_ID=$(PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -tAc "INSERT INTO rental.crg_report (mandate_id, agency_id, period_label, year, month, rent_collected, fees, net, sent_at, created_at) VALUES ($MID, 1, 'Juin 2026', 2026, 6, 4800, 384, 4416, now(), now()) RETURNING id;")
curl -s -o /tmp/crg.pdf -w '%{content_type} %{size_download}\n' http://localhost:8518/backoffice/gestion-locative/mandates/$MID/crg/$CRG_ID.pdf $H
file /tmp/crg.pdf
```
Expected: `application/pdf` + taille > 1000 ; `file` = PDF document. Vérifier 404 cross-agency (`x-semsar-agency-id: 999`).

- [ ] **Step 4: Nettoyer + Commit**
```bash
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.crg_report; DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
rm -f /tmp/crg.pdf
```
```bash
git add services/rental/app/pdf.py services/rental/app/main.py
```
```bash
git commit -m "feat(rental): compte-rendu de gestion (CRG) PDF"
```

---

### Task 3: Avis d'échéance de mandat (J-60)

**Files:**
- Modify: `services/rental/app/main.py` (endpoints due-expiry + expiry-notice-sent)
- Modify: `services/notification/app/scheduler.py` (job + run_once)
- Create: `services/notification/app/templates/mandate_expiry.html`
- Create: `frontend/public/email-icons/calendar-clock.png`

**Interfaces:**
- Produces: `GET /internal/mandates/due-expiry`, `POST /internal/mandates/{id}/expiry-notice-sent`; scheduler `_job_mandate_expiry_notices(db)`.

- [ ] **Step 1: Endpoints internes** — dans `main.py`
```python
@app.get("/internal/mandates/due-expiry", include_in_schema=False)
def internal_mandates_due_expiry(x_internal_token: str = Header(default=""),
                                 db: Session = Depends(get_db)):
    """Mandats actifs arrivant à échéance dans ≤ 60 j, sans avis encore envoyé."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    from datetime import timedelta
    now = datetime.utcnow()
    horizon = now + timedelta(days=60)
    rows = (db.query(Mandate)
            .filter(Mandate.status == "active", Mandate.expiry_notice_sent_at.is_(None),
                    Mandate.end_date.isnot(None), Mandate.end_date > now,
                    Mandate.end_date <= horizon).all())
    return {"mandates": [{"id": m.id, "landlord_client_id": m.landlord_client_id,
                          "reference": m.reference, "end_date": iso(m.end_date)} for m in rows]}


@app.post("/internal/mandates/{mandate_id}/expiry-notice-sent", include_in_schema=False)
def internal_mandate_expiry_sent(mandate_id: int, x_internal_token: str = Header(default=""),
                                 db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    m = db.get(Mandate, mandate_id)
    if m is not None:
        m.expiry_notice_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}
```

- [ ] **Step 2: Icône `calendar-clock.png`**
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5\"/><path d=\"M16 2v4M8 2v4M3 10h5\"/><circle cx=\"17\" cy=\"17\" r=\"5\"/><path d=\"M17 15v2l1 1\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/calendar-clock.png', output_width=52, output_height=52)
print('generated calendar-clock.png')
"
ls -la frontend/public/email-icons/calendar-clock.png
```

- [ ] **Step 3: `mandate_expiry.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Votre mandat de gestion arrive à échéance{% endblock %}
{% block preheader %}Votre mandat {{ reference }} expire prochainement — pensons au renouvellement.{% endblock %}
{% block badge %}{{ lucide("calendar-clock") }}{% endblock %}
{% block hero_title %}Échéance de votre mandat{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, votre mandat arrive bientôt à son terme.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Votre mandat de gestion <strong>{{ reference }}</strong> arrive à échéance{% if end_date %} le <strong>{{ end_date }}</strong>{% endif %}. Pour assurer la continuité de la gestion de votre bien, nous vous proposons d'en discuter le renouvellement.</p>
{{ card(([("Mandat", reference)] if reference else []) + ([("Échéance", end_date)] if end_date else [])) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Notre équipe vous recontactera. Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 4: Job ordonnanceur** — dans `scheduler.py`
```python
def _job_mandate_expiry_notices(db) -> int:
    """Avis d'échéance de mandat (J-60) au propriétaire."""
    try:
        r = httpx.get(f"{_rental()}/internal/mandates/due-expiry", headers=_headers(), timeout=10.0)
        mandates = r.json().get("mandates", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for mnd in mandates:
        landlord = recipients.client(mnd.get("landlord_client_id"))
        to = (landlord.get("email") or "").strip()
        if _valid_email(to):
            end = mnd.get("end_date")
            end_fr = end.split("T")[0] if end else None
            _try_send(db, to, "mandate_expiry.html", "mandate_expiry", from_email=_contact(),
                      name=landlord.get("name"), reference=mnd.get("reference"), end_date=end_fr)
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_rental()}/internal/mandates/{mnd['id']}/expiry-notice-sent",
                       headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent
```
Dans `run_once`, ajouter :
```python
        me = _job_mandate_expiry_notices(db)
        if me:
            logger.info("avis d'échéance de mandat envoyés", extra={"count": me})
```

- [ ] **Step 5: Test E2E** — seed un propriétaire +addressé + un mandat actif expirant dans 30 j, lancer le job
```bash
cd /home/younes/Documents/work/0semsar
LID_OWNER=$(PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -tAc "INSERT INTO crm.client (first_name,last_name,email,client_type,agency_id,created_at,updated_at) VALUES ('Test','Owner','nciriyounes2005+expiry@gmail.com','landlord',1,now(),now()) RETURNING id;")
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "INSERT INTO rental.mandate (reference, agency_id, property_id, landlord_client_id, mandate_type, fee_percent, status, end_date, created_at, updated_at) VALUES ('MND-EXP-0001', 1, 1, $LID_OWNER, 'gestion', 8, 'active', (now() AT TIME ZONE 'UTC') + interval '30 days', now(), now());"
env SERVICE_NAME=notification DATABASE_URL="postgresql+psycopg://notification:notification@localhost:5432/semsar_dev" \
  RABBITMQ_URL="amqp://semsar:semsar@localhost:5672/" EVENTS_EXCHANGE=semsar.events OPENSEARCH_URL=http://localhost:9200 \
  INTERNAL_TOKEN=change-me-internal CRM_URL=http://localhost:8013 RENTAL_URL=http://localhost:8518 IDENTITY_URL=http://localhost:8501 \
  PYTHONPATH=services/notification python3 -c "
from app.handlers import load_dotenv; load_dotenv()
from app.scheduler import _job_mandate_expiry_notices
from app.db import SessionLocal
db=SessionLocal(); print('sent:', _job_mandate_expiry_notices(db)); db.close()"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "SELECT recipient,template,status FROM notification.notification_log WHERE recipient='nciriyounes2005+expiry@gmail.com' ORDER BY created_at DESC LIMIT 1;"
```
Expected: `sent: 1`, `nciriyounes2005+expiry@gmail.com | mandate_expiry | sent`. 2ᵉ passage → 0 (expiry_notice_sent_at posé).

- [ ] **Step 6: Nettoyer + Commit**
```bash
PGPASSWORD=crm psql -h localhost -U crm -d semsar_dev -c "DELETE FROM crm.client WHERE email='nciriyounes2005+expiry@gmail.com';"
PGPASSWORD=notification psql -h localhost -U notification -d semsar_dev -c "DELETE FROM notification.notification_log WHERE recipient='nciriyounes2005+expiry@gmail.com';"
PGPASSWORD=rental psql -h localhost -U rental -d semsar_dev -c "DELETE FROM rental.mandate; DELETE FROM rental.outbox;"
```
```bash
git add services/rental/app/main.py services/notification/app/scheduler.py services/notification/app/templates/mandate_expiry.html frontend/public/email-icons/calendar-clock.png
```
```bash
git commit -m "feat(rental): avis d'échéance de mandat (J-60) au propriétaire"
```

---

### Task 4: Restitution du dépôt de garantie

**Files:**
- Modify: `services/rental/app/events.py` (`DEPOSIT_RETURNED`)
- Modify: `services/rental/app/main.py` (`POST /leases/{id}/deposit-return` + émission)
- Modify: `services/notification/app/handlers.py` (handler + routage)
- Modify: `services/notification/app/worker.py` (binding)
- Create: `services/notification/app/templates/deposit_return.html`
- Create: `frontend/public/email-icons/piggy-bank.png`

**Interfaces:**
- Produces: `events.DEPOSIT_RETURNED`; `POST /backoffice/gestion-locative/leases/{id}/deposit-return`; handler `_handle_deposit_returned`.

- [ ] **Step 1: Événement** — dans `events.py` : `DEPOSIT_RETURNED = "rental.deposit.returned"`

- [ ] **Step 2: Endpoint** — dans `main.py`
```python
@app.post("/backoffice/gestion-locative/leases/{lease_id}/deposit-return")
async def deposit_return(lease_id: int, request: Request,
                         principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    if l.deposit_returned_at is not None:
        return err("Dépôt déjà restitué.", 400)
    data = await json_body(request)
    amount = data.get("amount", l.deposit_amount)
    l.deposit_returned_at = datetime.utcnow()
    l.deposit_return_amount = amount
    enqueue(db, "lease", l.id, events.DEPOSIT_RETURNED, {
        "id": l.id, "tenant_client_id": l.tenant_client_id, "property_id": l.property_id,
        "deposit_amount": num(l.deposit_amount), "return_amount": num(amount)})
    db.commit()
    return _lease_dict(l)
```

- [ ] **Step 3: Icône `piggy-bank.png`**
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-3V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z\"/><path d=\"M16 10h.01M2 8v1a2 2 0 0 0 2 2h1\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/piggy-bank.png', output_width=52, output_height=52)
print('generated piggy-bank.png')
"
ls -la frontend/public/email-icons/piggy-bank.png
```

- [ ] **Step 4: `deposit_return.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Restitution de votre dépôt de garantie{% endblock %}
{% block preheader %}Votre dépôt de garantie vous est restitué.{% endblock %}
{% block badge %}{{ lucide("piggy-bank") }}{% endblock %}
{% block hero_title %}Dépôt de garantie restitué{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, votre dépôt vous est reversé.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Suite à la fin de votre location, votre dépôt de garantie vous est restitué. Nous vous remercions de votre confiance.</p>
{{ card(([("Dépôt initial", "{:,.0f}".format(deposit_amount|float).replace(",", " ") ~ " " ~ currency)] if deposit_amount else [])
  + [("Montant restitué", "{:,.0f}".format(return_amount|float).replace(",", " ") ~ " " ~ currency)]) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 5: Handler + routage + binding** — dans `services/notification/app/handlers.py`
```python
def _handle_deposit_returned(db, payload):
    """rental.deposit.returned → confirmation de restitution au locataire."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "deposit_return.html", "deposit_return", from_email=_contact(),
              name=tenant.get("name"), deposit_amount=payload.get("deposit_amount"),
              return_amount=payload.get("return_amount"))
```
Dans `handle_event` : `elif routing_key == "rental.deposit.returned": _handle_deposit_returned(db, payload)`.
Dans `worker.py`, ajouter `"rental.deposit.returned"` à `bindings`.

- [ ] **Step 6: Test E2E** — redémarrer rental + worker notification, seed un locataire + un bail avec dépôt, appeler deposit-return, vérifier l'envoi (chemin événementiel complet : relay rental + worker notification requis — voir la note d'exécution). Attendu : `deposit_return | sent`. Rappeler l'endpoint → 400 (déjà restitué). Nettoyer.

- [ ] **Step 7: Commit**
```bash
git add services/rental/app/events.py services/rental/app/main.py services/notification/app/handlers.py services/notification/app/worker.py services/notification/app/templates/deposit_return.html frontend/public/email-icons/piggy-bank.png
```
```bash
git commit -m "feat(rental): restitution du dépôt de garantie + email au locataire"
```

---

### Task 5: Révision de loyer

**Files:**
- Modify: `services/rental/app/events.py` (`LEASE_REVISED`)
- Modify: `services/rental/app/main.py` (`POST /leases/{id}/revise` + émission)
- Modify: `services/notification/app/handlers.py` (handler + routage)
- Modify: `services/notification/app/worker.py` (binding)
- Create: `services/notification/app/templates/lease_revised.html`
- Create: `frontend/public/email-icons/trending-up.png`

**Interfaces:**
- Produces: `events.LEASE_REVISED`; `POST /backoffice/gestion-locative/leases/{id}/revise`; handler `_handle_lease_revised`.

- [ ] **Step 1: Événement** — `LEASE_REVISED = "rental.lease.revised"`

- [ ] **Step 2: Endpoint** — dans `main.py`
```python
@app.post("/backoffice/gestion-locative/leases/{lease_id}/revise")
async def revise_lease(lease_id: int, request: Request,
                       principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    data = await json_body(request)
    if data.get("new_rent") is None:
        return err("new_rent est requis.", 400)
    old_rent = num(l.rent_amount)
    l.rent_amount = data["new_rent"]
    l.last_revision_at = datetime.utcnow()
    effective = _parse_dt(data.get("effective_date"))
    enqueue(db, "lease", l.id, events.LEASE_REVISED, {
        "id": l.id, "tenant_client_id": l.tenant_client_id, "property_id": l.property_id,
        "old_rent": old_rent, "new_rent": num(l.rent_amount),
        "effective_date": iso(effective)})
    db.commit()
    return _lease_dict(l)
```

- [ ] **Step 3: Icône `trending-up.png`**
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 7h6v6\"/><path d=\"m22 7-8.5 8.5-5-5L2 17\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/trending-up.png', output_width=52, output_height=52)
print('generated trending-up.png')
"
ls -la frontend/public/email-icons/trending-up.png
```

- [ ] **Step 4: `lease_revised.html`**
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% block subject %}Révision de votre loyer{% endblock %}
{% block preheader %}Votre loyer est révisé{% if effective_date %} à compter du {{ effective_date }}{% endif %}.{% endblock %}
{% block badge %}{{ lucide("trending-up") }}{% endblock %}
{% block hero_title %}Révision de votre loyer{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, voici la révision de votre loyer.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Conformément aux conditions de votre bail, votre loyer est révisé{% if effective_date %} à compter du <strong>{{ effective_date }}</strong>{% endif %}.</p>
{{ card(([("Ancien loyer", "{:,.0f}".format(old_rent|float).replace(",", " ") ~ " " ~ currency)] if old_rent else [])
  + [("Nouveau loyer", "{:,.0f}".format(new_rent|float).replace(",", " ") ~ " " ~ currency)]) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">Une question sur cette révision&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 5: Handler + routage + binding** — dans `handlers.py`
```python
def _handle_lease_revised(db, payload):
    """rental.lease.revised → avis de révision de loyer au locataire."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    eff = payload.get("effective_date")
    _try_send(db, to, "lease_revised.html", "lease_revised", from_email=_contact(),
              name=tenant.get("name"), old_rent=payload.get("old_rent"),
              new_rent=payload.get("new_rent"),
              effective_date=(eff.split("T")[0] if eff else None))
```
`handle_event` : `elif routing_key == "rental.lease.revised": _handle_lease_revised(db, payload)`. `worker.py` bindings : `"rental.lease.revised"`.

- [ ] **Step 6: Test E2E** — comme Task 4 (chemin événementiel) : seed locataire + bail, `POST /revise {new_rent}`, vérifier `lease_revised | sent`. Nettoyer.

- [ ] **Step 7: Commit**
```bash
git add services/rental/app/events.py services/rental/app/main.py services/notification/app/handlers.py services/notification/app/worker.py services/notification/app/templates/lease_revised.html frontend/public/email-icons/trending-up.png
```
```bash
git commit -m "feat(rental): révision de loyer + avis au locataire"
```

---

### Task 6: Régularisation annuelle des charges

**Files:**
- Modify: `services/rental/app/models.py` (`ChargeRegularization`)
- Modify: `services/rental/app/events.py` (`CHARGE_REGULARIZED`)
- Modify: `services/rental/app/main.py` (CRUD régularisation + send)
- Modify: `services/notification/app/handlers.py` (handler + routage)
- Modify: `services/notification/app/worker.py` (binding)
- Create: `services/notification/app/templates/charge_regularization.html`
- Create: `frontend/public/email-icons/calculator.png`

**Interfaces:**
- Produces: `models.ChargeRegularization`; `events.CHARGE_REGULARIZED`; `POST /leases/{id}/charge-regularizations`, `GET /leases/{id}/charge-regularizations`, `POST /charge-regularizations/{id}/send`; handler `_handle_charge_regularized`.

- [ ] **Step 1: Modèle** — dans `models.py` (après `CrgReport`)
```python
class ChargeRegularization(Base):
    __tablename__ = "charge_regularization"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lease_id = Column(Integer, index=True, nullable=False)
    agency_id = Column(Integer, index=True, nullable=False)
    year = Column(Integer, nullable=False)
    provisions_total = Column(Numeric(12, 2), default=0)   # charges provisionnées encaissées
    actual_total = Column(Numeric(12, 2), default=0)       # charges réelles (saisie agence)
    balance = Column(Numeric(12, 2), default=0)            # +=dû par locataire / -=à rembourser
    status = Column(String(20), default="draft")           # draft|sent|settled
    statement_sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: Événement** — `CHARGE_REGULARIZED = "rental.charge_regularization.sent"`

- [ ] **Step 3: Endpoints** — dans `main.py` (importer `ChargeRegularization`)
```python
def _charge_reg_dict(cr: ChargeRegularization) -> dict:
    return {"id": cr.id, "lease_id": cr.lease_id, "year": cr.year,
            "provisions_total": num(cr.provisions_total), "actual_total": num(cr.actual_total),
            "balance": num(cr.balance), "status": cr.status,
            "statement_sent_at": iso(cr.statement_sent_at), "created_at": iso(cr.created_at)}


@app.post("/backoffice/gestion-locative/leases/{lease_id}/charge-regularizations", status_code=201)
async def create_charge_reg(lease_id: int, request: Request,
                            principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    data = await json_body(request)
    if data.get("year") is None or data.get("actual_total") is None:
        return err("year et actual_total sont requis.", 400)
    year = int(data["year"])
    provisions = sum(float(rp.charges_amount or 0) for rp in db.query(RentPeriod).filter(
        RentPeriod.lease_id == lease_id, RentPeriod.year == year, RentPeriod.status == "paid").all())
    actual = float(data["actual_total"])
    cr = ChargeRegularization(lease_id=lease_id, agency_id=principal.agency_id, year=year,
                              provisions_total=round(provisions, 2), actual_total=actual,
                              balance=round(actual - provisions, 2))
    db.add(cr)
    db.commit()
    return _charge_reg_dict(cr)


@app.get("/backoffice/gestion-locative/leases/{lease_id}/charge-regularizations")
def list_charge_reg(lease_id: int, principal: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    l = db.get(Lease, lease_id)
    if l is None or l.agency_id != principal.agency_id:
        return err("Bail introuvable.", 404)
    q = (db.query(ChargeRegularization).filter(ChargeRegularization.lease_id == lease_id)
         .order_by(ChargeRegularization.year.desc()))
    return {"charge_regularizations": [_charge_reg_dict(cr) for cr in q.all()]}


@app.post("/backoffice/gestion-locative/charge-regularizations/{reg_id}/send")
def send_charge_reg(reg_id: int, principal: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    if (g := _gate(principal)) is not None:
        return g
    cr = db.get(ChargeRegularization, reg_id)
    if cr is None or cr.agency_id != principal.agency_id:
        return err("Régularisation introuvable.", 404)
    lease = db.get(Lease, cr.lease_id)
    cr.status = "sent"
    cr.statement_sent_at = datetime.utcnow()
    enqueue(db, "charge_regularization", cr.id, events.CHARGE_REGULARIZED, {
        "id": cr.id, "tenant_client_id": lease.tenant_client_id if lease else None,
        "year": cr.year, "provisions_total": num(cr.provisions_total),
        "actual_total": num(cr.actual_total), "balance": num(cr.balance)})
    db.commit()
    return _charge_reg_dict(cr)
```

- [ ] **Step 4: Icône `calculator.png`**
```bash
cd /home/younes/Documents/work/0semsar
python3 -c "
import cairosvg
svg='''<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\"/><line x1=\"8\" x2=\"16\" y1=\"6\" y2=\"6\"/><line x1=\"16\" x2=\"16\" y1=\"14\" y2=\"18\"/><path d=\"M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01\"/></svg>'''
cairosvg.svg2png(bytestring=svg.encode(), write_to='frontend/public/email-icons/calculator.png', output_width=52, output_height=52)
print('generated calculator.png')
"
ls -la frontend/public/email-icons/calculator.png
```

- [ ] **Step 5: `charge_regularization.html`** (le solde peut être dû par le locataire ou à lui rembourser)
```html
{% extends "base.html" %}
{% from "_components.html" import card, lucide with context %}
{% set owed = (balance or 0)|float > 0 %}
{% block subject %}Régularisation de vos charges — {{ year }}{% endblock %}
{% block preheader %}Le décompte annuel de vos charges pour {{ year }} est disponible.{% endblock %}
{% block badge %}{{ lucide("calculator") }}{% endblock %}
{% block hero_title %}Régularisation des charges {{ year }}{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if name %} {{ name }}{% endif %}, voici votre décompte annuel.</p>{% endblock %}
{% block content %}
<p style="text-align:center; color:{{ brand.ink }};">Voici le décompte de vos charges pour l'année <strong>{{ year }}</strong>, comparant les provisions versées aux charges réelles.</p>
{{ card([("Provisions versées", "{:,.0f}".format(provisions_total|float).replace(",", " ") ~ " " ~ currency)]
  + [("Charges réelles", "{:,.0f}".format(actual_total|float).replace(",", " ") ~ " " ~ currency)]
  + [(("Solde à régler" if owed else "Trop-perçu à rembourser"), "{:,.0f}".format((balance|float)|abs).replace(",", " ") ~ " " ~ currency)]) }}
<p style="margin-top:18px; font-size:13px; color:{{ brand.muted }}; text-align:center;">{% if owed %}Ce solde sera ajouté à votre prochaine échéance.{% else %}Ce montant vous sera remboursé.{% endif %} Une question&nbsp;? <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

- [ ] **Step 6: Handler + routage + binding** — dans `handlers.py`
```python
def _handle_charge_regularized(db, payload):
    """rental.charge_regularization.sent → décompte annuel des charges au locataire."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "charge_regularization.html", "charge_regularization", from_email=_contact(),
              name=tenant.get("name"), year=payload.get("year"),
              provisions_total=payload.get("provisions_total"),
              actual_total=payload.get("actual_total"), balance=payload.get("balance"))
```
`handle_event` : `elif routing_key == "rental.charge_regularization.sent": _handle_charge_regularized(db, payload)`. `worker.py` bindings : `"rental.charge_regularization.sent"`.

- [ ] **Step 7: Test E2E** — redémarrer rental (nouvelle table) + worker notification. Seed locataire + bail + une `RentPeriod` payée avec charges (année N). Créer une régularisation (`actual_total`), la `send`, vérifier `charge_regularization | sent` + le calcul du solde. Nettoyer.

- [ ] **Step 8: Commit**
```bash
git add services/rental/app/models.py services/rental/app/events.py services/rental/app/main.py services/notification/app/handlers.py services/notification/app/worker.py services/notification/app/templates/charge_regularization.html frontend/public/email-icons/calculator.png
```
```bash
git commit -m "feat(rental): régularisation annuelle des charges + décompte au locataire"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/emails/catalogue-emails.md`

- [ ] **Step 1: Statuts** — passer à ✅ (Phase 3) : « Propriétaire : Compte-rendu de gestion (CRG) », « Avis d'échéance de mandat », « Restitution du dépôt de garantie », « Révision annuelle du loyer (indice IRL) », « Régularisation des charges (décompte annuel) ». Laisser 🔴 la candidature locative (Phase 4) et l'UI (Phase 5). Mettre à jour le bandeau §3 : « Phases 1-3 livrées (mandats, baux, quittancement, CRG/échéance/dépôt/révision/charges) ; Phases 4-5 à venir (candidature, UI) ».

- [ ] **Step 2: Commit**
```bash
git add docs/emails/catalogue-emails.md
```
```bash
git commit -m "docs(rental): statut Phase 3 (CRG, échéance mandat, dépôt, révision, charges)"
```

---

## Self-Review

**Spec coverage (Phase 3)** — la spec §14 définit la Phase 3 = « CRG (email + PDF), avis d'échéance de mandat, révision IRL, régularisation des charges, restitution du dépôt ». Couverture : CRG email (T1) + PDF (T2), échéance de mandat (T3), restitution du dépôt (T4), révision de loyer (T5), régularisation des charges (T6), docs (T7). ✅ Complet. Candidature locative = Phase 4, UI = Phase 5 (plans séparés).

**Écart assumé vs spec §11** — la spec listait des jobs d'ordonnanceur `_job_rent_revision_notices` et `_job_charge_regularizations`. La réalité « saisie manuelle » (le nouveau loyer et les charges réelles sont saisis par l'agence) rend ces deux processus **déclenchés par l'agence** (routes back-office `/revise` et `/charge-regularizations/{id}/send`) plutôt que temporels — plus juste métier, même design événementiel que la restitution du dépôt. CRG et échéance de mandat restent pilotés par l'ordonnanceur (données 100 % dérivées).

**Placeholder scan** — aucun « TBD/TODO ». Noms via `ClientRO` (peut être vide → email résolu par notification via crm ; les emails ne dépendent pas de la projection). Le CRG n'est émis que si `rent_collected > 0` (rien à reporter sinon).

**Type consistency** — chaque endpoint interne/émission produit exactement les clés lues par le job/handler correspondant : due-crg→`_job_crg_reports` (`landlord_client_id`, `period_label`, `rent_collected`, `fees`, `net`) ; due-expiry→`_job_mandate_expiry_notices` (`reference`, `end_date`) ; `DEPOSIT_RETURNED`→`_handle_deposit_returned` (`tenant_client_id`, `deposit_amount`, `return_amount`) ; `LEASE_REVISED`→`_handle_lease_revised` (`old_rent`, `new_rent`, `effective_date`) ; `CHARGE_REGULARIZED`→`_handle_charge_regularized` (`year`, `provisions_total`, `actual_total`, `balance`). Réutilise `_gate`, `_reference`, `_parse_dt`, `_MONTHS_FR`, `_rental()`, `num`, `iso` des phases précédentes.

**Idempotence** — CRG : `CrgReport unique(mandate, year, month)` + skip si présent. Échéance de mandat : `expiry_notice_sent_at`. Dépôt : `deposit_returned_at` (400 si déjà restitué). Révision : pas d'anti-doublon (action explicite de l'agence, ré-émission volontaire acceptée). Charges : `send` change le statut à `sent`.

**Note d'exécution** — CRG (T1) et échéance de mandat (T3) : jobs testables en direct via `python3 -c` (rental + crm up). Dépôt (T4), révision (T5), charges (T6) : chemin **événementiel** → nécessitent le **relay rental** + le **worker notification** (avec le nouveau binding) vivants ; redémarrer le worker après ajout du binding. Redémarrer rental après T1/T3/T4/T5/T6 (nouveaux endpoints/tables). Lancer les services via le paramètre `run_in_background: true` de l'outil Bash.
