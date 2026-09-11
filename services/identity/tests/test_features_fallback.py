"""Repli auto-réparateur de `_features` : quand `AgencyRO.features` est vide (aucun événement
`billing.subscription.activated` n'a été rejoué pour un abonnement déjà actif), interroge billing
directement et n'échoue jamais le login (except large -> liste vide)."""
from datetime import datetime

from app.auth import _features
from app.models import AgencyRO


def test_features_returns_local_projection_without_calling_billing(db_session, monkeypatch):
    db_session.add(AgencyRO(id=1, features=["contracts"], features_synced_at=datetime.utcnow(),
                            max_seats=0, max_teams=0, is_suspended=False, is_deleted=False))
    db_session.commit()

    called = []

    def fake_features_of(agency_id):
        called.append(agency_id)
        return {"features": ["should-not-be-used"], "until": None}

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of", fake_features_of)

    assert _features(db_session, 1) == ["contracts"]
    assert called == []


def test_features_falls_back_to_billing_when_projection_empty(db_session, monkeypatch):
    db_session.add(AgencyRO(id=2, features=[], max_seats=0, max_teams=0,
                            is_suspended=False, is_deleted=False))
    db_session.commit()

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of",
                        lambda agency_id: {"features": ["design3d", "artisans"], "until": None})

    result = _features(db_session, 2)
    assert set(result) == {"design3d", "artisans"}
    # auto-réparation : la projection locale est écrite pour les prochains logins
    ag = db_session.get(AgencyRO, 2)
    assert set(ag.features) == {"design3d", "artisans"}
    # I7 : marquée comme synchronisée, pour que le prochain login ne rappelle plus billing
    assert ag.features_synced_at is not None


def test_features_does_not_call_billing_again_once_synced_even_if_empty(db_session, monkeypatch):
    """I7 : une agence dont le plan n'accorde légitimement AUCUNE feature (offre gratuite/
    starter) ne doit interroger billing qu'une seule fois — pas à chaque login et chaque
    /auth/refresh pour toujours. `features_synced_at` distingue « jamais synchronisée » de
    « synchronisée, et vide »."""
    db_session.add(AgencyRO(id=4, features=[], features_synced_at=datetime.utcnow(),
                            max_seats=0, max_teams=0, is_suspended=False, is_deleted=False))
    db_session.commit()

    called = []

    def fake_features_of(agency_id):
        called.append(agency_id)
        return {"features": ["should-not-be-called"], "until": None}

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of", fake_features_of)

    assert _features(db_session, 4) == []
    assert called == []


def test_billing_client_features_of_swallows_errors(monkeypatch):
    """`billing_client.features_of` elle-même absorbe toute erreur (timeout, billing down,
    réponse inattendue) — jamais d'exception qui remonterait jusqu'au login. Elle la SIGNALE
    néanmoins (`None`) au lieu de la déguiser en « aucune feature » (A2)."""
    from app import billing_client

    def boom(*a, **kw):
        raise RuntimeError("billing unreachable")

    monkeypatch.setattr(billing_client.httpx, "get", boom)
    assert billing_client.features_of(3) is None


def test_features_none_when_no_agency():
    assert _features(None, None) == []


def test_features_does_not_persist_when_billing_call_fails(db_session, monkeypatch):
    """A2 : `features_of` renvoyait `[]` de façon indistincte pour « pas d'abonnement »,
    « délai dépassé » et « erreur 500 », et `_features` persistait ce `[]` EN ESTAMPILLANT
    `features_synced_at` — éteignant définitivement le repli auto-réparateur qui existe
    précisément pour ce cas. Aggravé par l'ordre de deploy-remote.sh (le mesh redémarre AVANT
    que les migrations de facturation soient jouées) : toute agence qui se connecte pendant
    cette fenêtre restait marquée « synchronisée, zéro fonctionnalité ». Un appel qui n'a pas
    abouti ne doit RIEN persister."""
    db_session.add(AgencyRO(id=5, features=[], max_seats=0, max_teams=0,
                            is_suspended=False, is_deleted=False))
    db_session.commit()

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of", lambda agency_id: None)

    assert _features(db_session, 5) == []
    ag = db_session.get(AgencyRO, 5)
    assert ag.features_synced_at is None, "un appel en échec ne doit pas estampiller la synchro"
    assert list(ag.features) == []


def test_features_retries_billing_on_next_login_after_a_failure(db_session, monkeypatch):
    """Corollaire : le repli doit rappeler billing au login suivant, et se réparer dès que
    billing répond."""
    db_session.add(AgencyRO(id=6, features=[], max_seats=0, max_teams=0,
                            is_suspended=False, is_deleted=False))
    db_session.commit()

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of", lambda agency_id: None)
    assert _features(db_session, 6) == []

    monkeypatch.setattr(billing_client, "features_of",
                        lambda agency_id: {"features": ["design3d"], "until": None})
    assert _features(db_session, 6) == ["design3d"]
    ag = db_session.get(AgencyRO, 6)
    assert list(ag.features) == ["design3d"]
    assert ag.features_synced_at is not None


def test_features_persists_empty_list_when_call_succeeded(db_session, monkeypatch):
    """Symétrique : une liste vide RENVOYÉE par un appel abouti est légitime (offre gratuite/
    starter) et doit être estampillée — sinon on retombe sur l'appel HTTP synchrone à chaque
    login et chaque /auth/refresh, pour toujours (I7)."""
    db_session.add(AgencyRO(id=7, features=[], max_seats=0, max_teams=0,
                            is_suspended=False, is_deleted=False))
    db_session.commit()

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of",
                        lambda agency_id: {"features": [], "until": None})

    assert _features(db_session, 7) == []
    ag = db_session.get(AgencyRO, 7)
    assert ag.features_synced_at is not None


def test_billing_client_distinguishes_failure_from_legitimately_empty(monkeypatch):
    """`features_of` doit rendre l'échec DISCERNABLE (None), et ne pas le confondre avec une
    réponse aboutie sans feature (`[]`)."""
    from app import billing_client

    class _Resp:
        def __init__(self, status_code, payload=None):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

    monkeypatch.setattr(billing_client.httpx, "get", lambda *a, **kw: _Resp(500))
    assert billing_client.features_of(1) is None, "une 5xx est un échec, pas une absence de plan"

    monkeypatch.setattr(billing_client.httpx, "get",
                        lambda *a, **kw: _Resp(200, {"subscription": None}))
    assert billing_client.features_of(1) == {"features": [], "until": None}, \
        "« pas d'abonnement » est un appel abouti"

    monkeypatch.setattr(billing_client.httpx, "get",
                        lambda *a, **kw: _Resp(200, {"subscription": {"features": []}}))
    assert billing_client.features_of(1) == {"features": [], "until": None}, \
        "une offre sans feature est un appel abouti"


def test_features_consults_billing_when_marker_reset_even_with_non_empty_projection(db_session, monkeypatch):
    """A4 : le réamorçage du marqueur (identity/db/reset_features_sync_design3d.sql) est le seul
    chemin par lequel une agence Pro EXISTANTE peut recevoir une feature nouvellement ajoutée —
    aucun `billing.subscription.activated` n'est réémis par une migration d'entitlement. Il
    repose sur le fait que `features_synced_at IS NULL` redéclenche le repli MÊME quand
    `features` est déjà non vide : c'est ce que ce test verrouille."""
    db_session.add(AgencyRO(id=8, features=["rental"], features_synced_at=None,
                            max_seats=0, max_teams=0, is_suspended=False, is_deleted=False))
    db_session.commit()

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of",
                        lambda agency_id: {"features": ["rental", "design3d"], "until": None})

    assert set(_features(db_session, 8)) == {"rental", "design3d"}
    ag = db_session.get(AgencyRO, 8)
    assert set(ag.features) == {"rental", "design3d"}
    assert ag.features_synced_at is not None


def test_features_expirees_ne_sont_plus_servies_meme_si_billing_est_injoignable(db_session, monkeypatch):
    """A3, propriété de sûreté : une panne de facturation ne prolonge JAMAIS un droit échu.

    `features_until` dépassé signifie que la période payée est terminée. Servir la
    projection locale dans ce cas — ce que fait le repli quand billing ne répond pas
    (A2, pour ne jamais casser un login) — rendrait un abonnement résilié entitlé
    aussi longtemps que billing reste indisponible. La résiliation porte sur tout, le
    module payant compris : l'échéance l'emporte sur l'indisponibilité.
    """
    from datetime import timedelta
    db_session.add(AgencyRO(id=40, features=["design3d", "contracts"],
                            features_synced_at=datetime.utcnow() - timedelta(days=40),
                            features_until=datetime.utcnow() - timedelta(days=1),
                            max_seats=0, max_teams=0, is_suspended=False, is_deleted=False))
    db_session.commit()

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of", lambda agency_id: None)

    assert _features(db_session, 40) == []


def test_features_expirees_sont_remplacees_par_la_reponse_de_billing(db_session, monkeypatch):
    """L'échéance dépassée rend la projection non fiable : billing est réinterrogé une
    fois, et c'est SA réponse qui fait foi — c'est cet appel qui déclenche enfin la
    réconciliation côté billing (`_agency_sub` -> `_reconcile_expired`)."""
    from datetime import timedelta
    db_session.add(AgencyRO(id=41, features=["design3d"],
                            features_synced_at=datetime.utcnow() - timedelta(days=40),
                            features_until=datetime.utcnow() - timedelta(days=1),
                            max_seats=0, max_teams=0, is_suspended=False, is_deleted=False))
    db_session.commit()

    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of",
                        lambda agency_id: {"features": [], "until": None})

    assert _features(db_session, 41) == []
    ag = db_session.get(AgencyRO, 41)
    assert ag.features == []
    assert ag.features_until is None


def test_features_en_grace_valent_encore_et_ne_rappellent_pas_billing(db_session, monkeypatch):
    """Symétrique : une échéance À VENIR est une période payée en cours. Les droits
    valent, et le repli ne doit pas se redéclencher à chaque login (I7)."""
    from datetime import timedelta
    fin = datetime.utcnow() + timedelta(days=10)
    db_session.add(AgencyRO(id=42, features=["design3d"], features_synced_at=datetime.utcnow(),
                            features_until=fin, max_seats=0, max_teams=0,
                            is_suspended=False, is_deleted=False))
    db_session.commit()

    called = []
    from app import billing_client
    monkeypatch.setattr(billing_client, "features_of",
                        lambda agency_id: called.append(agency_id) or {"features": [], "until": None})

    assert _features(db_session, 42) == ["design3d"]
    assert called == []
