"""`billing.subscription.activated` (émis par billing à l'activation/prolongation d'un abonnement)
alimente `AgencyRO.features` — sans quoi aucun entitlement de plan n'atteindrait le JWT."""
import os

os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

from app import models  # noqa: E402
from app.models import AgencyRO  # noqa: E402
from app.worker import _handle  # noqa: E402


def _session(monkeypatch, tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from semsar_events import OutboxBase
    engine = create_engine(f"sqlite:///{tmp_path}/t.db", future=True,
                           connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: s)
    return s


def test_subscription_activated_creates_agency_row_with_features(monkeypatch, tmp_path):
    s = _session(monkeypatch, tmp_path)
    _handle("billing.subscription.activated",
            {"subscription_id": 1, "agency_id": 42, "features": ["contracts", "design3d"]}, "b:1")
    ag = s.get(AgencyRO, 42)
    assert ag is not None
    assert set(ag.features) == {"contracts", "design3d"}
    # I7 : marquée synchronisée, pour que le repli de `_features` ne rappelle plus billing
    assert ag.features_synced_at is not None


def test_subscription_activated_updates_existing_agency_row(monkeypatch, tmp_path):
    s = _session(monkeypatch, tmp_path)
    s.add(AgencyRO(id=7, name="Agence", features=["rental"], max_seats=0, max_teams=0,
                   is_suspended=False, is_deleted=False))
    s.commit()

    _handle("billing.subscription.activated",
            {"subscription_id": 2, "agency_id": 7, "features": ["design3d"]}, "b:2")

    ag = s.get(AgencyRO, 7)
    assert ag.features == ["design3d"]
    assert ag.name == "Agence"  # les autres colonnes ne sont pas écrasées


def test_subscription_activated_is_idempotent(monkeypatch, tmp_path):
    s = _session(monkeypatch, tmp_path)
    _handle("billing.subscription.activated",
            {"subscription_id": 3, "agency_id": 9, "features": ["design3d"]}, "b:3")
    _handle("billing.subscription.activated",
            {"subscription_id": 3, "agency_id": 9, "features": ["design3d"]}, "b:3")
    assert s.query(AgencyRO).filter_by(id=9).count() == 1


def test_cancellation_reprojects_current_features(monkeypatch, tmp_path):
    """billing réémet `billing.subscription.activated` à la résiliation (accès conservé jusqu'à
    la fin de la période payée) : le worker doit resynchroniser `AgencyRO.features` sur ce que
    billing envoie, qu'il s'agisse d'un état inchangé ou (si billing en décidait autrement un
    jour) d'une liste vidée — le worker ne fait aucune hypothèse, il projette le payload reçu."""
    s = _session(monkeypatch, tmp_path)
    s.add(AgencyRO(id=13, name="Agence", features=["contracts", "design3d", "rental"],
                   max_seats=0, max_teams=0, is_suspended=False, is_deleted=False))
    s.commit()

    # Résiliation : accès conservé jusqu'à `end_date`, le plan (donc les features) est inchangé.
    _handle("billing.subscription.activated",
            {"subscription_id": 4, "agency_id": 13,
             "features": ["contracts", "design3d", "rental"]}, "b:4")
    ag = s.get(AgencyRO, 13)
    assert set(ag.features) == {"contracts", "design3d", "rental"}

    # Coupure effective (ex. fin de période) : le worker retire bien les features s'il en est
    # informé — vérifie qu'aucun résidu ne survit à une projection vide.
    _handle("billing.subscription.activated",
            {"subscription_id": 4, "agency_id": 13, "features": []}, "b:5")
    ag = s.get(AgencyRO, 13)
    assert ag.features == []
