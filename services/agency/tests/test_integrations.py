"""Connecteurs ERP/CRM : rien n'est enregistré sans un appel réussi chez le fournisseur,
et aucun identifiant ne ressort par l'API.
"""
import pytest
from semsar_auth import Principal, get_principal

from app import integrations
from app.main import app
from app.models import Agency, IntegrationConnection
from app.worker import _push_to_crms

AGENCY_ID = 3
HUBSPOT = {"token": "jeton-test"}


class _Resp:
    """Réponse HTTP minimale : le test porte sur nos règles, pas sur httpx."""

    def __init__(self, status=200, payload=None, text=""):
        self.status_code = status
        self._payload = payload if payload is not None else {}
        self.text = text

    def json(self):
        return self._payload


@pytest.fixture
def agence(db_session):
    db_session.add(Agency(id=AGENCY_ID, name="Immobilière Anfa", slug="anfa",
                          email="contact@anfa.ma", settings={}))
    db_session.commit()
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=["agency_admin"], agency_id=AGENCY_ID, is_superadmin=False,
        features=[], claims={})
    yield
    app.dependency_overrides.pop(get_principal, None)


def _fake_http(monkeypatch, handler):
    calls = []

    def request(method, url, **kw):
        calls.append({"method": method, "url": url, **kw})
        return handler(method, url, **kw)

    monkeypatch.setattr(integrations.httpx, "request", request)
    return calls


def test_les_cinq_fournisseurs_sont_proposes(client, agence):
    body = client.get("/backoffice/integrations").json()["integrations"]
    assert [i["provider"] for i in body] == ["odoo", "sap", "salesforce", "hubspot", "zoho"]
    assert all(i["status"] == "not_connected" for i in body)
    # SAP n'envoie pas de contact : l'écran doit pouvoir le dire au lieu de le promettre.
    assert {i["provider"]: i["supports_contact_sync"] for i in body}["sap"] is False


def test_une_connexion_refusee_nest_pas_enregistree(client, agence, db_session, monkeypatch):
    _fake_http(monkeypatch, lambda *a, **k: _Resp(401))
    resp = client.put("/backoffice/integrations/hubspot", json=HUBSPOT)

    assert resp.status_code == 400
    assert "refus" in resp.json()["error"].lower()
    assert db_session.query(IntegrationConnection).count() == 0


def test_un_champ_obligatoire_manquant_est_dit_avant_tout_appel(client, agence, monkeypatch):
    calls = _fake_http(monkeypatch, lambda *a, **k: _Resp(200))
    resp = client.put("/backoffice/integrations/odoo", json={"url": "https://erp.anfa.ma"})
    assert resp.status_code == 400 and "db" in resp.json()["error"]
    assert calls == []


def test_connexion_reussie_puis_etat_lu_sans_identifiants(client, agence, db_session, monkeypatch):
    _fake_http(monkeypatch, lambda *a, **k: _Resp(200, {"results": []}))
    body = client.put("/backoffice/integrations/hubspot", json=HUBSPOT).json()

    assert body["status"] == "connected"
    assert body["account_label"] == "HubSpot · jeton valide"
    assert "credentials" not in body and "token" not in body

    listed = {i["provider"]: i for i in client.get("/backoffice/integrations").json()["integrations"]}
    assert listed["hubspot"]["status"] == "connected"
    assert "jeton-test" not in str(listed)          # aucun secret ne sort de l'API
    stored = db_session.query(IntegrationConnection).one()
    assert stored.credentials == HUBSPOT            # il reste dans ce service


def test_le_test_signale_un_jeton_devenu_invalide(client, agence, monkeypatch):
    _fake_http(monkeypatch, lambda *a, **k: _Resp(200, {"results": []}))
    client.put("/backoffice/integrations/hubspot", json=HUBSPOT)

    _fake_http(monkeypatch, lambda *a, **k: _Resp(401))
    body = client.post("/backoffice/integrations/hubspot/test").json()
    assert body["status"] == "error"
    assert body["last_error"] == "Identifiants refusés par le fournisseur."


def test_la_deconnexion_emporte_les_identifiants(client, agence, db_session, monkeypatch):
    _fake_http(monkeypatch, lambda *a, **k: _Resp(200, {"results": []}))
    client.put("/backoffice/integrations/hubspot", json=HUBSPOT)

    assert client.delete("/backoffice/integrations/hubspot").status_code == 200
    assert db_session.query(IntegrationConnection).count() == 0


def test_un_fournisseur_inconnu_est_refuse(client, agence):
    assert client.put("/backoffice/integrations/pipedrive", json={}).status_code == 404


def test_odoo_sauthentifie_avant_de_creer_le_contact(monkeypatch):
    """Le mot de passe sert deux appels : l'authentification puis `res.partner/create`."""
    appels = []

    def handler(method, url, **kw):
        appels.append(kw["json"]["params"]["method"])
        return _Resp(200, {"result": 7})

    _fake_http(monkeypatch, handler)
    integrations.push_contact("odoo", {"url": "https://erp.anfa.ma", "db": "anfa",
                                       "login": "admin", "password": "x"},
                              {"name": "Rachid Kettani", "email": "r@anfa.ma"})
    assert appels == ["login", "execute_kw"]


def test_le_client_cree_part_vers_les_crm_connectes(db_session, monkeypatch):
    db_session.add(IntegrationConnection(agency_id=AGENCY_ID, provider="hubspot",
                                         status="connected", credentials=HUBSPOT))
    db_session.add(IntegrationConnection(
        agency_id=AGENCY_ID, provider="sap", status="connected",
        credentials={"base_url": "https://sap.anfa.ma", "token": "t"}))
    db_session.commit()
    calls = _fake_http(monkeypatch, lambda *a, **k: _Resp(201, {"id": "1"}))

    _push_to_crms(db_session, {"id": 1, "agency_id": AGENCY_ID, "first_name": "Rachid",
                               "last_name": "Kettani", "email": "r@anfa.ma", "city": "Casablanca"})

    assert [c["url"] for c in calls] == ["https://api.hubapi.com/crm/v3/objects/contacts"]
    rows = {c.provider: c for c in db_session.query(IntegrationConnection).all()}
    assert rows["hubspot"].synced_count == 1 and rows["hubspot"].last_sync_at is not None
    assert (rows["sap"].synced_count or 0) == 0          # SAP n'envoie pas de contact


def test_un_crm_en_panne_ne_bloque_ni_le_message_ni_les_autres(db_session, monkeypatch):
    db_session.add(IntegrationConnection(agency_id=AGENCY_ID, provider="hubspot",
                                         status="connected", credentials=HUBSPOT))
    db_session.commit()
    _fake_http(monkeypatch, lambda *a, **k: _Resp(500, text="boom"))

    _push_to_crms(db_session, {"id": 1, "agency_id": AGENCY_ID, "first_name": "Rachid",
                               "last_name": "Kettani", "email": "r@anfa.ma"})

    conn = db_session.query(IntegrationConnection).one()
    assert conn.status == "error" and "500" in conn.last_error
    assert (conn.synced_count or 0) == 0
