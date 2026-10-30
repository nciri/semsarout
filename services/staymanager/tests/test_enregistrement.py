"""Enregistrement du voyageur : lien privé, occupants déclarés, pièce, examen par l'agence."""
from datetime import datetime, timedelta

import pytest

from app import checkin
from app.models import StayCheckinLink, StayGuest, StayManagerReservation, PropertyRO
from tests.conftest import AGENCY

PROPERTY = 42
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 32


class _FakeStore:
    def __init__(self):
        self.objects = {}

    def put(self, key, body, content_type):
        self.objects[key] = (body, content_type)

    def get(self, key):
        return self.objects[key][0]


@pytest.fixture(autouse=True)
def _storage(monkeypatch):
    from app import storage
    store = _FakeStore()
    monkeypatch.setattr(storage, "photos_storage", lambda: store)
    return store


@pytest.fixture
def stay(db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Riad Médina", reference="R-1"))
    now = datetime.utcnow()
    res = StayManagerReservation(
        agency_id=AGENCY, property_id=PROPERTY, source="ical", platform="airbnb",
        check_in=now + timedelta(days=2), check_out=now + timedelta(days=5), nights=3,
        guest_name="Salma Bennani", guest_count=3, status="confirmed", synced_at=now)
    db_session.add(res)
    db_session.commit()
    return res


def _link(client, stay_id):
    r = client.post(f"/backoffice/sejours/{stay_id}/enregistrement")
    assert r.status_code == 201
    return r.json()["link"]["token"]


def test_le_lien_est_rendu_une_fois_et_jamais_stocke_en_clair(client, stay, db_session):
    token = _link(client, stay.id)
    row = db_session.query(StayCheckinLink).one()
    assert row.token_hash != token
    assert len(row.token_hash) == 64
    # La relecture côté agence ne redonne pas le jeton.
    assert "token" not in client.get(f"/backoffice/sejours/{stay.id}/enregistrement").json()["link"]


def test_le_voyageur_voit_son_sejour_et_rien_de_plus(client, stay):
    token = _link(client, stay.id)
    view = client.get(f"/sejours/enregistrement/{token}").json()
    assert view["stay"]["property_title"] == "Riad Médina"
    assert view["stay"]["expected_guests"] == 3
    assert view["guests"] == []
    assert "agency_id" not in view["stay"]


def test_jeton_inconnu_ou_expire_refuse(client, stay, db_session):
    assert client.get("/sejours/enregistrement/jeton-invente").status_code == 404
    token = _link(client, stay.id)
    db_session.query(StayCheckinLink).one().expires_at = datetime.utcnow() - timedelta(hours=1)
    db_session.commit()
    assert client.get(f"/sejours/enregistrement/{token}").status_code == 410


def test_le_premier_occupant_declare_est_le_voyageur_principal(client, stay):
    token = _link(client, stay.id)
    first = client.post(f"/sejours/enregistrement/{token}/voyageurs",
                        json={"full_name": "Salma Bennani", "document_type": "cin",
                              "document_number": "AB12345", "nationality": "Maroc",
                              "birth_date": "1992-04-18"})
    assert first.status_code == 201
    assert first.json()["guest"]["is_lead"] is True
    second = client.post(f"/sejours/enregistrement/{token}/voyageurs",
                         json={"full_name": "Youssef Bennani"})
    assert second.json()["guest"]["is_lead"] is False


def test_saisies_invalides_refusees(client, stay):
    token = _link(client, stay.id)
    base = f"/sejours/enregistrement/{token}/voyageurs"
    assert client.post(base, json={"full_name": " "}).status_code == 400
    assert client.post(base, json={"full_name": "Salma", "document_type": "carte_fidelite"}).status_code == 400
    assert client.post(base, json={"full_name": "Salma", "birth_date": "hier"}).status_code == 400


def test_nombre_d_occupants_borne(client, stay):
    token = _link(client, stay.id)
    for i in range(checkin.MAX_GUESTS):
        assert client.post(f"/sejours/enregistrement/{token}/voyageurs",
                           json={"full_name": f"Occupant {i}"}).status_code == 201
    assert client.post(f"/sejours/enregistrement/{token}/voyageurs",
                       json={"full_name": "Un de trop"}).status_code == 400


def test_piece_deposee_par_le_voyageur_et_relue_par_l_agence(client, stay):
    token = _link(client, stay.id)
    guest_id = client.post(f"/sejours/enregistrement/{token}/voyageurs",
                           json={"full_name": "Salma Bennani"}).json()["guest"]["id"]
    posted = client.post(f"/sejours/enregistrement/{token}/voyageurs/{guest_id}/piece?filename=cin.jpg",
                         content=JPEG, headers={"content-type": "image/jpeg"})
    assert posted.status_code == 201
    doc_id = posted.json()["document"]["id"]

    got = client.get(f"/backoffice/sejours/voyageurs/pieces/{doc_id}")
    assert got.status_code == 200
    assert got.content == JPEG
    assert got.headers["x-content-type-options"] == "nosniff"


def test_format_de_piece_non_inerte_refuse(client, stay):
    token = _link(client, stay.id)
    guest_id = client.post(f"/sejours/enregistrement/{token}/voyageurs",
                           json={"full_name": "Salma"}).json()["guest"]["id"]
    refused = client.post(f"/sejours/enregistrement/{token}/voyageurs/{guest_id}/piece",
                          content=b"<script>alert(1)</script>",
                          headers={"content-type": "text/html"})
    assert refused.status_code == 400


def test_piece_trop_lourde_refusee(client, stay):
    token = _link(client, stay.id)
    guest_id = client.post(f"/sejours/enregistrement/{token}/voyageurs",
                           json={"full_name": "Salma"}).json()["guest"]["id"]
    refused = client.post(f"/sejours/enregistrement/{token}/voyageurs/{guest_id}/piece",
                          content=iter([b"0" * (checkin.MAX_DOC_SIZE + 1)]),
                          headers={"content-type": "image/jpeg"})
    assert refused.status_code == 400


def test_validation_exige_un_occupant_et_une_piece(client, stay):
    token = _link(client, stay.id)
    assert client.post(f"/sejours/enregistrement/{token}/valider").status_code == 400
    guest_id = client.post(f"/sejours/enregistrement/{token}/voyageurs",
                           json={"full_name": "Salma"}).json()["guest"]["id"]
    assert client.post(f"/sejours/enregistrement/{token}/valider").status_code == 400
    client.post(f"/sejours/enregistrement/{token}/voyageurs/{guest_id}/piece",
                content=JPEG, headers={"content-type": "image/jpeg"})
    done = client.post(f"/sejours/enregistrement/{token}/valider")
    assert done.json()["link"]["status"] == "submitted"


def test_verdict_de_l_agence_et_reexamen_apres_nouvelle_piece(client, stay):
    token = _link(client, stay.id)
    guest_id = client.post(f"/sejours/enregistrement/{token}/voyageurs",
                           json={"full_name": "Salma"}).json()["guest"]["id"]
    refused = client.patch(f"/backoffice/sejours/voyageurs/{guest_id}",
                           json={"status": "rejected", "review_note": "Photo illisible"})
    assert refused.json()["guest"]["status"] == "rejected"
    assert client.patch(f"/backoffice/sejours/voyageurs/{guest_id}",
                        json={"status": "peut-etre"}).status_code == 400

    client.post(f"/sejours/enregistrement/{token}/voyageurs/{guest_id}/piece",
                content=JPEG, headers={"content-type": "image/jpeg"})
    state = client.get(f"/backoffice/sejours/{stay.id}/enregistrement").json()
    assert state["guests"][0]["status"] == "declared"
    assert state["guests"][0]["review_note"] is None


def test_renouveler_le_lien_invalide_l_ancien(client, stay):
    old = _link(client, stay.id)
    new = _link(client, stay.id)
    assert old != new
    assert client.get(f"/sejours/enregistrement/{old}").status_code == 404
    assert client.get(f"/sejours/enregistrement/{new}").status_code == 200


def test_sejour_d_une_autre_agence_inaccessible(client, db_session):
    other = StayManagerReservation(
        agency_id=AGENCY + 1, property_id=PROPERTY, source="ical", platform="airbnb",
        check_in=datetime.utcnow(), check_out=datetime.utcnow() + timedelta(days=2),
        nights=2, status="confirmed")
    db_session.add(other)
    db_session.commit()
    assert client.post(f"/backoffice/sejours/{other.id}/enregistrement").status_code == 404
    assert client.get(f"/backoffice/sejours/{other.id}/enregistrement").status_code == 404


def test_occupant_d_une_autre_agence_non_examinable(client, db_session):
    other = StayManagerReservation(
        agency_id=AGENCY + 1, property_id=PROPERTY, source="ical", platform="airbnb",
        check_in=datetime.utcnow(), check_out=datetime.utcnow() + timedelta(days=2),
        nights=2, status="confirmed")
    db_session.add(other)
    db_session.commit()
    db_session.add(StayGuest(reservation_id=other.id, full_name="Inconnu"))
    db_session.commit()
    guest_id = db_session.query(StayGuest).one().id
    assert client.patch(f"/backoffice/sejours/voyageurs/{guest_id}",
                        json={"status": "validated"}).status_code == 404


def test_nom_de_fichier_assaini_et_nombre_de_pieces_borne(client, stay):
    token = _link(client, stay.id)
    guest_id = client.post(f"/sejours/enregistrement/{token}/voyageurs",
                           json={"full_name": "Salma"}).json()["guest"]["id"]
    path = f"/sejours/enregistrement/{token}/voyageurs/{guest_id}/piece"
    hostile = client.post(f'{path}?filename=cin";%0d%0aSet-Cookie:%20a=b',
                          content=JPEG, headers={"content-type": "image/jpeg"})
    assert hostile.status_code == 201
    doc_id = hostile.json()["document"]["id"]
    got = client.get(f"/backoffice/sejours/voyageurs/pieces/{doc_id}")
    disposition = got.headers["content-disposition"]
    # Les caractères qui injecteraient un en-tête ont disparu ; le nom reste cité.
    assert "\n" not in disposition and "\r" not in disposition and ";" not in disposition[12:]
    assert disposition.startswith('attachment; filename="') and disposition.endswith('"')

    for _ in range(checkin.MAX_DOCS_PER_GUEST - 1):
        assert client.post(path, content=JPEG, headers={"content-type": "image/jpeg"}).status_code == 201
    assert client.post(path, content=JPEG, headers={"content-type": "image/jpeg"}).status_code == 400
