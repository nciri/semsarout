"""Avis après séjour : dépôt, unicité, et publication en double aveugle."""
from datetime import datetime, timedelta

from app.models import REVIEW_BLIND_DAYS, Review
from tests.conftest import _set_principal

NOTES = {"respect": 5, "proprete": 4, "communication": 5, "conformite": 4}


def _avis(client, **extra):
    body = {"lease_id": "bail-1", "subject_id": 42, "criteria": NOTES, "comment": "Très correct"}
    body.update(extra)
    return client.post("/reviews", json=body)


def test_depot_puis_moyenne_des_notes(client):
    body = _avis(client).json()
    assert body["stars"] == 5      # moyenne 4,5 arrondie
    assert body["subject_id"] == 42
    assert body["author_id"] == 10


def test_un_seul_avis_par_sejour_et_par_auteur(client):
    assert _avis(client).status_code == 201
    assert _avis(client).status_code == 409


def test_notes_hors_bareme_ou_critere_manquant_refuses(client):
    assert _avis(client, criteria={**NOTES, "respect": 9}).status_code == 400
    assert _avis(client, criteria={"respect": 5}).status_code == 400
    assert _avis(client, subject_id=10).status_code == 400


def test_avis_recu_cache_tant_que_lautre_partie_na_pas_repondu(client, db_session):
    """Sinon le premier à écrire influencerait la note du second."""
    db_session.add(Review(tenant="m3a-l3achrane", lease_id="bail-7", author_id=42,
                          subject_id=10, criteria=NOTES, created_at=datetime.utcnow()))
    db_session.commit()
    assert client.get("/reviews/received").json() == {"reviews": []}

    _avis(client, lease_id="bail-7")      # je rends le mien : les deux deviennent visibles
    assert len(client.get("/reviews/received").json()["reviews"]) == 1


def test_avis_publie_seul_passe_le_delai(client, db_session):
    vieux = datetime.utcnow() - timedelta(days=REVIEW_BLIND_DAYS + 1)
    db_session.add(Review(tenant="m3a-l3achrane", lease_id="bail-9", author_id=42,
                          subject_id=10, criteria=NOTES, created_at=vieux))
    db_session.commit()
    assert len(client.get("/reviews/received").json()["reviews"]) == 1


def test_sejours_deja_evalues_et_authentification(client):
    _avis(client)
    assert client.get("/reviews/written").json() == {"lease_ids": ["bail-1"]}
    _set_principal(uid="")
    try:
        assert client.post("/reviews", json={}).status_code == 401
    finally:
        _set_principal()
