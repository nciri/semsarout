"""Service billing — plans, abonnements, facturation (routes legacy, cloisonné par agence).

Reproduit `/subscription-plans`, `/subscription-plans/{id}`, `/my-subscription`,
`/subscription/current`, `/cancel-subscription`, `/subscription/change-plan` — cf.
`backend/app/api/v1/subscriptions.py` + `billing.py`. `change-plan` : le garde-fou de
rétrogradation lit les sièges/équipes via l'endpoint interne d'**identity** (v2-native) ; la bascule
suit la chorégraphie paiement v2 (abonnement *incomplete* + facture *unpaid* +
`billing.invoice.created` → service payment → worker billing active). Le monolithe 500ait ici
(tables `payment_methods`/`invoices` absentes) — v2 le rend fonctionnel.

Entitlements : le gating par plan (`has_*`) est dérivé en liste de features par `plan_features()`
et projeté vers `identity.AgencyRO.features` (source des claims JWT) de deux façons — événement
`billing.subscription.activated` (émis par le worker à l'activation/prolongation) et repli via
`/internal/subscription` (identity l'interroge si sa projection est vide, ex. abonnement déjà
actif avant l'ajout de l'événement)."""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, Header, Query, Request, Response
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import extract
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal, require_superadmin
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, seats_client
from .db import get_db, init_db
from .models import Invoice, PriceChange, ServicePrice, Subscription, SubscriptionPlan
from .plans import plan_features
from .util import err, iso, json_body

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
           "Septembre", "Octobre", "Novembre", "Décembre"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _plan_dict(p: SubscriptionPlan) -> dict:
    return {
        "id": p.id, "name": p.name, "slug": p.slug, "description": p.description,
        "max_listings": p.max_listings, "max_featured": p.max_featured, "max_urgent": p.max_urgent,
        "has_api_access": p.has_api_access, "has_csv_import": p.has_csv_import,
        "has_staymanager_sync": p.has_staymanager_sync, "has_lead_contact": p.has_lead_contact,
        "has_analytics": p.has_analytics, "has_priority_support": p.has_priority_support,
        "has_dedicated_account_manager": p.has_dedicated_account_manager,
        "has_programs": p.has_programs, "max_programs": p.max_programs,
        "has_contracts": p.has_contracts, "has_legal": p.has_legal, "has_artisans": p.has_artisans,
        "has_rental": p.has_rental, "has_design3d": p.has_design3d,
        "max_seats": p.max_seats, "max_teams": p.max_teams,
        "price_monthly": float(p.price_monthly),
        "price_yearly": float(p.price_yearly) if p.price_yearly else None,
    }


def _sub_dict(db: Session, s: Subscription) -> dict:
    plan = db.get(SubscriptionPlan, s.plan_id)
    remaining = None
    if plan and plan.max_listings != -1:
        remaining = plan.max_listings - s.listings_used
    return {
        "id": s.id, "agency_id": s.agency_id,
        "plan": _plan_dict(plan) if plan else None,
        "billing_cycle": s.billing_cycle, "amount": float(s.amount), "status": s.status,
        "start_date": iso(s.start_date), "end_date": iso(s.end_date),
        "listings_used": s.listings_used, "listings_remaining": remaining,
        "grace_until": iso(s.grace_until), "features_until": iso(_features_until(s)),
        "last_payment_failure_at": iso(s.last_payment_failure_at),
        "last_payment_failure_reason": s.last_payment_failure_reason,
    }


def _invoice_dict(i: Invoice) -> dict:
    return {"id": i.id, "reference": i.reference, "subscription_id": i.subscription_id,
            "agency_id": i.agency_id, "amount": float(i.amount), "status": i.status,
            "period_label": i.period_label, "issued_at": iso(i.issued_at), "paid_at": iso(i.paid_at)}


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


def _features_until(sub: Subscription) -> "datetime | None":
    """Instant au-delà duquel les features de cet abonnement ne valent plus.

    Un abonnement révocable en fin de période reste entitlé jusqu'à `end_date`, puis
    ne l'est plus. Sans cette borne dans la projection, identity n'avait AUCUN moyen
    d'apprendre l'échéance : `_reconcile_expired` ne tire que depuis `_agency_sub`,
    aucun balayage ne l'appelle, et identity ne réinterroge jamais billing une fois
    `features_synced_at` posé (I7). Une agence qui résiliait et ne revenait pas sur
    ses pages de facturation gardait donc ses droits — le module payant compris —
    indéfiniment après l'échéance.

    `active` n'a pas d'échéance de droits : sa prolongation passe par le worker, qui
    réémet l'événement. Y poser `end_date` ferait réinterroger billing à chaque login
    dès la fin de période, ce que I7 existe précisément pour éviter.
    """
    return _deadline(sub) if sub.status in _REVOCABLE_ON_PERIOD_END else None


def _reconcile_expired(db: Session, sub: Subscription | None) -> None:
    """I8 : `change_plan` bascule l'abonnement en `incomplete` (nouveau plan, facture impayée)
    sans jamais réévaluer les entitlements ensuite — si la facture n'est jamais réglée, l'agence
    conserve indéfiniment les features de l'ancien plan (dernier `billing.subscription.activated`
    reçu par identity). Faute d'ordonnanceur d'expiration dédié côté billing (chantier plus
    large), la période de grâce déjà posée par `change_plan` (`end_date`) sert de repère : une
    fois dépassée sans paiement, l'abonnement passe `expired` et l'événement réémis vide les
    features, pour qu'identity cesse de les projeter dans le JWT.

    A3 : `cancelled` relève du même traitement, pour la raison symétrique. `cancel_subscription`
    est une résiliation DIFFÉRÉE — l'accès court jusqu'à la fin de la période payée, et
    `cancelled` est donc entitlé (cf. `_ENTITLED_STATUSES`) — mais rien ne le révoquait ensuite :
    l'événement émis à la résiliation porte les features COURANTES du plan et c'est le dernier
    que cet abonnement émettra jamais. Un abonnement résilié gardait ses fonctionnalités pour
    toujours. Passé `end_date`, il devient `expired` et l'événement réémis vide les features.
    Un abonnement résilié mais encore DANS sa période payée n'est pas touché : un client qui a
    payé ne doit jamais perdre ses fonctionnalités à tort. Sans `end_date`, la fin de la période
    est inconnue et on ne révoque pas — même sens.

    Best-effort et lazy (pas de garantie de délai) : appelée à chaque lecture d'un abonnement via
    `_agency_sub`, donc au prochain `/internal/subscription` (repli identity),
    `change-plan` ou `cancel-subscription` de l'agence."""
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


def _agency_sub(db: Session, agency_id: int, status: str | None = None) -> Subscription | None:
    """Abonnement COURANT de l'agence — la ligne la plus récente, jamais une ligne arbitraire.

    A3 : une agence peut porter plusieurs lignes. `cancel_subscription` laisse la ligne résiliée
    en base, et le worker (`_create_or_extend`) en CRÉE une nouvelle dès qu'aucune n'est
    `active` : après une résiliation suivie d'un réabonnement, le `q.first()` sans `ORDER BY`
    rendait le plus souvent la ligne périmée, et les fonctionnalités du mauvais plan étaient
    projetées dans les claims JWT. `id` décroissant (même critère que
    `worker._activate_pending`) désigne sans ambiguïté le réabonnement."""
    q = db.query(Subscription).filter(Subscription.agency_id == agency_id)
    if status:
        q = q.filter(Subscription.status == status)
    sub = q.order_by(Subscription.id.desc()).first()
    _reconcile_expired(db, sub)
    return sub


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# Statuts avec accès effectif au plan. `cancelled` : résiliation différée, l'accès court jusqu'à
# la fin de la période payée. `past_due` : renouvellement impayé, l'accès court jusqu'à la fin de
# la grâce. `incomplete`, `expired` et `restricted` en sont volontairement absents.
_ENTITLED_STATUSES = {"active", "cancelled", "past_due"}


@app.get("/internal/subscription", include_in_schema=False)
def internal_subscription(request: Request, x_internal_token: str = Header(default=""),
                          db: Session = Depends(get_db)):
    """Abonnement d'une agence (nom du plan + statut) — pour l'overview du service analytics."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    aid = request.query_params.get("agency_id")
    sub = _agency_sub(db, int(aid)) if aid else None
    if sub is None:
        return {"subscription": None}
    plan = db.get(SubscriptionPlan, sub.plan_id)
    # I7/I8 (round 2) : `features`/`has_*` ne doivent JAMAIS refléter un abonnement sans accès
    # payé effectif — sinon le repli `_features()` d'identity (déclenché dès qu'une agence n'a
    # pas encore de projection locale) écrit ces entitlements EN BASE, en les marquant
    # `features_synced_at`, donc durablement, dès la première connexion suivant un changement de
    # plan `incomplete` jamais réglé. Une agence obtiendrait alors le module payant sans jamais
    # avoir payé. Symétrique par construction : `active`/`cancelled` (grâce) restent entitled et
    # ne perdent rien.
    entitled = plan is not None and sub.status in _ENTITLED_STATUSES
    return {"subscription": {"plan": plan.name if plan else None, "status": sub.status,
                             "has_programs": bool(plan.has_programs) if entitled else False,
                             "max_programs": plan.max_programs if entitled else 0,
                             "has_staymanager_sync": bool(plan.has_staymanager_sync) if entitled else False,
                             "features": plan_features(plan) if entitled else [],
                             "features_until": iso(_features_until(sub))}}


@app.get("/internal/subscriptions", include_in_schema=False)
def internal_subscriptions(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Abonnement (dict complet) par agence — pour `/admin/accounts` (plan) et le détail agence."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    # Plus récente d'abord : `setdefault` garde ainsi la ligne courante d'une agence qui en
    # porte plusieurs (résiliation puis réabonnement), comme `_agency_sub`.
    subs = db.query(Subscription).order_by(Subscription.id.desc()).all()
    out: dict[str, dict] = {}
    for s in subs:
        out.setdefault(str(s.agency_id), _sub_dict(db, s))  # 1 par agence (parité `a.subscription`)
    return {"subscriptions": out}


@app.get("/internal/subscriptions/stats", include_in_schema=False)
def internal_subscriptions_stats(x_internal_token: str = Header(default=""),
                                 db: Session = Depends(get_db)):
    """Abonnements actifs par plan + MRR (super-admin overview) — agrégés par analytics. billing
    possède les abonnements (parité des sous-comptes de `admin/overview.py`)."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    active = db.query(Subscription).filter(Subscription.status == "active").all()
    plans = {p.id: p.slug for p in db.query(SubscriptionPlan).all()}
    by_plan: dict[str, int] = {}
    mrr = 0.0
    for s in active:
        slug = plans.get(s.plan_id)
        if slug:
            by_plan[slug] = by_plan.get(slug, 0) + 1
        amt = float(s.amount or 0)
        mrr += amt / 12.0 if s.billing_cycle == "yearly" else amt
    unpaid = {st: db.query(Subscription).filter(Subscription.status == st).count()
              for st in ("past_due", "restricted")}
    return {"active_subscriptions": by_plan, "mrr_estimate": round(mrr, 2),
            "unpaid_subscriptions": unpaid}


# Cadence de relance impayé (dunning) : 1re relance J+3 après émission, puis toutes les 7 j,
# max 3 relances. Idempotent via reminder_count/last_reminder_at (marqués par l'ordonnanceur).
_FIRST_REMINDER_DAYS = 3
_REMINDER_INTERVAL_DAYS = 7
_MAX_REMINDERS = 3
# Délai de grâce d'un renouvellement impayé : l'accès est réduit un intervalle après la dernière
# relance, pour que celle-ci puisse annoncer la date au lieu de coïncider avec elle (3 + 3 × 7 j).
_GRACE_DAYS = _FIRST_REMINDER_DAYS + _MAX_REMINDERS * _REMINDER_INTERVAL_DAYS


def _next_invoice_reference(db: Session, now: datetime) -> str:
    count = db.query(Invoice).filter(extract("year", Invoice.issued_at) == now.year).count()
    return f"INV-{now.year}-{str(count + 1).zfill(3)}"


@app.get("/internal/invoices/due-reminders", include_in_schema=False)
def internal_invoices_due_reminders(x_internal_token: str = Header(default=""),
                                    db: Session = Depends(get_db)):
    """Factures impayées dues pour une relance — consommé par l'ordonnanceur notification."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    now = datetime.utcnow()
    out = []
    for inv in db.query(Invoice).filter(Invoice.status == "unpaid").all():
        count = inv.reminder_count or 0
        if count >= _MAX_REMINDERS:
            continue
        if count == 0:
            due = inv.issued_at is not None and inv.issued_at <= now - timedelta(days=_FIRST_REMINDER_DAYS)
        else:
            due = inv.last_reminder_at is not None and \
                inv.last_reminder_at <= now - timedelta(days=_REMINDER_INTERVAL_DAYS)
        if due:
            sub = db.get(Subscription, inv.subscription_id) if inv.subscription_id else None
            out.append({"id": inv.id, "reference": inv.reference, "agency_id": inv.agency_id,
                        "amount": float(inv.amount or 0), "period_label": inv.period_label,
                        "issued_at": iso(inv.issued_at), "reminder_count": count,
                        "grace_until": iso(sub.grace_until) if sub else None})
    return {"invoices": out}


@app.post("/internal/invoices/{invoice_id}/reminder-sent", include_in_schema=False)
def internal_invoice_reminder_sent(invoice_id: int, x_internal_token: str = Header(default=""),
                                   db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    inv = db.get(Invoice, invoice_id)
    if inv is not None and inv.status == "unpaid":
        inv.reminder_count = (inv.reminder_count or 0) + 1
        inv.last_reminder_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


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


# ---- Catalogue tarifaire (spec 2026-09-12) -----------------------------------------------
# `service_price` est la SEULE source d'un montant de prestation : le site l'affiche et payment
# s'en sert pour prélever, via une projection. Les abonnements gardent `subscription_plan`, qui
# porte bien plus qu'un prix.


def _uid(principal: Principal) -> int | None:
    """`Principal.sub` est une chaîne (revendication JWT) : l'auteur d'un changement de prix est
    consigné en entier, ou pas du tout plutôt que faux."""
    try:
        return int(principal.sub)
    except (TypeError, ValueError):
        return None


def _plan_price_dict(p: SubscriptionPlan) -> dict:
    return {"id": p.id, "slug": p.slug, "name": p.name,
            "price_monthly": float(p.price_monthly) if p.price_monthly is not None else None,
            "price_yearly": float(p.price_yearly) if p.price_yearly is not None else None}


def _trace_price(db: Session, code: str, old, new, by: int | None) -> None:
    """Historique écrit dans la MÊME transaction que la mutation (I4)."""
    db.add(PriceChange(code=code, old_amount=old, new_amount=new, changed_by=by))


@app.get("/pricing")
def public_pricing(db: Session = Depends(get_db)):
    """Tarifs publics — une seule requête pour tout le site. N'expose que l'actif : une
    prestation retirée de l'offre ne doit plus s'afficher, même si elle reste en base."""
    services = (db.query(ServicePrice).filter(ServicePrice.is_active.is_(True))
                .order_by(ServicePrice.code).all())
    plans = (db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active.is_(True))
             .order_by(SubscriptionPlan.price_monthly).all())
    return {"services": [s.to_dict() for s in services],
            "plans": [_plan_price_dict(p) for p in plans]}


@app.get("/internal/service-prices", include_in_schema=False)
def internal_service_prices(x_internal_token: str = Header(default=""),
                            db: Session = Depends(get_db)):
    """Amorçage de la projection de payment. Porte AUSSI l'inactif : payment doit pouvoir
    refuser un code retiré de l'offre en le connaissant, plutôt que de le confondre avec un
    code inexistant. Sans cet endpoint, un payment neuf refuserait tout paiement jusqu'au
    premier changement de prix."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    services = db.query(ServicePrice).order_by(ServicePrice.code).all()
    plans = db.query(SubscriptionPlan).all()
    return {"services": [s.to_dict(internal=True) for s in services],
            "plans": [_plan_price_dict(p) for p in plans]}


@app.put("/admin/service-prices/{code}")
def admin_set_service_price(code: str, body: dict = Depends(json_body),
                            principal: Principal = Depends(require_superadmin),
                            db: Session = Depends(get_db)):
    try:
        amount = float(body.get("amount"))
    except (TypeError, ValueError):
        return err("Montant invalide", 422)
    # Fail-closed : un montant nul ou négatif prélèverait ou rendrait de l'argent à tort.
    if amount <= 0:
        return err("Le montant doit être strictement positif", 422)
    sp = db.get(ServicePrice, code)
    if sp is None:
        return err("Prestation inconnue", 404)
    _trace_price(db, code, sp.amount, amount, _uid(principal))
    sp.amount = amount
    sp.updated_by = _uid(principal)
    enqueue(db, "service_price", code, events.SERVICE_PRICE_CHANGED,
            {"code": code, "amount": amount, "kind": sp.kind, "is_active": bool(sp.is_active)})
    db.commit()
    return {"service_price": sp.to_dict(internal=True)}


@app.patch("/admin/service-prices/{code}")
def admin_toggle_service_price(code: str, body: dict = Depends(json_body),
                               principal: Principal = Depends(require_superadmin),
                               db: Session = Depends(get_db)):
    """Retirer une prestation de l'offre sans la supprimer : son code reste porté par des
    paiements passés (I7)."""
    sp = db.get(ServicePrice, code)
    if sp is None:
        return err("Prestation inconnue", 404)
    sp.is_active = bool(body.get("is_active"))
    sp.updated_by = _uid(principal)
    enqueue(db, "service_price", code, events.SERVICE_PRICE_CHANGED,
            {"code": code, "amount": float(sp.amount), "kind": sp.kind,
             "is_active": bool(sp.is_active)})
    db.commit()
    return {"service_price": sp.to_dict(internal=True)}


@app.put("/admin/subscription-plans/{plan_id}")
def admin_set_plan_price(plan_id: int, body: dict = Depends(json_body),
                         principal: Principal = Depends(require_superadmin),
                         db: Session = Depends(get_db)):
    plan = db.get(SubscriptionPlan, plan_id)
    if plan is None:
        return err("Plan inconnu", 404)
    by = _uid(principal)
    for field, cycle in (("price_monthly", "monthly"), ("price_yearly", "yearly")):
        if body.get(field) is None:
            continue
        try:
            amount = float(body[field])
        except (TypeError, ValueError):
            return err("Montant invalide", 422)
        if amount <= 0:
            return err("Le montant doit être strictement positif", 422)
        _trace_price(db, f"plan:{plan.slug}:{cycle}", getattr(plan, field), amount, by)
        setattr(plan, field, amount)
    enqueue(db, "subscription_plan", plan.id, events.PLAN_CHANGED, _plan_price_dict(plan))
    db.commit()
    return {"plan": _plan_price_dict(plan)}


@app.get("/admin/price-changes")
def admin_price_changes(principal: Principal = Depends(require_superadmin),
                        db: Session = Depends(get_db), limit: int = Query(10, ge=1, le=100)):
    rows = db.query(PriceChange).order_by(PriceChange.id.desc()).limit(limit).all()
    return {"changes": [r.to_dict() for r in rows]}


@app.get("/subscription-plans")
def list_plans(db: Session = Depends(get_db)) -> dict:
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active.is_(True)).all()
    return {"plans": [_plan_dict(p) for p in plans]}


@app.get("/subscription-plans/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    p = db.get(SubscriptionPlan, plan_id)
    if p is None:
        return err("Plan not found", 404)
    return {"plan": _plan_dict(p)}


@app.get("/my-subscription")
def my_subscription(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if principal.agency_id is None:
        return err("You do not belong to an agency", 404)
    sub = _agency_sub(db, principal.agency_id)
    if sub is None:
        return err("No active subscription", 404)
    return {"subscription": _sub_dict(db, sub)}


@app.get("/subscription/current")
def current_subscription(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    sub = _agency_sub(db, principal.agency_id) if principal.agency_id else None
    plans = (db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active.is_(True))
             .order_by(SubscriptionPlan.price_monthly).all())
    current_plan = "free"
    if sub is not None:
        plan = db.get(SubscriptionPlan, sub.plan_id)
        current_plan = plan.slug if plan else "free"
    return {"subscription": _sub_dict(db, sub) if sub else None,
            "current_plan": current_plan, "plans": [_plan_dict(p) for p in plans]}


# ---- Factures (parité `billing.py` list/pdf) — billing possède les factures. Le monolithe ne
# sert plus ces routes (sa table `invoices` n'existe pas en dev → 500) : implémentation v2-native.
@app.get("/invoices")
def list_invoices(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    """Factures de l'agence de l'utilisateur (paginées, plus récentes d'abord)."""
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    q = db.query(Invoice)
    q = q.filter(Invoice.agency_id == principal.agency_id) if principal.agency_id else q.filter(False)
    q = q.order_by(Invoice.issued_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"invoices": [_invoice_dict(i) for i in items], "total": total,
            "pages": pages, "current_page": page}


@app.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if inv is None:
        return err("Not found", 404)
    if principal.agency_id is None or inv.agency_id != principal.agency_id:
        return err("Unauthorized", 403)
    pdf = _render_invoice_pdf(inv)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={inv.reference}.pdf"})


def _render_invoice_pdf(inv: Invoice) -> bytes:
    """Facture PDF (reportlab). Champs disponibles côté billing : reference, période, montant, statut."""
    from io import BytesIO

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    head = ParagraphStyle("Header", parent=styles["Heading1"], fontSize=24,
                          textColor=colors.HexColor("#1e3a5f"), spaceAfter=10)
    info = ParagraphStyle("Info", parent=styles["Normal"], fontSize=10)
    story = [
        Paragraph("SemsarOut", head), Paragraph("www.semsarout.com", styles["Normal"]), Spacer(1, 20),
        Paragraph(f"<b>FACTURE</b> {inv.reference}", head),
        Paragraph(f"Date : {inv.issued_at.strftime('%d/%m/%Y') if inv.issued_at else '-'}", info),
        Paragraph(f"Période : {inv.period_label or '-'}", info),
        Paragraph(f"Montant : {float(inv.amount):.2f} Đh", info),
        Paragraph(f"Statut : {inv.status}", info),
    ]
    doc.build(story)
    return buf.getvalue()


@app.post("/cancel-subscription")
def cancel_subscription(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if principal.agency_id is None:
        return err("You do not belong to an agency", 404)
    sub = _agency_sub(db, principal.agency_id, status="active")
    if sub is None:
        return err("No active subscription to cancel", 404)
    sub.status = "cancelled"
    sub.cancelled_at = datetime.utcnow()
    # L'accès reste actif jusqu'à la fin de la période payée (message ci-dessous) : les
    # entitlements ne changent PAS immédiatement — on réémet l'état courant du plan pour que
    # `AgencyRO.features` (sinon figée à jamais, faute de tout autre événement pour cet
    # abonnement) reste synchronisée, plutôt qu'une liste vide qui serait fausse tant que
    # `end_date` n'est pas atteinte.
    plan = db.get(SubscriptionPlan, sub.plan_id)
    enqueue(db, "subscription", sub.id, events.SUBSCRIPTION_ACTIVATED,
            {"subscription_id": sub.id, "agency_id": principal.agency_id,
             "features": plan_features(plan) if plan else [],
             # Le terme de la période payée EST l'échéance des droits : sans lui,
             # cette projection resterait vraie pour toujours.
             "features_until": iso(_features_until(sub))})
    db.commit()
    return {"message": "Subscription cancelled. Access continues until end of billing period.",
            "subscription": _sub_dict(db, sub)}


@app.post("/subscription/change-plan")
async def change_plan(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await json_body(request)
    new_plan_id = data.get("plan_id")
    if not new_plan_id:
        return err("plan_id is required", 400)
    # plan_id peut être un PK numérique ou un slug ("pro", "starter"…).
    plan = None
    if isinstance(new_plan_id, int) or (isinstance(new_plan_id, str) and new_plan_id.isdigit()):
        plan = db.get(SubscriptionPlan, int(new_plan_id))
    if plan is None:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == str(new_plan_id)).first()
    if plan is None or not plan.is_active:
        return err("Plan not found", 404)

    # Garde-fou de rétrogradation : sièges/équipes via identity (v2-native).
    if principal.agency_id:
        s = seats_client.seats_of(principal.agency_id)
        used_seats = s.get("active_member_seats", 0)
        used_teams = s.get("teams_used", 0)
        if plan.max_seats != -1 and used_seats > plan.max_seats:
            excess = used_seats - plan.max_seats
            return err(f"Retirez d'abord {excess} membre(s) pour passer à ce plan.", 409)
        if plan.max_teams != -1 and used_teams > plan.max_teams:
            return err("Trop d'équipes pour ce plan : supprimez-en d'abord.", 409)
    else:
        return err("Individual subscriptions not yet supported", 400)

    now = datetime.utcnow()
    billing_cycle = data.get("billing_cycle", "monthly")
    if billing_cycle == "yearly" and plan.price_yearly:
        amount, end_date = plan.price_yearly, now + timedelta(days=365)
    else:
        amount, end_date, billing_cycle = plan.price_monthly, now + timedelta(days=30), "monthly"

    sub = _agency_sub(db, principal.agency_id)
    if sub is not None:
        sub.plan_id = plan.id
        sub.billing_cycle = billing_cycle
        sub.amount = amount
        sub.status = "incomplete"  # en attente de confirmation du paiement
        sub.end_date = end_date
        sub.updated_at = now
    else:
        sub = Subscription(agency_id=principal.agency_id, plan_id=plan.id, billing_cycle=billing_cycle,
                           amount=amount, status="incomplete", start_date=now, end_date=end_date)
        db.add(sub)
        db.flush()

    invoice = Invoice(reference=_next_invoice_reference(db, now),
                      subscription_id=sub.id, agency_id=principal.agency_id, amount=amount,
                      status="unpaid", period_label=f"{_MONTHS[now.month - 1]} {now.year}")
    db.add(invoice)
    db.flush()
    enqueue(db, "invoice", invoice.id, events.INVOICE_CREATED, {
        "invoice_id": invoice.id, "agency_id": principal.agency_id, "amount": float(amount),
        "plan": plan.slug, "purpose": "subscription", "reference": invoice.reference,
        "period_label": invoice.period_label, "renewal": False, "grace_until": None,
    })
    db.commit()
    return {"message": "Subscription updated successfully",
            "subscription": _sub_dict(db, sub), "invoice": _invoice_dict(invoice)}
