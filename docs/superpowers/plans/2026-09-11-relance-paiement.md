# Renouvellement et échec de paiement — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À l'échéance d'un abonnement, billing redemande le paiement ; un échec est signalé à l'agence avec son motif ; faute de paiement à l'épuisement des relances, l'accès est réduit à la facturation (login conservé) et le superadmin le voit dans son tableau de bord.

**Architecture:** billing porte une machine à états `active → past_due → restricted` et émet la facture de renouvellement, réveillé par l'ordonnanceur de notification (unité systemd déjà déployée). payment émet `payment.failed` ; billing le consigne sans changer le statut ; notification envoie les courriels. La révocation réutilise `features_until` (chantier A3). Le frontend affiche un bandeau et renvoie une agence en accès réduit vers sa page d'abonnement.

**Tech Stack:** FastAPI + SQLAlchemy + outbox RabbitMQ (`semsar_events.enqueue`), pytest ; React 18 + react-query v3 + react-i18next, vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-relance-paiement-design.md`

## Global Constraints

- Un échec de paiement ne rend **jamais** un abonnement `cancelled` (I1).
- `restricted` n'empêche **jamais** le login : ne pas toucher `AgencyRO.is_suspended` (I3).
- Délai de grâce : `_GRACE_DAYS = _FIRST_REMINDER_DAYS + _MAX_REMINDERS * _REMINDER_INTERVAL_DAYS` (24 j), aucune nouvelle constante magique.
- `_features_until` et `_reconcile_expired` lisent la même échéance, via `_deadline(sub)` (I7).
- Toute colonne ajoutée à une table déployée passe par une migration idempotente listée dans `MIGRATIONS` de `infra/prod/deploy-remote.sh` (le garde-fou de `infra/prod/tests/deploy-remote.test.sh` l'exige). Rien dans `infra/prod/ansible/` : hors chaîne de déploiement.
- Textes utilisateur en français ET en arabe (`frontend/src/locales/{fr,ar}/*.json`), aucun identifiant technique ni code d'erreur brut (`unknown`, UUID) dans un message. Tout nouveau fichier `.jsx` d'interface est ajouté à `MIGRATED_FILES` de `frontend/src/i18n/noHardcodedText.test.js`.
- Commentaires en français, uniquement le *pourquoi*. Aucun code mort.
- Commits : Conventional Commits, un par tâche, **aucune attribution IA** (ni `Co-Authored-By`, ni `Claude-Session`). Jamais `--no-verify`.
- Test rouge constaté AVANT chaque correctif (sortie collée dans le rapport).
- Tests Python : lancer avec `OTEL_SDK_DISABLED=true` (sinon l'export de traces bruite la sortie).

## Écarts assumés par rapport au spec

- **Pas de tâche identity.** identity ignore le statut d'abonnement : il ne lit que `features_until`. Le test d'A3 (`test_features_expirees_ne_sont_plus_servies_meme_si_billing_est_injoignable`) couvre déjà `past_due` échu.
- **Pas de `open_invoice_reference`** dans `_sub_dict`. « Payer maintenant » passe par `/checkout?plan=…&billing=…`, qui n'a pas besoin de la référence ; la facture reste visible dans l'onglet Factures. Évite une requête par ligne dans `/internal/subscriptions`.
- **Motif d'échec stocké = libellé passerelle seulement** (`reason_label`), jamais le code : le code `unknown` finirait sinon affiché à l'agence.
- **Lien mort corrigé en passant** : `invoice_reminder.html` pointe vers `/backoffice/abonnement`, absent du routeur ; la page réelle est `/dashboard/compte/abonnement` (Task 5).

---

### Task 1: billing — états `past_due` / `restricted` et échéance de grâce

**Files:**
- Modify: `services/billing/app/models.py` (classe `Subscription`)
- Create: `services/billing/db/migrate_payment_failure.sql`
- Modify: `infra/prod/deploy-remote.sh` (liste `MIGRATIONS`)
- Modify: `services/billing/app/main.py` (`_sub_dict`, `_REVOCABLE_ON_PERIOD_END`, `_features_until`, `_reconcile_expired`, `_ENTITLED_STATUSES`)
- Test: `services/billing/tests/test_entitlements.py`

**Interfaces:**
- Produces: colonnes `Subscription.grace_until: DateTime | None`, `last_payment_failure_at: DateTime | None`, `last_payment_failure_reason: String(255) | None` ; helper `_deadline(sub: Subscription) -> datetime | None` ; statuts `"past_due"`, `"restricted"` ; `_sub_dict` expose `grace_until`, `features_until`, `last_payment_failure_at`, `last_payment_failure_reason` (ISO 8601 ou `None`).

- [ ] **Step 1: Écrire les tests qui échouent** — ajouter à la fin de `services/billing/tests/test_entitlements.py` :

```python
def test_past_due_reste_entitle_pendant_la_grace(monkeypatch, tmp_path):
    """Renouvellement impayé mais grâce en cours : les droits valent encore, et leur terme
    est la fin de la grâce — pas `end_date`, déjà dépassée au moment du renouvellement."""
    from datetime import datetime, timedelta

    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    grace = datetime.utcnow() + timedelta(days=10)
    db.add(Subscription(agency_id=40, plan_id=plan.id, amount=499, status="past_due",
                        end_date=datetime.utcnow() - timedelta(days=14), grace_until=grace))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            sub = client.get("/internal/subscription", params={"agency_id": 40},
                             headers={"x-internal-token": "tok"}).json()["subscription"]
        assert sub["status"] == "past_due"
        assert sub["features"] == ["design3d"]
        assert sub["features_until"] == grace.isoformat()
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_past_due_grace_ecoulee_passe_restricted_et_vide_les_droits(monkeypatch, tmp_path):
    """Grâce écoulée sans paiement : accès réduit (`restricted`), pas `expired` — l'agence
    reste abonnée et repart en payant. L'événement réémis vide les features."""
    from datetime import datetime, timedelta

    from semsar_events import OutboxEvent

    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    sub = Subscription(agency_id=41, plan_id=plan.id, amount=499, status="past_due",
                       end_date=datetime.utcnow() - timedelta(days=30),
                       grace_until=datetime.utcnow() - timedelta(days=1))
    db.add(sub)
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            body = client.get("/internal/subscription", params={"agency_id": 41},
                              headers={"x-internal-token": "tok"}).json()["subscription"]
        assert body["status"] == "restricted"
        assert body["features"] == []
        assert db.get(Subscription, sub.id).status == "restricted"
        ev = (db.query(OutboxEvent).filter_by(event_type="billing.subscription.activated")
              .order_by(OutboxEvent.id.desc()).first())
        assert ev is not None and ev.payload["features"] == []
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_internal_subscriptions_expose_grace_et_dernier_echec(monkeypatch, tmp_path):
    from datetime import datetime, timedelta

    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan()
    db.add(plan)
    db.commit()
    grace = datetime.utcnow() + timedelta(days=5)
    echec = datetime.utcnow() - timedelta(hours=2)
    db.add(Subscription(agency_id=42, plan_id=plan.id, amount=499, status="past_due",
                        grace_until=grace, last_payment_failure_at=echec,
                        last_payment_failure_reason="Carte refusée"))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            row = client.get("/internal/subscriptions",
                             headers={"x-internal-token": "tok"}).json()["subscriptions"]["42"]
        assert row["grace_until"] == grace.isoformat()
        assert row["features_until"] == grace.isoformat()
        assert row["last_payment_failure_at"] == echec.isoformat()
        assert row["last_payment_failure_reason"] == "Carte refusée"
    finally:
        app.dependency_overrides.clear()
        db.close()
```

- [ ] **Step 2: Constater l'échec**

Run: `cd services/billing && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider tests/test_entitlements.py -k "grace or dernier_echec"`
Expected: FAIL — `TypeError: 'grace_until' is an invalid keyword argument for Subscription`.

- [ ] **Step 3: Colonnes du modèle** — dans `services/billing/app/models.py`, classe `Subscription`, après `cancelled_at` :

```python
    # Échéance de grâce d'un renouvellement impayé (`past_due`). Distincte de `end_date` : au
    # renouvellement, `end_date` est déjà dépassée — c'est elle qui déclenche la facture — et
    # la lire comme échéance réduirait l'accès le jour même.
    grace_until = Column(DateTime)
    last_payment_failure_at = Column(DateTime)
    # Libellé renvoyé par la passerelle, montré tel quel à l'agence : jamais un code technique.
    last_payment_failure_reason = Column(String(255))
```

- [ ] **Step 4: Migration** — créer `services/billing/db/migrate_payment_failure.sql` :

```sql
-- Renouvellement et échec de paiement des abonnements (spec 2026-09-11-relance-paiement).
-- `grace_until` : échéance de grâce d'un renouvellement impayé (statut `past_due`).
-- `last_payment_failure_*` : dernier échec signalé par la passerelle, montré à l'agence.
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS grace_until timestamp NULL;
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS last_payment_failure_at timestamp NULL;
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS last_payment_failure_reason varchar(255) NULL;
```

Dans `infra/prod/deploy-remote.sh`, liste `MIGRATIONS`, ajouter la ligne après `billing/migrate_design3d_entitlement.sql` :

```
billing/migrate_payment_failure.sql
```

- [ ] **Step 5: États et échéance** — dans `services/billing/app/main.py` :

Remplacer la ligne `_REVOCABLE_ON_PERIOD_END = {"incomplete", "cancelled"}` et son commentaire de trois lignes par :

```python
# Statuts dont l'échéance vaut révocation des entitlements : `incomplete` (changement de plan
# jamais réglé, I8), `cancelled` (résiliation différée dont la période payée est écoulée, A3) et
# `past_due` (renouvellement impayé dont la grâce est écoulée). `active` en est absent : sa
# prolongation passe par le worker ou par l'émission du renouvellement.
_REVOCABLE_ON_PERIOD_END = {"incomplete", "cancelled", "past_due"}


def _deadline(sub: Subscription) -> "datetime | None":
    """Échéance des droits d'un abonnement révocable. Seul point de vérité, lu à la fois par
    `_features_until` (ce qu'identity projette) et par `_reconcile_expired` (ce que billing
    applique) : s'ils divergeaient, identity révoquerait à une date et billing à une autre."""
    return sub.grace_until if sub.status == "past_due" else sub.end_date
```

Dans `_features_until`, remplacer `return sub.end_date if sub.status in _REVOCABLE_ON_PERIOD_END else None` par :

```python
    return _deadline(sub) if sub.status in _REVOCABLE_ON_PERIOD_END else None
```

Dans `_reconcile_expired`, remplacer les lignes exécutables après la docstring (de `if sub is None or …` à `db.commit()`) par :

```python
    if sub is None or sub.status not in _REVOCABLE_ON_PERIOD_END:
        return
    deadline = _deadline(sub)
    if deadline is None or deadline > datetime.utcnow():
        return
    # `past_due` devient `restricted`, pas `expired` : l'agence reste abonnée, garde son login,
    # et repart en réglant sa facture. `expired` clôt un abonnement résilié ou jamais payé.
    sub.status = "restricted" if sub.status == "past_due" else "expired"
    enqueue(db, "subscription", sub.id, events.SUBSCRIPTION_ACTIVATED,
            {"subscription_id": sub.id, "agency_id": sub.agency_id, "features": [],
             "features_until": None})
    db.commit()
```

Remplacer `_ENTITLED_STATUSES = {"active", "cancelled"}` et son commentaire de trois lignes par :

```python
# Statuts avec accès effectif au plan. `cancelled` : résiliation différée, l'accès court jusqu'à
# la fin de la période payée. `past_due` : renouvellement impayé, l'accès court jusqu'à la fin de
# la grâce. `incomplete`, `expired` et `restricted` en sont volontairement absents.
_ENTITLED_STATUSES = {"active", "cancelled", "past_due"}
```

Dans `_sub_dict`, remplacer la ligne `"listings_used": s.listings_used, "listings_remaining": remaining,` par :

```python
        "listings_used": s.listings_used, "listings_remaining": remaining,
        "grace_until": iso(s.grace_until), "features_until": iso(_features_until(s)),
        "last_payment_failure_at": iso(s.last_payment_failure_at),
        "last_payment_failure_reason": s.last_payment_failure_reason,
```

- [ ] **Step 6: Vérifier**

Run: `cd services/billing && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider` puis, depuis la racine, `bash infra/prod/tests/deploy-remote.test.sh` et `python3 -m ruff check services/billing`.
Expected: tout vert.

- [ ] **Step 7: Commit**

```bash
git add services/billing/app/models.py services/billing/db/migrate_payment_failure.sql infra/prod/deploy-remote.sh services/billing/app/main.py services/billing/tests/test_entitlements.py
git commit -m "feat(billing): distinguer le renouvellement impayé et l'accès réduit"
```

---

### Task 2: billing — émission des factures de renouvellement

**Files:**
- Modify: `services/billing/app/main.py` (constantes de relance, `change_plan`, `internal_invoices_due_reminders`, nouvel endpoint)
- Test: `services/billing/tests/test_entitlements.py`

**Interfaces:**
- Consumes: `_deadline`, `_features_until`, statut `"past_due"`, `Subscription.grace_until` (Task 1).
- Produces: `POST /internal/subscriptions/issue-renewals` (en-tête `x-internal-token`) → `{"issued": [{"subscription_id": int, "invoice_id": int, "agency_id": int}]}`. Événement `billing.invoice.created` au payload `{invoice_id, agency_id, amount, plan, purpose: "subscription", reference, period_label, renewal: bool, grace_until: ISO | None}` (aussi pour `change_plan`, avec `renewal: False`, `grace_until: None`). `/internal/invoices/due-reminders` ajoute `grace_until` à chaque facture.

- [ ] **Step 1: Écrire les tests qui échouent** — ajouter à `services/billing/tests/test_entitlements.py` :

```python
def _renewal_env(monkeypatch, tmp_path, **sub_fields):
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    sub = Subscription(agency_id=50, plan_id=plan.id, amount=499, **sub_fields)
    db.add(sub)
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    return db, sub


def test_issue_renewals_emet_la_facture_et_ouvre_la_grace(monkeypatch, tmp_path):
    from datetime import datetime, timedelta

    from semsar_events import OutboxEvent

    from app.models import Invoice
    db, sub = _renewal_env(monkeypatch, tmp_path, status="active",
                           end_date=datetime.utcnow() - timedelta(hours=1))
    try:
        with TestClient(app) as client:
            resp = client.post("/internal/subscriptions/issue-renewals",
                               headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        assert [i["subscription_id"] for i in resp.json()["issued"]] == [sub.id]
        invoices = db.query(Invoice).filter_by(subscription_id=sub.id).all()
        assert len(invoices) == 1 and invoices[0].status == "unpaid"
        stored = db.get(Subscription, sub.id)
        assert stored.status == "past_due"
        assert stored.grace_until - invoices[0].issued_at == timedelta(days=24)
        created = db.query(OutboxEvent).filter_by(event_type="billing.invoice.created").one()
        assert created.payload["renewal"] is True
        assert created.payload["reference"] == invoices[0].reference
        activated = (db.query(OutboxEvent).filter_by(event_type="billing.subscription.activated")
                     .order_by(OutboxEvent.id.desc()).first())
        assert activated.payload["features"] == ["design3d"]
        assert activated.payload["features_until"] == stored.grace_until.isoformat()
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_issue_renewals_est_idempotent(monkeypatch, tmp_path):
    """I4 : réveillé deux fois, l'ordonnanceur ne doit jamais faire émettre deux factures."""
    from datetime import datetime, timedelta

    from app.models import Invoice
    db, sub = _renewal_env(monkeypatch, tmp_path, status="active",
                           end_date=datetime.utcnow() - timedelta(hours=1))
    try:
        with TestClient(app) as client:
            client.post("/internal/subscriptions/issue-renewals", headers={"x-internal-token": "tok"})
            second = client.post("/internal/subscriptions/issue-renewals",
                                 headers={"x-internal-token": "tok"})
        assert second.json()["issued"] == []
        assert db.query(Invoice).filter_by(subscription_id=sub.id).count() == 1
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_issue_renewals_ignore_un_abonnement_non_echu(monkeypatch, tmp_path):
    from datetime import datetime, timedelta
    db, sub = _renewal_env(monkeypatch, tmp_path, status="active",
                           end_date=datetime.utcnow() + timedelta(days=3))
    try:
        with TestClient(app) as client:
            resp = client.post("/internal/subscriptions/issue-renewals",
                               headers={"x-internal-token": "tok"})
        assert resp.json()["issued"] == []
        assert db.get(Subscription, sub.id).status == "active"
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_issue_renewals_exige_le_jeton_interne(monkeypatch, tmp_path):
    from datetime import datetime
    db, _ = _renewal_env(monkeypatch, tmp_path, status="active", end_date=datetime.utcnow())
    try:
        with TestClient(app) as client:
            assert client.post("/internal/subscriptions/issue-renewals").status_code == 403
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_due_reminders_porte_l_echeance_de_grace(monkeypatch, tmp_path):
    """La dernière relance doit pouvoir annoncer la date de réduction d'accès."""
    from datetime import datetime, timedelta

    from app.models import Invoice
    grace = datetime.utcnow() + timedelta(days=7)
    db, sub = _renewal_env(monkeypatch, tmp_path, status="past_due", grace_until=grace)
    db.add(Invoice(reference="INV-TEST-001", subscription_id=sub.id, agency_id=50, amount=499,
                   status="unpaid", issued_at=datetime.utcnow() - timedelta(days=4)))
    db.commit()
    try:
        with TestClient(app) as client:
            invs = client.get("/internal/invoices/due-reminders",
                              headers={"x-internal-token": "tok"}).json()["invoices"]
        assert invs[0]["grace_until"] == grace.isoformat()
    finally:
        app.dependency_overrides.clear()
        db.close()
```

- [ ] **Step 2: Constater l'échec**

Run: `cd services/billing && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider tests/test_entitlements.py -k "issue_renewals or due_reminders"`
Expected: FAIL — 404/405 sur `/internal/subscriptions/issue-renewals`, `KeyError: 'grace_until'`.

- [ ] **Step 3: Référence de facture partagée** — dans `services/billing/app/main.py`, juste après `_MAX_REMINDERS = 3`, ajouter :

```python
# Délai de grâce d'un renouvellement impayé : l'accès est réduit un intervalle après la dernière
# relance, pour que celle-ci puisse annoncer la date au lieu de coïncider avec elle (3 + 3 × 7 j).
_GRACE_DAYS = _FIRST_REMINDER_DAYS + _MAX_REMINDERS * _REMINDER_INTERVAL_DAYS


def _next_invoice_reference(db: Session, now: datetime) -> str:
    count = db.query(Invoice).filter(extract("year", Invoice.issued_at) == now.year).count()
    return f"INV-{now.year}-{str(count + 1).zfill(3)}"
```

Dans `change_plan`, remplacer :

```python
    count = db.query(Invoice).filter(extract("year", Invoice.issued_at) == now.year).count()
    invoice = Invoice(reference=f"INV-{now.year}-{str(count + 1).zfill(3)}",
```

par :

```python
    invoice = Invoice(reference=_next_invoice_reference(db, now),
```

et remplacer son `enqueue(db, "invoice", invoice.id, events.INVOICE_CREATED, {...})` par :

```python
    enqueue(db, "invoice", invoice.id, events.INVOICE_CREATED, {
        "invoice_id": invoice.id, "agency_id": principal.agency_id, "amount": float(amount),
        "plan": plan.slug, "purpose": "subscription", "reference": invoice.reference,
        "period_label": invoice.period_label, "renewal": False, "grace_until": None,
    })
```

- [ ] **Step 4: Échéance dans les relances** — dans `internal_invoices_due_reminders`, remplacer le bloc `if due: out.append({...})` par :

```python
        if due:
            sub = db.get(Subscription, inv.subscription_id) if inv.subscription_id else None
            out.append({"id": inv.id, "reference": inv.reference, "agency_id": inv.agency_id,
                        "amount": float(inv.amount or 0), "period_label": inv.period_label,
                        "issued_at": iso(inv.issued_at), "reminder_count": count,
                        "grace_until": iso(sub.grace_until) if sub else None})
```

- [ ] **Step 5: Endpoint d'émission** — ajouter après `internal_invoice_reminder_sent` :

```python
@app.post("/internal/subscriptions/issue-renewals", include_in_schema=False)
def internal_issue_renewals(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Émet la facture de renouvellement des abonnements échus — réveillé par l'ordonnanceur
    notification. Sans cet appel, une échéance passait sans qu'aucun paiement ne soit jamais
    redemandé : seul `change_plan` créait une facture d'abonnement. POST : la mutation
    appartient à billing, l'ordonnanceur ne fait que la déclencher."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    now = datetime.utcnow()
    # I4 : une facture d'abonnement encore impayée exclut toute seconde émission.
    open_subs = {sid for (sid,) in db.query(Invoice.subscription_id)
                 .filter(Invoice.status == "unpaid", Invoice.invoice_type == "subscription")}
    issued = []
    for sub in db.query(Subscription).filter(Subscription.status == "active",
                                              Subscription.end_date <= now).all():
        if sub.id in open_subs:
            continue
        plan = db.get(SubscriptionPlan, sub.plan_id)
        invoice = Invoice(reference=_next_invoice_reference(db, now), subscription_id=sub.id,
                          agency_id=sub.agency_id, amount=sub.amount, status="unpaid",
                          period_label=f"{_MONTHS[now.month - 1]} {now.year}", issued_at=now)
        db.add(invoice)
        db.flush()
        sub.status = "past_due"
        sub.grace_until = now + timedelta(days=_GRACE_DAYS)
        enqueue(db, "invoice", invoice.id, events.INVOICE_CREATED, {
            "invoice_id": invoice.id, "agency_id": sub.agency_id, "amount": float(sub.amount),
            "plan": plan.slug if plan else None, "purpose": "subscription",
            "reference": invoice.reference, "period_label": invoice.period_label,
            "renewal": True, "grace_until": iso(sub.grace_until)})
        # Droits inchangés pendant la grâce, mais leur terme est désormais connu d'identity.
        enqueue(db, "subscription", sub.id, events.SUBSCRIPTION_ACTIVATED, {
            "subscription_id": sub.id, "agency_id": sub.agency_id,
            "features": plan_features(plan) if plan else [],
            "features_until": iso(_features_until(sub))})
        issued.append({"subscription_id": sub.id, "invoice_id": invoice.id,
                       "agency_id": sub.agency_id})
    db.commit()
    return {"issued": issued}
```

- [ ] **Step 6: Vérifier**

Run: `cd services/billing && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider` et `python3 -m ruff check services/billing` depuis la racine.
Expected: tout vert.

- [ ] **Step 7: Commit**

```bash
git add services/billing/app/main.py services/billing/tests/test_entitlements.py
git commit -m "feat(billing): émettre la facture de renouvellement à l'échéance"
```

---

### Task 3: billing worker — consigner l'échec, rétablir sur paiement

**Files:**
- Modify: `services/billing/app/worker.py` (`_handle`, `_create_or_extend`, bindings dans `main`)
- Test: `services/billing/tests/test_worker_entitlements.py`

**Interfaces:**
- Consumes: statuts `past_due`, `restricted`, colonnes de Task 1. Événement `payment.failed` (Task 4) : `{payment_id, agency_id, user_id, purpose, reason_code, reason_label}`.
- Produces: rien de nouveau pour les tâches suivantes.

- [ ] **Step 1: Écrire les tests qui échouent** — ajouter à la fin de `services/billing/tests/test_worker_entitlements.py` :

```python
def test_payment_failed_consigne_sans_changer_le_statut(monkeypatch):
    """I1 : un paiement qui échoue n'est pas une résiliation."""
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    sub = Subscription(agency_id=5, plan_id=plan.id, amount=499, status="past_due")
    s.add(sub)
    s.commit()

    _handle("payment.failed", {"purpose": "subscription", "agency_id": 5,
                               "reason_code": "card_declined", "reason_label": "Carte refusée"},
            "m:failed:1")

    stored = s.get(Subscription, sub.id)
    assert stored.status == "past_due"
    assert stored.last_payment_failure_reason == "Carte refusée"
    assert stored.last_payment_failure_at is not None


def test_payment_failed_sans_libelle_ne_stocke_aucun_code_technique(monkeypatch):
    """La passerelle simulée n'envoie que `reason_code: unknown` : ce code ne doit jamais
    finir affiché à l'agence."""
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    sub = Subscription(agency_id=6, plan_id=plan.id, amount=499, status="active")
    s.add(sub)
    s.commit()

    _handle("payment.failed", {"purpose": "subscription", "agency_id": 6,
                               "reason_code": "unknown", "reason_label": None}, "m:failed:2")

    stored = s.get(Subscription, sub.id)
    assert stored.last_payment_failure_at is not None
    assert stored.last_payment_failure_reason is None


def test_payment_completed_en_acces_reduit_prolonge_la_meme_ligne_depuis_aujourdhui(monkeypatch):
    """I5 : payer en `restricted` rétablit l'abonnement existant, sans seconde ligne, et la
    nouvelle période commence maintenant — pas à une échéance vieille de plusieurs semaines."""
    from datetime import datetime, timedelta

    from app.models import Invoice
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    sub = Subscription(agency_id=7, plan_id=plan.id, amount=499, status="restricted",
                       end_date=datetime.utcnow() - timedelta(days=40),
                       grace_until=datetime.utcnow() - timedelta(days=16))
    s.add(sub)
    s.commit()
    s.add(Invoice(reference="INV-R-1", subscription_id=sub.id, agency_id=7, amount=499,
                  status="unpaid"))
    s.commit()

    _handle("payment.completed", {"purpose": "subscription", "agency_id": 7, "plan_id": plan.id,
                                  "billing_cycle": "monthly", "amount": 499}, "m:paid:1")

    assert s.query(Subscription).filter_by(agency_id=7).count() == 1
    stored = s.get(Subscription, sub.id)
    assert stored.status == "active"
    assert stored.grace_until is None
    assert stored.end_date > datetime.utcnow() + timedelta(days=29)
    assert s.query(Invoice).filter_by(subscription_id=sub.id).one().status == "paid"
    assert _last_outbox_payload(s)["features_until"] is None


def test_payment_completed_pendant_la_grace_prolonge_depuis_l_echeance(monkeypatch):
    """Payé dans la grâce : la période repart de l'ancienne échéance — aucun jour offert ni perdu."""
    from datetime import datetime, timedelta
    s = _session(monkeypatch)
    plan = _pro_plan(s)
    old_end = datetime.utcnow() - timedelta(days=5)
    sub = Subscription(agency_id=8, plan_id=plan.id, amount=499, status="past_due",
                       end_date=old_end, grace_until=datetime.utcnow() + timedelta(days=19))
    s.add(sub)
    s.commit()

    _handle("payment.completed", {"purpose": "subscription", "agency_id": 8, "plan_id": plan.id,
                                  "billing_cycle": "monthly", "amount": 499}, "m:paid:2")

    stored = s.get(Subscription, sub.id)
    assert stored.status == "active"
    assert stored.end_date == old_end + timedelta(days=30)
```

- [ ] **Step 2: Constater l'échec**

Run: `cd services/billing && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider tests/test_worker_entitlements.py`
Expected: FAIL — motif `None` sur le premier test ; deux lignes d'abonnement sur le troisième.

- [ ] **Step 3: Consigner l'échec** — dans `services/billing/app/worker.py`, dans `_handle`, remplacer :

```python
            elif routing_key == "payment.completed":
                _create_or_extend(db, payload, agency_id)
```

par :

```python
            elif routing_key == "payment.completed":
                _create_or_extend(db, payload, agency_id)
            elif routing_key == "payment.failed":
                _record_failure(db, payload, agency_id)
```

Ajouter avant `_create_or_extend` :

```python
def _record_failure(db, payload, agency_id) -> None:
    """Consigne l'échec sur l'abonnement courant SANS changer son statut : un paiement qui échoue
    n'est pas une résiliation (I1). La facture reste impayée et la grâce continue de courir.
    Seul le libellé de la passerelle est gardé : il est montré tel quel à l'agence, ce qu'un
    code technique (`unknown`) ne doit jamais être."""
    sub = (db.query(Subscription).filter(Subscription.agency_id == agency_id)
           .order_by(Subscription.id.desc()).first())
    if sub is None:
        return
    sub.last_payment_failure_at = datetime.utcnow()
    label = payload.get("reason_label")
    sub.last_payment_failure_reason = str(label)[:255] if label else None
```

- [ ] **Step 4: Rétablir sur paiement** — dans `_create_or_extend`, remplacer :

```python
    sub = (db.query(Subscription)
           .filter(Subscription.agency_id == agency_id, Subscription.status == "active").first())
    if sub is not None:
        sub.end_date = (sub.end_date or now) + timedelta(days=days)
        plan_id = sub.plan_id
```

par :

```python
    sub = (db.query(Subscription)
           .filter(Subscription.agency_id == agency_id,
                   Subscription.status.in_(("active", "past_due", "restricted")))
           .order_by(Subscription.id.desc()).first())
    if sub is not None:
        # Payé en accès réduit : la période repart d'aujourd'hui, sinon une longue réduction
        # donnerait une période déjà échue et une nouvelle facture partirait aussitôt. Sinon elle
        # repart de l'échéance : aucun jour offert ni perdu (I5).
        start = now if sub.status == "restricted" else (sub.end_date or now)
        sub.end_date = start + timedelta(days=days)
        sub.status = "active"
        sub.grace_until = None
        for inv in db.query(Invoice).filter(Invoice.subscription_id == sub.id,
                                            Invoice.status == "unpaid"):
            inv.status = "paid"
            inv.paid_at = now
        plan_id = sub.plan_id
```

Dans `main()`, remplacer `bindings=["payment.released", "payment.completed", "commission.due"],` par :

```python
        bindings=["payment.released", "payment.completed", "payment.failed", "commission.due"],
```

- [ ] **Step 5: Vérifier**

Run: `cd services/billing && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider` et `python3 -m ruff check services/billing`.
Expected: tout vert.

- [ ] **Step 6: Commit**

```bash
git add services/billing/app/worker.py services/billing/tests/test_worker_entitlements.py
git commit -m "feat(billing): consigner l'échec de paiement et rétablir l'abonnement payé"
```

---

### Task 4: payment — émettre `payment.failed`

**Files:**
- Modify: `services/payment/app/events.py`, `services/payment/app/main.py` (`payment_webhook`)
- Test: `services/payment/tests/test_payment.py`

**Interfaces:**
- Produces: `events.PAYMENT_FAILED = "payment.failed"`, payload `{payment_id: int, agency_id: int | None, user_id: int | None, purpose: str, reason_code: str, reason_label: str | None}`.

- [ ] **Step 1: Écrire le test qui échoue** — ajouter à `services/payment/tests/test_payment.py` (fixtures `client` et `db_session` de `conftest.py`) :

```python
def test_webhook_echec_emet_payment_failed_une_seule_fois(client, db_session):
    """Un échec de paiement n'émettait rien : ni billing ni l'agence n'en apprenaient
    l'existence. Rejoué, il ne doit pas être émis deux fois."""
    from semsar_events import OutboxEvent

    from app.models import Payment
    db_session.add(Payment(reference="PAY-FAIL-1", payment_type="subscription", amount=499,
                           agency_id=12, user_id=3, status="pending"))
    db_session.commit()

    body = {"reference": "PAY-FAIL-1", "status": "failed", "reason_code": "card_declined",
            "reason": "Carte refusée par la banque"}
    assert client.post("/payments/webhook", json=body).status_code == 200
    assert client.post("/payments/webhook", json=body).status_code == 200

    events = db_session.query(OutboxEvent).filter_by(event_type="payment.failed").all()
    assert len(events) == 1
    payload = events[0].payload
    assert payload["agency_id"] == 12 and payload["user_id"] == 3
    assert payload["purpose"] == "subscription"
    assert payload["reason_code"] == "card_declined"
    assert payload["reason_label"] == "Carte refusée par la banque"


def test_webhook_echec_sans_motif_donne_unknown(client, db_session):
    """La passerelle simulée ne fournit pas de motif."""
    from semsar_events import OutboxEvent

    from app.models import Payment
    db_session.add(Payment(reference="PAY-FAIL-2", payment_type="subscription", amount=499,
                           agency_id=13, status="pending"))
    db_session.commit()

    client.post("/payments/webhook", json={"reference": "PAY-FAIL-2", "status": "failed"})

    payload = db_session.query(OutboxEvent).filter_by(event_type="payment.failed").one().payload
    assert payload["reason_code"] == "unknown"
    assert payload["reason_label"] is None
```

- [ ] **Step 2: Constater l'échec**

Run: `cd services/payment && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider tests/test_payment.py -k echec`
Expected: FAIL — `assert 0 == 1` (aucun événement).

- [ ] **Step 3: Implémenter** — dans `services/payment/app/events.py`, ajouter :

```python
PAYMENT_FAILED = "payment.failed"        # échec passerelle (webhook) → billing consigne, notification prévient
```

Dans `services/payment/app/main.py`, `payment_webhook`, remplacer :

```python
    elif status == "failed":
        p.status = "failed"
        db.commit()
```

par :

```python
    elif status == "failed":
        p.status = "failed"
        # Un échec n'émettait rien : ni billing ni l'agence n'en apprenaient l'existence. La
        # passerelle simulée ne fournit pas de motif ; le câblage le porte déjà pour l'intégration
        # CMI réelle. `failed` est terminal (`_TERMINAL`) : un webhook rejoué n'émet pas deux fois.
        enqueue(db, "payment", p.id, events.PAYMENT_FAILED, {
            "payment_id": p.id, "agency_id": p.agency_id, "user_id": p.user_id,
            "purpose": p.payment_type,
            "reason_code": str(data.get("reason_code") or "unknown")[:50],
            "reason_label": str(data["reason"])[:255] if data.get("reason") else None})
        db.commit()
```

- [ ] **Step 4: Vérifier**

Run: `cd services/payment && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider` et `python3 -m ruff check services/payment`.
Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add services/payment/app/events.py services/payment/app/main.py services/payment/tests/test_payment.py
git commit -m "feat(payment): signaler l'échec d'un paiement au reste du système"
```

---

### Task 5: notification — horloge du renouvellement et courriels

**Files:**
- Modify: `services/notification/app/scheduler.py` (nouveau job, `run_once`, `_job_unpaid_invoice_reminders`)
- Modify: `services/notification/app/worker.py` (bindings)
- Modify: `services/notification/app/handlers.py` (`handle_event`, deux handlers)
- Create: `services/notification/app/templates/invoice_issued.html`, `services/notification/app/templates/payment_failed.html`
- Modify: `services/notification/app/templates/invoice_reminder.html`
- Test: `services/notification/tests/test_notification.py`

**Interfaces:**
- Consumes: `POST /internal/subscriptions/issue-renewals` et `grace_until` des relances (Task 2) ; `billing.invoice.created` (Task 2) ; `payment.failed` (Task 4).
- Produces: `_job_subscription_renewals() -> int`, `_handle_invoice_created(db, payload)`, `_handle_payment_failed(db, payload)`.

- [ ] **Step 1: Écrire les tests qui échouent** — ajouter à `services/notification/tests/test_notification.py` :

```python
def test_job_renouvellement_reveille_billing(monkeypatch):
    import httpx

    from app import scheduler

    calls = []

    class _Resp:
        status_code = 200

        def json(self):
            return {"issued": [{"subscription_id": 1}, {"subscription_id": 2}]}

    def fake_post(url, **kw):
        calls.append(url)
        return _Resp()

    monkeypatch.setattr(httpx, "post", fake_post)
    assert scheduler._job_subscription_renewals() == 2
    assert calls[0].endswith("/internal/subscriptions/issue-renewals")


def test_job_renouvellement_ne_leve_pas_si_billing_est_absent(monkeypatch):
    import httpx

    from app import scheduler

    def boom(url, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)
    assert scheduler._job_subscription_renewals() == 0


def _capture_sends(monkeypatch):
    from app import handlers, recipients
    sent = []
    monkeypatch.setattr(recipients, "agency",
                        lambda agency_id: {"email": "agence@example.test", "name": "Agence Test"})
    monkeypatch.setattr(handlers, "_try_send",
                        lambda db, to, template, log_name, **ctx: sent.append((to, template, ctx)))
    return sent


def test_facture_emise_annoncee_a_l_agence(monkeypatch):
    from app import handlers
    sent = _capture_sends(monkeypatch)
    handlers._handle_invoice_created(None, {"purpose": "subscription", "agency_id": 4,
                                            "reference": "INV-2026-010", "amount": 499.0,
                                            "period_label": "Septembre 2026", "renewal": True,
                                            "grace_until": "2026-10-05T10:00:00"})
    assert [(to, tpl) for to, tpl, _ in sent] == [("agence@example.test", "invoice_issued.html")]


def test_facture_de_commission_ignoree(monkeypatch):
    from app import handlers
    sent = _capture_sends(monkeypatch)
    handlers._handle_invoice_created(None, {"purpose": "commission", "account_id": 9})
    assert sent == []


def test_echec_de_paiement_annonce_a_l_agence(monkeypatch):
    from app import handlers
    sent = _capture_sends(monkeypatch)
    handlers._handle_payment_failed(None, {"purpose": "subscription", "agency_id": 4,
                                           "reason_code": "card_declined",
                                           "reason_label": "Carte refusée"})
    assert sent[0][1] == "payment_failed.html"
    assert sent[0][2]["reason_label"] == "Carte refusée"


def test_gabarits_pointent_vers_la_page_d_abonnement_reelle():
    """`/backoffice/abonnement` n'existe pas dans le routeur frontend : les relances envoyaient
    vers une page introuvable. La page d'abonnement est `/dashboard/compte/abonnement`."""
    from app import render
    for template, ctx in (
        ("invoice_reminder.html", {"reference": "INV-1", "amount": 499, "reminder_count": 2,
                                   "grace_until": "5 octobre 2026"}),
        ("invoice_issued.html", {"reference": "INV-1", "amount": 499, "renewal": True,
                                 "grace_until": "5 octobre 2026"}),
        ("payment_failed.html", {"reason_label": None}),
    ):
        _, html, _ = render.render_email(template, **ctx)
        assert "/dashboard/compte/abonnement" in html
        assert "/backoffice/abonnement" not in html
```

- [ ] **Step 2: Constater l'échec**

Run: `cd services/notification && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider tests/test_notification.py`
Expected: FAIL — `AttributeError: module 'app.scheduler' has no attribute '_job_subscription_renewals'`, gabarits introuvables.

- [ ] **Step 3: Job d'horloge** — dans `services/notification/app/scheduler.py`, ajouter avant `_job_unpaid_invoice_reminders` :

```python
def _job_subscription_renewals() -> int:
    """Réveille billing pour qu'il émette les factures de renouvellement échues. La logique est
    chez billing, propriétaire des abonnements ; les courriels partent sur l'événement
    `billing.invoice.created` qu'il publie, pas d'ici."""
    try:
        r = httpx.post(f"{_billing()}/internal/subscriptions/issue-renewals",
                       headers=_headers(), timeout=10.0)
        return len(r.json().get("issued", [])) if r.status_code == 200 else 0
    except (httpx.HTTPError, ValueError):
        return 0
```

Dans `run_once`, juste avant `i = _job_unpaid_invoice_reminders(db)`, ajouter :

```python
        rn = _job_subscription_renewals()
        if rn:
            logger.info("factures de renouvellement émises", extra={"count": rn})
```

Dans `_job_unpaid_invoice_reminders`, remplacer l'appel `_try_send(db, to, "invoice_reminder.html", ...)` par :

```python
            _try_send(db, to, "invoice_reminder.html", "invoice_reminder", from_email=_contact(),
                      agency_name=agency.get("name"), reference=inv.get("reference"),
                      amount=inv.get("amount"), period_label=inv.get("period_label"),
                      reminder_count=inv.get("reminder_count", 0),
                      grace_until=_fmt_fr(inv.get("grace_until"))[0] or None)
```

- [ ] **Step 4: Handlers** — dans `services/notification/app/handlers.py`, dans `handle_event`, ajouter à la chaîne de `elif` :

```python
        elif routing_key == "billing.invoice.created":
            _handle_invoice_created(db, payload)
        elif routing_key == "payment.failed":
            _handle_payment_failed(db, payload)
```

Ajouter avant `handle_event` :

```python
def _handle_invoice_created(db, payload: dict) -> None:
    """`billing.invoice.created` : annonce à l'agence la facture d'abonnement à régler. Publié de
    longue date, l'événement n'était consommé par personne. Les factures de commission (compte
    particulier, sans agence) ne sont pas concernées."""
    if payload.get("purpose") != "subscription" or not payload.get("agency_id"):
        return
    agency = recipients.agency(payload["agency_id"])
    to = (agency.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "invoice_issued.html", "invoice_issued", from_email=_contact(),
              agency_name=agency.get("name"), reference=payload.get("reference"),
              amount=payload.get("amount"), period_label=payload.get("period_label"),
              renewal=bool(payload.get("renewal")),
              grace_until=_fmt_fr(payload.get("grace_until"))[0] or None)


def _handle_payment_failed(db, payload: dict) -> None:
    """`payment.failed` : dit à l'agence que son paiement n'a pas abouti, et quoi faire."""
    if payload.get("purpose") != "subscription" or not payload.get("agency_id"):
        return
    agency = recipients.agency(payload["agency_id"])
    to = (agency.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "payment_failed.html", "payment_failed", from_email=_contact(),
              agency_name=agency.get("name"), reason_label=payload.get("reason_label"))
```

Dans `services/notification/app/worker.py`, ajouter `"billing.invoice.created", "payment.failed"` en fin de liste `bindings=[...]`.

- [ ] **Step 5: Gabarits** — dans `invoice_reminder.html` : remplacer `app.base_url ~ "/backoffice/abonnement"` par `app.base_url ~ "/dashboard/compte/abonnement"` ; remplacer la ligne `{% block hero_title %}…{% endblock %}` par :

```jinja
{% block hero_title %}{% if final %}Dernier rappel avant réduction de votre accès{% else %}Votre facture est en attente{% endif %}{% endblock %}
```

et, dans le paragraphe du `content`, remplacer `{% if final %}<strong>éviter la suspension de votre abonnement et de vos annonces</strong>{% else %}` par :

```jinja
{% if final %}<strong>éviter que votre accès soit réduit à la facturation{% if grace_until %} le {{ grace_until }}{% endif %}</strong>{% else %}
```

Créer `services/notification/app/templates/invoice_issued.html` :

```jinja
{% extends "base.html" %}
{% from "_components.html" import button, card, lucide with context %}
{% block subject %}Votre facture {{ reference }} est disponible{% endblock %}
{% block preheader %}{% if renewal %}Votre abonnement SemsarOut arrive à échéance : réglez-le pour le prolonger.{% else %}Votre nouvelle facture SemsarOut est disponible.{% endif %}{% endblock %}
{% block badge %}{{ lucide("credit-card") }}{% endblock %}
{% block hero_title %}{% if renewal %}Votre abonnement arrive à échéance{% else %}Votre facture est disponible{% endif %}{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if agency_name %} {{ agency_name }}{% endif %}.</p>{% endblock %}
{% block content %}
<p style="text-align:left; color:{{ brand.ink }};">{% if renewal %}Pour prolonger votre abonnement, merci de régler la facture ci-dessous. Votre accès reste entier{% if grace_until %} jusqu'au {{ grace_until }}{% endif %} ; passé ce délai sans règlement, il sera réduit à la facturation.{% else %}Merci de régler la facture ci-dessous pour activer votre abonnement.{% endif %}</p>
{{ card(
  [("Référence", reference)]
  + ([("Période", period_label)] if period_label else [])
  + [("Montant dû", "{:,.0f}".format(amount|float).replace(",", " ") ~ " " ~ currency)]) }}
<table role="presentation" width="100%"><tr><td align="center">{{ button(app.base_url ~ "/dashboard/compte/abonnement", "Régler ma facture") }}</td></tr></table>
<p style="margin-top:22px; font-size:13px; color:{{ brand.muted }}; text-align:left;">Une question sur votre facturation&nbsp;? Écrivez-nous à <a href="mailto:contact@semsarout.com" style="color:{{ brand.gold_dark }};">contact@semsarout.com</a>.</p>
{% endblock %}
```

Créer `services/notification/app/templates/payment_failed.html` :

```jinja
{% extends "base.html" %}
{% from "_components.html" import button, lucide with context %}
{% block subject %}Votre paiement SemsarOut n'a pas abouti{% endblock %}
{% block preheader %}Votre abonnement reste actif pour l'instant : réessayez ou corrigez votre moyen de paiement.{% endblock %}
{% block badge %}{{ lucide("credit-card") }}{% endblock %}
{% block hero_title %}Votre paiement n'a pas abouti{% endblock %}
{% block hero_subtitle %}<p style="margin-top:8px; font-size:14px; color:{{ brand.muted }};">Bonjour{% if agency_name %} {{ agency_name }}{% endif %}.</p>{% endblock %}
{% block content %}
<p style="text-align:left; color:{{ brand.ink }};">{% if reason_label %}Votre banque a indiqué : <strong>{{ reason_label }}</strong>.{% else %}Votre dernier paiement n'a pas pu être finalisé.{% endif %}</p>
<p style="text-align:left; color:{{ brand.ink }};">Vérifiez les informations de votre carte, sa date d'expiration et son plafond, ou contactez votre banque si une autorisation a été refusée. Vous pouvez ensuite réessayer depuis votre espace.</p>
<table role="presentation" width="100%"><tr><td align="center">{{ button(app.base_url ~ "/dashboard/compte/abonnement", "Réessayer le paiement") }}</td></tr></table>
{% endblock %}
```

- [ ] **Step 6: Vérifier**

Run: `cd services/notification && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider` et `python3 -m ruff check services/notification`.
Expected: tout vert. Si `render.render_email` exige une variable absente du contexte d'un test (par exemple `period_label`), l'ajouter au contexte du test plutôt que d'ajouter un défaut au gabarit.

- [ ] **Step 7: Commit**

```bash
git add services/notification/app/scheduler.py services/notification/app/worker.py services/notification/app/handlers.py services/notification/app/templates/invoice_issued.html services/notification/app/templates/payment_failed.html services/notification/app/templates/invoice_reminder.html services/notification/tests/test_notification.py
git commit -m "feat(notification): réveiller le renouvellement et prévenir l'agence d'un échec"
```

---

### Task 6: superadmin — voir les impayés

**Files:**
- Modify: `services/billing/app/main.py` (`internal_subscriptions`, `internal_subscriptions_stats`)
- Modify: `services/analytics/app/main.py` (vue d'ensemble, `admin_accounts`)
- Modify: `frontend/src/pages/admin/AdminOverview.jsx`, `frontend/src/pages/admin/AdminAccounts.jsx`
- Modify: `frontend/src/locales/fr/admin.json`, `frontend/src/locales/ar/admin.json`
- Test: `services/billing/tests/test_entitlements.py`, `services/analytics/tests/test_admin_accounts.py`
- Create: `frontend/src/pages/admin/AdminOverview.test.jsx`

**Interfaces:**
- Consumes: statuts `past_due` / `restricted` (Task 1).
- Produces: `/internal/subscriptions/stats` → `unpaid_subscriptions: {"past_due": int, "restricted": int}` ; vue d'ensemble admin → même clé ; lignes agence de `/admin/accounts` → `billing_status: str | None`, filtre `?billing_status=`.

- [ ] **Step 1: Tests qui échouent (backend)** — ajouter à `services/billing/tests/test_entitlements.py` :

```python
def test_stats_comptent_les_impayes(monkeypatch, tmp_path):
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan()
    db.add(plan)
    db.commit()
    for aid, st in ((60, "past_due"), (61, "past_due"), (62, "restricted"), (63, "active")):
        db.add(Subscription(agency_id=aid, plan_id=plan.id, amount=499, status=st))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            stats = client.get("/internal/subscriptions/stats",
                               headers={"x-internal-token": "tok"}).json()
        assert stats["unpaid_subscriptions"] == {"past_due": 2, "restricted": 1}
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_internal_subscriptions_garde_la_ligne_la_plus_recente(monkeypatch, tmp_path):
    """Une agence résiliée puis réabonnée porte deux lignes : l'administration doit voir le
    statut courant, pas celui d'une ligne périmée (même critère que `_agency_sub`)."""
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan()
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=70, plan_id=plan.id, amount=499, status="cancelled"))
    db.commit()
    db.add(Subscription(agency_id=70, plan_id=plan.id, amount=499, status="past_due"))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            row = client.get("/internal/subscriptions",
                             headers={"x-internal-token": "tok"}).json()["subscriptions"]["70"]
        assert row["status"] == "past_due"
    finally:
        app.dependency_overrides.clear()
        db.close()
```

Ajouter à `services/analytics/tests/test_admin_accounts.py` :

```python
def test_admin_accounts_expose_et_filtre_le_statut_de_facturation(monkeypatch):
    import app.sources as sources
    monkeypatch.setattr(sources, "users_list", lambda tenant=None: [])
    monkeypatch.setattr(sources, "property_counts", lambda: {})
    monkeypatch.setattr(sources, "agencies_list", lambda: [
        {"id": 1, "name": "Agence A", "email": "a@example.test", "status": "active"},
        {"id": 2, "name": "Agence B", "email": "b@example.test", "status": "active"}])
    monkeypatch.setattr(sources, "subscriptions_map", lambda: {
        "1": {"status": "restricted", "plan": {"slug": "pro"}},
        "2": {"status": "active", "plan": {"slug": "pro"}}})

    with TestClient(app) as client:
        resp = client.get("/admin/accounts", params={"type": "agency", "billing_status": "restricted"},
                          headers=_superadmin_headers())
    items = resp.json()["items"]
    assert [i["name"] for i in items] == ["Agence A"]
    assert items[0]["billing_status"] == "restricted"


def test_admin_overview_expose_les_impayes(monkeypatch):
    import app.sources as sources
    monkeypatch.setattr(sources, "users_stats", lambda: {})
    monkeypatch.setattr(sources, "agencies_stats", lambda: {})
    monkeypatch.setattr(sources, "subscriptions_stats",
                        lambda: {"unpaid_subscriptions": {"past_due": 3, "restricted": 1}})
    with TestClient(app) as client:
        body = client.get("/admin/overview", headers=_superadmin_headers()).json()
    assert body["unpaid_subscriptions"] == {"past_due": 3, "restricted": 1}
```

La route de la vue d'ensemble est celle dont la fonction appelle `sources.subscriptions_stats()` dans `services/analytics/app/main.py` ; si son chemin n'est pas `/admin/overview`, utiliser le chemin réel dans le test.

- [ ] **Step 2: Constater l'échec**

Run: `cd services/billing && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider tests/test_entitlements.py -k "impayes or plus_recente"` puis `cd services/analytics && OTEL_SDK_DISABLED=true python3 -m pytest -q -p no:cacheprovider tests/test_admin_accounts.py -k "facturation or impayes"`
Expected: FAIL — `KeyError: 'unpaid_subscriptions'`, `KeyError: 'billing_status'`.

- [ ] **Step 3: billing** — dans `internal_subscriptions`, remplacer `subs = db.query(Subscription).all()` par :

```python
    # Plus récente d'abord : `setdefault` garde ainsi la ligne courante d'une agence qui en
    # porte plusieurs (résiliation puis réabonnement), comme `_agency_sub`.
    subs = db.query(Subscription).order_by(Subscription.id.desc()).all()
```

Dans `internal_subscriptions_stats`, remplacer la ligne `return {"active_subscriptions": by_plan, "mrr_estimate": round(mrr, 2)}` par :

```python
    unpaid = {st: db.query(Subscription).filter(Subscription.status == st).count()
              for st in ("past_due", "restricted")}
    return {"active_subscriptions": by_plan, "mrr_estimate": round(mrr, 2),
            "unpaid_subscriptions": unpaid}
```

- [ ] **Step 4: analytics** — dans la fonction de vue d'ensemble (celle qui retourne `"active_subscriptions": sub.get("active_subscriptions", {})`), ajouter la clé :

```python
        "unpaid_subscriptions": sub.get("unpaid_subscriptions", {"past_due": 0, "restricted": 0}),
```

Dans `admin_accounts` : dans le `rows.append` des utilisateurs, ajouter `"billing_status": None,` ; dans le `rows.append` des agences, ajouter `"billing_status": (sub or {}).get("status"),`. Après le bloc `if qp.get("plan"): ...`, ajouter :

```python
    if qp.get("billing_status"):
        rows = [r for r in rows if r.get("billing_status") == qp.get("billing_status")]
```

- [ ] **Step 5: Test frontend qui échoue** — créer `frontend/src/pages/admin/AdminOverview.test.jsx` :

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import AdminOverview from './AdminOverview'
import { adminService } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({ adminService: { getOverview: vi.fn() } }))

describe('AdminOverview — impayés', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('montre les abonnements en grâce et en accès réduit', async () => {
    adminService.getOverview.mockResolvedValue({
      active_subscriptions: {}, unpaid_subscriptions: { past_due: 3, restricted: 1 },
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><AdminOverview /></QueryClientProvider>)
    expect(await screen.findByText('Impayés en grâce')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Accès réduits')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
```

Run: `cd frontend && npx vitest run src/pages/admin/AdminOverview.test.jsx`
Expected: FAIL — `Unable to find an element with the text: Impayés en grâce`.

- [ ] **Step 6: Frontend** — dans `AdminOverview.jsx`, après `<Kpi label={t('admin:overview.kpi.pendingPurge')} … />`, ajouter :

```jsx
        <Kpi label={t('admin:overview.kpi.pastDue')} value={d.unpaid_subscriptions?.past_due ?? 0} />
        <Kpi label={t('admin:overview.kpi.restricted')} value={d.unpaid_subscriptions?.restricted ?? 0} />
```

Dans `AdminAccounts.jsx` : ajouter `const [billingStatus, setBillingStatus] = useState('')` à côté de `const [status, setStatus] = useState('')` ; ajouter `billing_status: billingStatus` dans l'objet de la clé de requête et dans l'objet passé à `adminService.getAccounts(...)` ; ajouter, juste après le `<select>` du statut, un `<select>` avec la même `className` que lui :

```jsx
        <select value={billingStatus} onChange={(e) => setBillingStatus(e.target.value)}>
          <option value="">{t('admin:accounts.filterBilling.all')}</option>
          <option value="past_due">{t('admin:accounts.filterBilling.past_due')}</option>
          <option value="restricted">{t('admin:accounts.filterBilling.restricted')}</option>
        </select>
```

Dans la cellule de statut de chaque ligne, après le `<span>` du badge existant, ajouter :

```jsx
                    {(it.billing_status === 'past_due' || it.billing_status === 'restricted') && (
                      <span className="ms-2 text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                        {t(`admin:accounts.filterBilling.${it.billing_status}`)}
                      </span>
                    )}
```

Clés i18n — `frontend/src/locales/fr/admin.json` : sous `overview.kpi`, `"pastDue": "Impayés en grâce"` et `"restricted": "Accès réduits"` ; sous `accounts`, `"filterBilling": {"all": "Toutes facturations", "past_due": "Impayé (en grâce)", "restricted": "Accès réduit"}`. `frontend/src/locales/ar/admin.json` : sous `overview.kpi`, `"pastDue": "مستحقات غير مدفوعة (مهلة)"` et `"restricted": "وصول مقيَّد"` ; sous `accounts`, `"filterBilling": {"all": "كل حالات الفوترة", "past_due": "غير مدفوع (ضمن المهلة)", "restricted": "وصول مقيَّد"}`.

- [ ] **Step 7: Vérifier**

Run: billing + analytics `pytest` complets, `python3 -m ruff check services/billing services/analytics` ; `cd frontend && npx vitest run && npx eslint src --max-warnings=0`.
Expected: tout vert.

- [ ] **Step 8: Commit**

```bash
git add services/billing/app/main.py services/billing/tests/test_entitlements.py services/analytics/app/main.py services/analytics/tests/test_admin_accounts.py frontend/src/pages/admin/AdminOverview.jsx frontend/src/pages/admin/AdminOverview.test.jsx frontend/src/pages/admin/AdminAccounts.jsx frontend/src/locales/fr/admin.json frontend/src/locales/ar/admin.json
git commit -m "feat(admin): montrer au superadmin les abonnements impayés et en accès réduit"
```

---

### Task 7: frontend agence — bandeau et accès réduit

**Files:**
- Create: `frontend/src/components/billing/BillingStatusBanner.jsx`, `frontend/src/components/billing/BillingStatusBanner.test.jsx`
- Modify: `frontend/src/pages/dashboard/Subscription.jsx` (rendu du bandeau)
- Modify: `frontend/src/components/auth/PrivateRoute.jsx`
- Create: `frontend/src/components/auth/PrivateRoute.test.jsx`
- Modify: `frontend/src/locales/fr/dashboard.json`, `frontend/src/locales/ar/dashboard.json`, `frontend/src/i18n/noHardcodedText.test.js` (`MIGRATED_FILES`)

**Interfaces:**
- Consumes: `/subscription/current` → `subscription.{status, grace_until, last_payment_failure_at, last_payment_failure_reason, billing_cycle, plan.slug}` (Task 1, via `_sub_dict`).
- Produces: `BillingStatusBanner({ subscription })` ; `PrivateRoute` redirige une agence `restricted`.

- [ ] **Step 1: Tests qui échouent** — créer `frontend/src/components/billing/BillingStatusBanner.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import BillingStatusBanner from './BillingStatusBanner'

const sub = (over) => ({ status: 'past_due', grace_until: '2026-10-05T10:00:00', billing_cycle: 'monthly',
  plan: { slug: 'pro' }, last_payment_failure_at: null, last_payment_failure_reason: null, ...over })
const renderBanner = (s) => render(<MemoryRouter><BillingStatusBanner subscription={s} /></MemoryRouter>)

describe('BillingStatusBanner', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("annonce la date de réduction d'accès et propose de payer", () => {
    renderBanner(sub())
    expect(screen.getByRole('alert')).toHaveTextContent('2026')
    expect(screen.getByRole('link', { name: 'Payer maintenant' }))
      .toHaveAttribute('href', '/checkout?plan=pro&billing=monthly')
  })

  it("dit que l'accès est réduit", () => {
    renderBanner(sub({ status: 'restricted' }))
    expect(screen.getByRole('alert')).toHaveTextContent('réduit')
  })

  it('montre le motif de la banque quand il existe', () => {
    renderBanner(sub({ last_payment_failure_at: '2026-09-20T09:00:00', last_payment_failure_reason: 'Carte refusée' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Carte refusée')
  })

  it("parle d'un échec sans motif sans jamais afficher de code technique", () => {
    renderBanner(sub({ last_payment_failure_at: '2026-09-20T09:00:00' }))
    expect(screen.getByRole('alert')).toHaveTextContent("n'a pas abouti")
    expect(screen.getByRole('alert')).not.toHaveTextContent('unknown')
  })

  it('ne montre rien pour un abonnement actif', () => {
    const { container } = renderBanner(sub({ status: 'active' }))
    expect(container).toBeEmptyDOMElement()
  })
})
```

Créer `frontend/src/components/auth/PrivateRoute.test.jsx` :

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import useAuthStore from '../../store/authStore'
import api from '../../services/api'
import PrivateRoute from './PrivateRoute'

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))

function renderAt(path, status) {
  api.get.mockResolvedValue({ data: { subscription: { status } } })
  useAuthStore.setState({ isAuthenticated: true, user: { id: 1, user_type: 'professional' } })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard/annonces" element={<p>annonces</p>} />
            <Route path="/dashboard/compte/abonnement" element={<p>abonnement</p>} />
            <Route path="/checkout" element={<p>paiement</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PrivateRoute — accès réduit', () => {
  beforeEach(() => api.get.mockReset())

  it("ramène une agence en accès réduit vers sa page d'abonnement", async () => {
    renderAt('/dashboard/annonces', 'restricted')
    expect(await screen.findByText('abonnement')).toBeInTheDocument()
  })

  it('la laisse payer', async () => {
    renderAt('/checkout', 'restricted')
    expect(await screen.findByText('paiement')).toBeInTheDocument()
  })

  it('laisse passer un abonnement actif', async () => {
    renderAt('/dashboard/annonces', 'active')
    expect(await screen.findByText('annonces')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Constater l'échec**

Run: `cd frontend && npx vitest run src/components/billing src/components/auth`
Expected: FAIL — module `./BillingStatusBanner` introuvable ; `Unable to find an element with the text: abonnement`.

- [ ] **Step 3: Bandeau** — créer `frontend/src/components/billing/BillingStatusBanner.jsx` :

```jsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFormat } from '../../utils/format'

/**
 * Bandeau d'un renouvellement impayé (`past_due`) ou d'un accès réduit (`restricted`). Le
 * paiement repasse par le parcours existant : aucun moyen de paiement n'est enregistré, le
 * système ne peut que redemander à l'agence de payer.
 */
export default function BillingStatusBanner({ subscription }) {
  const { t } = useTranslation(['dashboard'])
  const { fmtDate } = useFormat()
  const status = subscription?.status
  if (status !== 'past_due' && status !== 'restricted') return null
  const payHref = `/checkout?plan=${subscription.plan?.slug ?? ''}&billing=${subscription.billing_cycle || 'monthly'}`
  return (
    <div role="alert" className="mb-6 p-4 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm space-y-2">
      <p className="font-medium">
        {status === 'past_due'
          ? t('dashboard:billingStatus.pastDue', { date: fmtDate(subscription.grace_until) })
          : t('dashboard:billingStatus.restricted')}
      </p>
      {subscription.last_payment_failure_at && (
        <p>
          {subscription.last_payment_failure_reason
            ? t('dashboard:billingStatus.lastFailure', { reason: subscription.last_payment_failure_reason })
            : t('dashboard:billingStatus.lastFailureGeneric')}
        </p>
      )}
      <Link to={payHref} className="btn-primary inline-flex items-center min-h-[44px]">
        {t('dashboard:billingStatus.payNow')}
      </Link>
    </div>
  )
}
```

Dans `Subscription.jsx`, importer `import BillingStatusBanner from '../../components/billing/BillingStatusBanner'` et l'afficher juste après le `</div>` qui ferme le bloc `{/* Header */}` :

```jsx
      <BillingStatusBanner subscription={subscriptionData?.subscription} />
```

- [ ] **Step 4: Garde d'accès réduit** — remplacer le contenu de `frontend/src/components/auth/PrivateRoute.jsx` par :

```jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from 'react-query'
import useAuthStore from '../../store/authStore'
import api from '../../services/api'

// Seuls chemins ouverts à une agence en accès réduit : sa page d'abonnement et le parcours de
// paiement. Tout le reste la ramène à l'abonnement — confort d'interface uniquement, le blocage
// réel étant côté serveur (droits de plan révoqués, `require_feature`).
const BILLING_PATHS = ['/dashboard/compte', '/checkout', '/payment-gateway']

function PrivateRoute() {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  const isAgency = user?.user_type === 'professional' || user?.user_type === 'admin'
  // Même clé que la page d'abonnement : une seule requête, un seul cache.
  const { data } = useQuery(
    'currentSubscription',
    async () => (await api.get('/subscription/current')).data,
    { enabled: isAuthenticated && isAgency },
  )

  if (!isAuthenticated) {
    return <Navigate to="/connexion" state={{ from: location }} replace />
  }
  if (data?.subscription?.status === 'restricted'
      && !BILLING_PATHS.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/dashboard/compte/abonnement" replace />
  }
  return <Outlet />
}

export default PrivateRoute
```

Si un test existant rend `PrivateRoute` sans `QueryClientProvider` et casse, envelopper ce test dans un `QueryClientProvider` — ne pas rendre la requête facultative dans le composant.

- [ ] **Step 5: i18n** — `frontend/src/locales/fr/dashboard.json`, clé racine `billingStatus` :

```json
"billingStatus": {
  "pastDue": "Votre renouvellement n'est pas encore réglé. Votre abonnement reste entier jusqu'au {{date}} ; passé cette date, l'accès sera réduit à la facturation.",
  "restricted": "Votre accès est réduit à la facturation : réglez votre facture pour retrouver toutes vos fonctionnalités.",
  "lastFailure": "Motif indiqué par votre banque : {{reason}}.",
  "lastFailureGeneric": "Votre dernier paiement n'a pas abouti. Vérifiez votre carte ou contactez votre banque, puis réessayez.",
  "payNow": "Payer maintenant"
}
```

`frontend/src/locales/ar/dashboard.json` :

```json
"billingStatus": {
  "pastDue": "لم يُسدَّد تجديد اشتراكك بعد. يبقى اشتراكك كاملًا حتى {{date}}؛ وبعد هذا التاريخ سيقتصر الوصول على الفوترة.",
  "restricted": "يقتصر وصولك على الفوترة: سدِّد فاتورتك لاستعادة جميع الميزات.",
  "lastFailure": "السبب الذي أشار إليه بنكك: {{reason}}.",
  "lastFailureGeneric": "لم تكتمل عملية الدفع الأخيرة. تحقَّق من بطاقتك أو تواصل مع بنكك، ثم أعد المحاولة.",
  "payNow": "ادفع الآن"
}
```

Ajouter `'src/components/billing/BillingStatusBanner.jsx'` à `MIGRATED_FILES` dans `frontend/src/i18n/noHardcodedText.test.js`.

- [ ] **Step 6: Vérifier**

Run: `cd frontend && npx vitest run && npx eslint src --max-warnings=0 && npm run build`
Expected: tout vert.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/billing frontend/src/components/auth frontend/src/pages/dashboard/Subscription.jsx frontend/src/locales/fr/dashboard.json frontend/src/locales/ar/dashboard.json frontend/src/i18n/noHardcodedText.test.js
git commit -m "feat(billing): dire à l'agence son impayé et la ramener à la facturation en accès réduit"
```
