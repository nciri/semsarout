"""plan_features() (dérivation gating -> claims JWT) + `/internal/subscription` (repli identity)
+ émission `billing.subscription.activated` (activation ET résiliation)."""
from fastapi.testclient import TestClient
from semsar_auth import Principal, get_principal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.db import get_db
from app.main import app
from app.models import Subscription, SubscriptionPlan
from app.plans import plan_features


def _plan(**overrides) -> SubscriptionPlan:
    base = {"name": "Pro", "slug": "pro", "max_listings": 100, "price_monthly": 499,
           "has_contracts": False, "has_legal": False, "has_artisans": False, "has_rental": False,
           "has_programs": False, "has_analytics": False, "has_api_access": False,
           "has_csv_import": False, "has_staymanager_sync": False, "has_design3d": False}
    base.update(overrides)
    return SubscriptionPlan(**base)


def test_plan_features_derives_from_has_columns():
    p = _plan(has_contracts=True, has_design3d=True, has_rental=True)
    assert set(plan_features(p)) == {"contracts", "design3d", "rental"}


def test_plan_features_empty_when_no_flag_set():
    p = _plan()
    assert plan_features(p) == []


def _db_session(tmp_path):
    from semsar_events import OutboxBase

    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}", future=True,
                           connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def test_internal_subscription_exposes_features(monkeypatch, tmp_path):
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True, has_artisans=True)
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=7, plan_id=plan.id, amount=499, status="active"))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 7},
                              headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        assert set(resp.json()["subscription"]["features"]) == {"design3d", "artisans"}
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_internal_subscription_hides_features_for_unpaid_plan_change(monkeypatch, tmp_path):
    """Trou de revenu (round 2, découvert en relecture) : une agence neuve choisit un plan payant
    via change_plan (statut `incomplete`, facture `unpaid`) puis se connecte AVANT d'avoir payé.
    Le repli identity (`_features`, quand `features_synced_at` est NULL) interroge cet endpoint —
    qui renvoyait `plan_features(plan)` sans jamais regarder `sub.status`, donnant l'accès payant
    à un abonnement jamais réglé, et cette réponse était alors écrite EN BASE par identity
    (`ag.features_synced_at` posé), donc de façon durable, jusqu'au prochain
    `billing.subscription.activated`. `features` (et les autres champs dérivés du plan) ne
    doivent refléter QUE des abonnements avec accès effectif (`active`/`cancelled` en grâce),
    jamais `incomplete`."""
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True, has_programs=True, has_staymanager_sync=True, max_programs=10)
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=20, plan_id=plan.id, amount=499, status="incomplete"))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 20},
                              headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        sub = resp.json()["subscription"]
        assert sub["status"] == "incomplete"
        assert sub["features"] == []
        assert sub["has_programs"] is False
        assert sub["max_programs"] == 0
        assert sub["has_staymanager_sync"] is False
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_internal_subscription_still_exposes_features_when_paid(monkeypatch, tmp_path):
    """Symétrique de la précédente : un abonnement PAYÉ (`active`) ne doit rien perdre à tort."""
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=21, plan_id=plan.id, amount=499, status="active"))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 21},
                              headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        assert resp.json()["subscription"]["features"] == ["design3d"]
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_internal_subscription_still_exposes_features_when_cancelled_in_grace_period(monkeypatch, tmp_path):
    """Symétrique : une résiliation garde l'accès jusqu'à la fin de la période payée
    (`cancel_subscription`) — `cancelled` doit rester entitled, pas seulement `active`."""
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=22, plan_id=plan.id, amount=499, status="cancelled"))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 22},
                              headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        assert resp.json()["subscription"]["features"] == ["design3d"]
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_agency_sub_reconciles_expired_incomplete_change(tmp_path):
    """I8 : un changement de plan resté impayé au-delà de sa période de grâce (`end_date`) ne doit
    pas figer les entitlements de l'ancien plan indéfiniment. Faute d'ordonnanceur d'expiration
    dédié côté billing, la réévaluation se fait à la prochaine lecture de l'abonnement de
    l'agence (`_agency_sub`, appelée par `/internal/subscription`, `change-plan`,
    `cancel-subscription`)."""
    from datetime import datetime, timedelta

    from semsar_events import OutboxEvent

    from app.main import _agency_sub

    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    sub = Subscription(agency_id=30, plan_id=plan.id, amount=100, status="incomplete",
                       end_date=datetime.utcnow() - timedelta(days=1))
    db.add(sub)
    db.commit()

    result = _agency_sub(db, 30)

    assert result.status == "expired"
    ev = db.query(OutboxEvent).filter_by(
        event_type="billing.subscription.activated").order_by(OutboxEvent.id.desc()).first()
    assert ev is not None
    assert ev.payload["agency_id"] == 30
    assert ev.payload["features"] == []


def test_agency_sub_does_not_reconcile_before_grace_period_ends(tmp_path):
    """Contre-épreuve : tant que la période de grâce (`end_date`) n'est pas passée, les
    entitlements de l'ancien plan restent — le repli ne doit pas révoquer trop tôt."""
    from datetime import datetime, timedelta

    from semsar_events import OutboxEvent

    from app.main import _agency_sub

    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    sub = Subscription(agency_id=31, plan_id=plan.id, amount=100, status="incomplete",
                       end_date=datetime.utcnow() + timedelta(days=10))
    db.add(sub)
    db.commit()

    result = _agency_sub(db, 31)

    assert result.status == "incomplete"
    assert db.query(OutboxEvent).count() == 0


def test_cancel_subscription_emits_current_features(tmp_path):
    """La résiliation ne coupe pas l'accès immédiatement (message : « Access continues until end
    of billing period »). L'événement doit donc porter les features COURANTES du plan, pas une
    liste vide — sans quoi `AgencyRO.features` (identity) serait faussement vidée avant la fin de
    la période payée. C'est le seul événement qui sera jamais émis pour cet abonnement une fois
    résilié (aucun job d'expiration n'existe côté billing) : sans lui, `AgencyRO.features` restait
    figée pour toujours à l'état d'avant résiliation."""
    from semsar_events import OutboxEvent

    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True, has_rental=True)
    db.add(plan)
    db.commit()
    sub = Subscription(agency_id=11, plan_id=plan.id, amount=499, status="active")
    db.add(sub)
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_principal] = lambda: Principal(sub="1", agency_id=11)
    try:
        with TestClient(app) as client:
            resp = client.post("/cancel-subscription")
        assert resp.status_code == 200
        updated = db.get(Subscription, sub.id)
        assert updated.status == "cancelled"
        ev = db.query(OutboxEvent).filter_by(
            event_type="billing.subscription.activated").order_by(OutboxEvent.id.desc()).first()
        assert ev is not None
        assert ev.payload["agency_id"] == 11
        assert set(ev.payload["features"]) == {"design3d", "rental"}
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_agency_sub_revokes_cancelled_subscription_after_period_end(tmp_path):
    """A3 : `cancelled` est entitlé (résiliation différée : l'accès court jusqu'à la fin de la
    période payée) mais RIEN ne le révoquait ensuite — `_reconcile_expired` ne traitait que
    `incomplete`, et aucun autre événement n'est jamais émis pour un abonnement résilié. Un
    abonnement résilié gardait donc ses fonctionnalités pour toujours."""
    from datetime import datetime, timedelta

    from semsar_events import OutboxEvent

    from app.main import _agency_sub

    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=40, plan_id=plan.id, amount=499, status="cancelled",
                        end_date=datetime.utcnow() - timedelta(days=1)))
    db.commit()

    result = _agency_sub(db, 40)

    assert result.status == "expired"
    ev = db.query(OutboxEvent).filter_by(
        event_type="billing.subscription.activated").order_by(OutboxEvent.id.desc()).first()
    assert ev is not None
    assert ev.payload["agency_id"] == 40
    assert ev.payload["features"] == []
    db.close()


def test_agency_sub_keeps_cancelled_subscription_entitled_until_period_end(monkeypatch, tmp_path):
    """Symétrique, non négociable : un client qui a PAYÉ sa période ne perd rien à tort. Tant
    que `end_date` n'est pas passée, une résiliation reste `cancelled` et entitlée."""
    from datetime import datetime, timedelta

    from semsar_events import OutboxEvent

    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=41, plan_id=plan.id, amount=499, status="cancelled",
                        end_date=datetime.utcnow() + timedelta(days=10)))
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 41},
                              headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        assert resp.json()["subscription"]["status"] == "cancelled"
        assert resp.json()["subscription"]["features"] == ["design3d"]
        assert db.query(OutboxEvent).count() == 0
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_agency_sub_does_not_revoke_cancelled_subscription_without_end_date(tmp_path):
    """Contre-épreuve : sans `end_date`, la fin de la période payée est inconnue — on ne révoque
    pas au hasard (le sens « le client qui paie ne perd rien » l'emporte)."""
    from semsar_events import OutboxEvent

    from app.main import _agency_sub

    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    db.add(Subscription(agency_id=42, plan_id=plan.id, amount=499, status="cancelled",
                        end_date=None))
    db.commit()

    assert _agency_sub(db, 42).status == "cancelled"
    assert db.query(OutboxEvent).count() == 0
    db.close()


def test_internal_subscription_projects_the_latest_subscription_after_resubscription(monkeypatch, tmp_path):
    """A3 : `_agency_sub` faisait un `q.first()` sans `ORDER BY`. Après une résiliation suivie
    d'un réabonnement (le worker `_create_or_extend` crée une NOUVELLE ligne quand aucune n'est
    `active`), la ligne périmée gagnait le plus souvent et les fonctionnalités du MAUVAIS plan
    étaient projetées dans les claims JWT."""
    from datetime import datetime, timedelta

    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    starter = _plan(name="Starter", slug="starter", price_monthly=99)
    pro = _plan(name="Pro", slug="pro", has_design3d=True, has_rental=True)
    db.add_all([starter, pro])
    db.commit()
    # l'ancien abonnement résilié, encore en base, période payée déjà écoulée
    db.add(Subscription(agency_id=50, plan_id=starter.id, amount=99, status="cancelled",
                        end_date=datetime.utcnow() - timedelta(days=30)))
    db.commit()
    # le réabonnement : nouvelle ligne active sur un autre plan
    db.add(Subscription(agency_id=50, plan_id=pro.id, amount=499, status="active",
                        end_date=datetime.utcnow() + timedelta(days=30)))
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 50},
                              headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        sub = resp.json()["subscription"]
        assert sub["plan"] == "Pro", "l'abonnement courant est celui du réabonnement"
        assert sub["status"] == "active"
        assert set(sub["features"]) == {"design3d", "rental"}
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_internal_subscription_dit_jusqua_quand_les_droits_valent(monkeypatch, tmp_path):
    """A3 (suite) : sans borne, identity n'a AUCUN moyen d'apprendre l'échéance.

    Une résiliation garde l'accès jusqu'à la fin de la période payée. Passé ce
    terme, plus rien ne le révoquait : `_reconcile_expired` ne tire que depuis
    `_agency_sub`, et identity ne réinterroge jamais billing une fois
    `features_synced_at` posé (I7). L'agence gardait donc ses droits — le module
    payant compris — indéfiniment. La projection doit porter son échéance pour
    expirer d'elle-même.
    """
    from datetime import datetime, timedelta

    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    fin = datetime.utcnow() + timedelta(days=12)
    db.add(Subscription(agency_id=30, plan_id=plan.id, amount=499, status="cancelled", end_date=fin))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 30},
                              headers={"x-internal-token": "tok"})
        assert resp.status_code == 200
        sub = resp.json()["subscription"]
        # En grâce : les droits valent encore, mais leur terme est dit.
        assert sub["features"] == ["design3d"]
        assert sub["features_until"] == fin.isoformat()
    finally:
        app.dependency_overrides.clear()
        db.close()


def test_internal_subscription_sans_echeance_pour_un_abonnement_actif(monkeypatch, tmp_path):
    """Un abonnement `active` n'a pas d'échéance de droits : sa prolongation passe
    par le worker, qui réémet l'événement. Poser une borne ici ferait réinterroger
    billing à chaque login dès la fin de période, ce que I7 existe pour éviter."""
    from app import main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db = _db_session(tmp_path)
    plan = _plan(has_design3d=True)
    db.add(plan)
    db.commit()
    from datetime import datetime, timedelta
    db.add(Subscription(agency_id=31, plan_id=plan.id, amount=499, status="active",
                        end_date=datetime.utcnow() + timedelta(days=30)))
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            resp = client.get("/internal/subscription", params={"agency_id": 31},
                              headers={"x-internal-token": "tok"})
        assert resp.json()["subscription"]["features_until"] is None
    finally:
        app.dependency_overrides.clear()
        db.close()


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
