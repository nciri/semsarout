"""Vérification de la propriété de la cible d'un projet, à la création.

Sans elle, un agent de l'agence A pouvait créer un projet visant un bien de
l'agence B, le publier, et faire apparaître son plan sur la fiche publique de B —
que B ne pouvait pas retirer, `_access` la tenant à l'écart du projet de A.
"""
import pytest

from app import main, targets

# Capturée à l'import, donc avant la neutralisation autouse de conftest.
_REAL_TARGET_DENIED = main._target_denied


@pytest.fixture
def target(monkeypatch):
    """Rétablit la vraie vérification et simule le service qui fait autorité."""
    monkeypatch.setattr(main, "_target_denied", _REAL_TARGET_DENIED)

    def _serve(owner_id=None, agency_id=None, unavailable=False):
        def _fetch(target_type, target_id):
            if unavailable:
                raise targets.TargetUnavailable("listing injoignable")
            return {"owner_id": owner_id, "agency_id": agency_id}

        monkeypatch.setattr(targets, "fetch_owner", _fetch)

    return _serve


def _create(client, headers, **over):
    body = {"target_type": "property", "target_id": 42, "title": "Réno A"}
    body.update(over)
    return client.post("/design3d/projects", json=body, headers=headers)


def test_particulier_can_target_his_own_property(client, headers, target):
    target(owner_id=7)
    assert _create(client, headers(user_id=7)).status_code == 201


def test_particulier_cannot_target_someone_elses_property(client, headers, target):
    target(owner_id=99)
    assert _create(client, headers(user_id=7)).status_code == 403


def test_agency_member_can_target_a_property_of_his_agency(client, headers, target):
    # Le bien appartient nominalement à un collègue : c'est l'agence qui tranche.
    target(owner_id=1, agency_id=9)
    assert _create(client, headers(user_id=2, agency_id=9)).status_code == 201


def test_cross_agency_target_is_refused(client, headers, target):
    target(owner_id=1, agency_id=9)
    r = _create(client, headers(user_id=3, agency_id=10))
    assert r.status_code == 403
    assert r.json()["error_code"] == "target_denied"
    assert client.get("/design3d/projects", headers=headers(user_id=3, agency_id=10)).json()["projects"] == []


def test_unknown_target_is_refused(client, headers, target):
    target()
    r = _create(client, headers())
    assert r.status_code == 404
    assert r.json()["error_code"] == "target_denied"


def test_entitlement_403_is_not_a_target_denial(client, headers):
    """`require_feature("design3d")` (Depends) répond aussi 403 sur cette route,
    mais AVANT tout contrôle de cible — quand l'agence a simplement perdu son
    entitlement de plan. Ce refus-là est rejouable (réactivation d'abonnement),
    contrairement à celui de `_target_denied` : la réponse ne doit donc jamais
    porter `error_code: "target_denied"`, sous peine de faire croire au client
    (design3dSync.js) à un refus définitif et de le pousser à détruire un projet
    parfaitement récupérable.
    """
    r = _create(client, headers(features=()))
    assert r.status_code == 403
    assert "error_code" not in r.json()


def test_creation_is_refused_when_the_target_service_is_down(client, headers, target):
    target(unavailable=True)
    r = _create(client, headers(user_id=7))
    assert r.status_code == 503
    assert client.get("/design3d/projects", headers=headers(user_id=7)).json()["projects"] == []


def test_program_lot_of_another_agency_is_refused(client, headers, target):
    target(owner_id=1, agency_id=9)
    r = _create(client, headers(user_id=3, agency_id=10), target_type="program_lot", target_id=5)
    assert r.status_code == 403


def test_program_lot_of_own_agency_is_allowed(client, headers, target):
    target(owner_id=1, agency_id=9)
    r = _create(client, headers(user_id=2, agency_id=9), target_type="program_lot", target_id=5)
    assert r.status_code == 201


def test_unknown_target_type_has_no_authority_and_is_refused(client, headers):
    """`fetch_owner` refuse tout type sans service d'autorité — garde-fou si la
    liste fermée de `ProjectCreateIn` venait à s'élargir sans câbler la source."""
    with pytest.raises(targets.TargetUnavailable):
        targets.fetch_owner("unknown_type", 1)
