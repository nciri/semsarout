"""Mise en route : chaque étape se lit dans l'état réel, aucune case cochée à la main."""
import pytest
from fastapi.testclient import TestClient
from semsar_auth import Principal, get_principal

from app import onboarding, sources
from app.main import app

AGENCY = 4

FULL_AGENCY = {"id": AGENCY, "name": "Agence Anfa", "city": "Casablanca", "phone": "0522000000"}
SETTINGS = {"default_sale_commission_fee": 15000, "default_rental_commission_rate": 50}


def _state(**over):
    base = {"properties": [{"id": 1, "status": "published"}], "members": [{"id": 1}, {"id": 2}],
            "clients": [{"id": 1}], "visits": [{"id": 1}], "agency": FULL_AGENCY,
            "settings": SETTINGS, "subscription": {"status": "active"}}
    base.update(over)
    return base


def test_un_compte_complet_n_a_plus_rien_a_faire():
    out = onboarding.build(**_state())
    assert out["complete"] is True
    assert out["progress"] == 100
    assert out["next"] is None


def test_un_compte_vide_liste_tout_dans_l_ordre():
    out = onboarding.build(**_state(properties=[], members=[{"id": 1}], clients=[], visits=[],
                                    agency={"name": "Agence"}, settings={}, subscription=None))
    assert out["completed"] == 0
    assert out["next"] == "agency_profile"
    assert [s["key"] for s in out["steps"]] == list(onboarding.ORDER)
    assert all(s["href"].startswith("/") for s in out["steps"])


def test_un_bien_en_brouillon_ne_vaut_pas_publication():
    out = onboarding.build(**_state(properties=[{"id": 1, "status": "draft"}]))
    done = {s["key"]: s["done"] for s in out["steps"]}
    assert done["first_property"] is True
    assert done["publish_property"] is False
    assert out["next"] == "publish_property"


def test_un_profil_sans_ville_ni_telephone_reste_a_completer():
    out = onboarding.build(**_state(agency={"name": "Agence", "city": "", "phone": None}))
    assert {s["key"]: s["done"] for s in out["steps"]}["agency_profile"] is False


def test_l_agent_seul_doit_encore_inviter_son_equipe():
    out = onboarding.build(**_state(members=[{"id": 1}]))
    assert {s["key"]: s["done"] for s in out["steps"]}["invite_team"] is False


def test_un_bareme_de_commission_suffit():
    out = onboarding.build(**_state(settings={"default_rental_commission_rate": 50,
                                              "default_sale_commission_fee": 0}))
    assert {s["key"]: s["done"] for s in out["steps"]}["commission_settings"] is True


def test_la_route_agrege_les_services_proprietaires(monkeypatch):
    monkeypatch.setattr(sources, "properties", lambda aid: [{"id": 1, "status": "published"}])
    monkeypatch.setattr(sources, "members", lambda aid: [{"id": 1}])
    monkeypatch.setattr(sources, "clients", lambda aid: [])
    monkeypatch.setattr(sources, "visits", lambda aid: [])
    monkeypatch.setattr(sources, "agency_detail", lambda aid: {"agency": FULL_AGENCY})
    monkeypatch.setattr(sources, "agency_settings", lambda aid: SETTINGS)
    monkeypatch.setattr(sources, "subscription", lambda aid: {"status": "active"})
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=["agency_admin"], agency_id=AGENCY, is_superadmin=False,
        features=[], claims={})
    try:
        with TestClient(app) as client:
            body = client.get("/backoffice/onboarding").json()
    finally:
        app.dependency_overrides.clear()
    assert body["next"] == "invite_team"
    assert body["completed"] == 5


def test_sans_agence_la_route_refuse():
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=["user"], agency_id=None, is_superadmin=False, features=[], claims={})
    try:
        with TestClient(app) as client:
            assert client.get("/backoffice/onboarding").status_code == 403
    finally:
        app.dependency_overrides.clear()
