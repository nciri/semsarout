"""Rôle déclaré à l'inscription, et intention validée contre ce rôle.

Le rôle choisi au formulaire était écrasé par "buyer" en dur : un agent s'inscrivait et
ressortait acheteur. Les deux jeux d'intentions (prestations du catalogue pour un vendeur,
projet de recherche pour un acheteur) n'ont de sens que si ce rôle est réellement enregistré.
"""

_REG = {"email": "sara@ex.ma", "password": "secret123", "first_name": "Sara", "last_name": "K"}


def _register(client, **extra):
    return client.post("/auth/register", json={**_REG, **extra})


def test_account_role_agent_is_persisted(client):
    r = _register(client, account_role="agent")
    assert r.status_code == 201
    assert r.json()["user"]["account_role"] == "agent"


def test_account_role_defaults_to_buyer(client):
    assert _register(client).json()["user"]["account_role"] == "buyer"


def test_unknown_account_role_falls_back_to_buyer(client):
    assert _register(client, account_role="admin").json()["user"]["account_role"] == "buyer"


def test_buyer_intent_accepted_for_buyer(client):
    r = _register(client, account_role="buyer", interest="colocation")
    assert r.json()["user"]["interest"] == "colocation"


def test_seller_intent_accepted_for_agent(client):
    r = _register(client, account_role="agent", interest="vente")
    assert r.json()["user"]["interest"] == "vente"


def test_seller_intent_rejected_for_buyer(client):
    # Sans validation par rôle, un acheteur ressortirait avec « vendre mon bien » au compteur.
    r = _register(client, account_role="buyer", interest="vente")
    assert r.json()["user"]["interest"] is None


def test_buyer_intent_rejected_for_agent(client):
    r = _register(client, account_role="agent", interest="colocation")
    assert r.json()["user"]["interest"] is None


def test_autre_accepted_for_both_roles(client):
    assert _register(client, account_role="buyer", interest="autre").json()["user"]["interest"] == "autre"
    assert _register(client, email="b@ex.ma", account_role="agent",
                     interest="autre").json()["user"]["interest"] == "autre"
