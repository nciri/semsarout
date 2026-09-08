"""Repli auto-réparateur de `_features` : quand `AgencyRO.features` est vide (aucun événement
`billing.subscription.activated` n'a été rejoué pour un abonnement déjà actif), interroge billing
directement et n'échoue jamais le login (except large -> liste vide)."""
from app.auth import _features
from app.models import AgencyRO


def test_features_returns_local_projection_without_calling_billing(db_session, monkeypatch):
    db_session.add(AgencyRO(id=1, features=["contracts"], max_seats=0, max_teams=0,
                            is_suspended=False, is_deleted=False))
    db_session.commit()

    called = []

    def fake_features_of(agency_id):
        called.append(agency_id)
        return ["should-not-be-used"]

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of", fake_features_of)

    assert _features(db_session, 1) == ["contracts"]
    assert called == []


def test_features_falls_back_to_billing_when_projection_empty(db_session, monkeypatch):
    db_session.add(AgencyRO(id=2, features=[], max_seats=0, max_teams=0,
                            is_suspended=False, is_deleted=False))
    db_session.commit()

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of", lambda agency_id: ["design3d", "artisans"])

    result = _features(db_session, 2)
    assert set(result) == {"design3d", "artisans"}
    # auto-réparation : la projection locale est écrite pour les prochains logins
    ag = db_session.get(AgencyRO, 2)
    assert set(ag.features) == {"design3d", "artisans"}


def test_billing_client_features_of_swallows_errors(monkeypatch):
    """`billing_client.features_of` elle-même absorbe toute erreur (timeout, billing down,
    réponse inattendue) — jamais d'exception qui remonterait jusqu'au login."""
    from app import billing_client

    def boom(*a, **kw):
        raise RuntimeError("billing unreachable")

    monkeypatch.setattr(billing_client.httpx, "get", boom)
    assert billing_client.features_of(3) == []


def test_features_none_when_no_agency():
    assert _features(None, None) == []
