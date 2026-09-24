"""Blocages entre utilisateurs : liste, pose, retrait, et lecture interne par messaging."""
from tests.conftest import _set_principal


def test_liste_vide_puis_blocage_visible(client):
    assert client.get("/blocks").json() == {"blocks": []}
    assert client.post("/blocks", json={"blocked_id": 42}).status_code == 201
    blocks = client.get("/blocks").json()["blocks"]
    assert [b["blocked_id"] for b in blocks] == [42]


def test_bloquer_deux_fois_ne_cree_quun_blocage(client):
    client.post("/blocks", json={"blocked_id": 42})
    again = client.post("/blocks", json={"blocked_id": 42})
    assert again.status_code == 200
    assert len(client.get("/blocks").json()["blocks"]) == 1


def test_deblocage(client):
    client.post("/blocks", json={"blocked_id": 42})
    assert client.delete("/blocks/42").json() == {"blocked_id": 42, "blocked": False}
    assert client.get("/blocks").json() == {"blocks": []}


def test_refus_de_se_bloquer_soi_meme_et_sans_authentification(client):
    assert client.post("/blocks", json={"blocked_id": 10}).status_code == 400
    _set_principal(uid="")
    try:
        assert client.get("/blocks").status_code == 401
    finally:
        _set_principal()


def test_lecture_interne_dans_les_deux_sens(client, monkeypatch):
    """messaging demande « ces deux-là peuvent-ils se parler ? » sans savoir qui a bloqué qui."""
    from app.main import settings

    client.post("/blocks", json={"blocked_id": 42})
    headers = {"x-internal-token": settings.internal_token}
    assert client.get("/internal/blocks", params={"a": 10, "b": 42}, headers=headers).json() == {"blocked": True}
    assert client.get("/internal/blocks", params={"a": 42, "b": 10}, headers=headers).json() == {"blocked": True}
    assert client.get("/internal/blocks", params={"a": 10, "b": 99}, headers=headers).json() == {"blocked": False}
    assert client.get("/internal/blocks", params={"a": 10, "b": 42}).status_code == 403
