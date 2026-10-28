"""Ménage de rotation : génération depuis les départs, avancement, rapports, cloisonnement."""
from datetime import datetime, timedelta

import pytest

from app.models import CleaningTask, PropertyRO, StayManagerReservation
from tests.conftest import AGENCY

PROPERTY = 42
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


class _FakeStore:
    """Objet-store en mémoire : le test porte sur les routes, pas sur MinIO."""

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
def seeded(db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Riad Médina", reference="R-1"))
    db_session.commit()
    return db_session


def _stay(db, *, days=1, agency_id=AGENCY, status="confirmed"):
    now = datetime.utcnow()
    res = StayManagerReservation(
        agency_id=agency_id, property_id=PROPERTY, source="ical", platform="airbnb",
        check_in=now + timedelta(days=days), check_out=now + timedelta(days=days + 3),
        nights=3, guest_name="Salma Bennani", status=status, synced_at=now)
    db.add(res)
    db.commit()
    return res


def test_un_depart_donne_un_menage(client, seeded):
    stay = _stay(seeded, days=1)
    tasks = client.get("/backoffice/sejours/menage").json()["tasks"]
    assert len(tasks) == 1
    assert tasks[0]["property_title"] == "Riad Médina"
    assert tasks[0]["reservation_id"] == stay.id
    assert tasks[0]["scheduled_date"].startswith(stay.check_out.date().isoformat())
    assert tasks[0]["status"] == "pending"


def test_le_menage_n_est_cree_qu_une_fois(client, seeded):
    _stay(seeded, days=1)
    client.get("/backoffice/sejours/menage")
    client.get("/backoffice/sejours/menage")
    assert seeded.query(CleaningTask).count() == 1


def test_un_sejour_annule_ne_donne_pas_de_menage(client, seeded):
    _stay(seeded, days=1, status="cancelled")
    assert client.get("/backoffice/sejours/menage").json()["tasks"] == []


def test_un_depart_ancien_est_ignore(client, seeded):
    _stay(seeded, days=-30)
    assert client.get("/backoffice/sejours/menage").json()["tasks"] == []


def test_avancement_zones_et_cloture(client, seeded):
    _stay(seeded, days=1)
    task_id = client.get("/backoffice/sejours/menage").json()["tasks"][0]["id"]

    started = client.patch(f"/backoffice/sejours/menage/{task_id}",
                           json={"status": "in_progress", "zones_done": ["cuisine", "chambres"]}).json()["task"]
    assert started["started_at"] is not None
    # Ordre stable (celui des zones), pas celui de la saisie.
    assert started["zones_done"] == ["chambres", "cuisine"]

    done = client.patch(f"/backoffice/sejours/menage/{task_id}",
                        json={"status": "done", "assigned_to_id": 7}).json()["task"]
    assert (done["status"], done["assigned_to_id"]) == ("done", 7)
    assert done["completed_at"] is not None


def test_zone_et_statut_inconnus_refuses(client, seeded):
    _stay(seeded, days=1)
    task_id = client.get("/backoffice/sejours/menage").json()["tasks"][0]["id"]
    assert client.patch(f"/backoffice/sejours/menage/{task_id}",
                        json={"zones_done": ["piscine"]}).status_code == 400
    assert client.patch(f"/backoffice/sejours/menage/{task_id}",
                        json={"status": "presque"}).status_code == 400


def test_menage_hors_sejour_ajoute_a_la_main(client, seeded):
    created = client.post("/backoffice/sejours/menage",
                          json={"property_id": PROPERTY, "scheduled_date": "2026-12-01",
                                "notes": "Après travaux"})
    assert created.status_code == 201
    assert created.json()["task"]["reservation_id"] is None
    assert client.post("/backoffice/sejours/menage",
                       json={"property_id": PROPERTY, "scheduled_date": "demain"}).status_code == 400
    assert client.post("/backoffice/sejours/menage",
                       json={"property_id": 999, "scheduled_date": "2026-12-01"}).status_code == 400


def test_rapport_urgent_compte_jusqu_a_sa_lecture(client, seeded):
    _stay(seeded, days=1)
    task_id = client.get("/backoffice/sejours/menage").json()["tasks"][0]["id"]
    report = client.post(f"/backoffice/sejours/menage/{task_id}/rapports",
                         json={"kind": "issue", "category": "plomberie",
                               "text_note": "Fuite sous l'évier", "is_urgent": True})
    assert report.status_code == 201
    report_id = report.json()["report"]["id"]
    assert client.get("/backoffice/sejours/menage").json()["urgent_reports"] == 1

    assert client.post(f"/backoffice/sejours/menage/rapports/{report_id}/vu").status_code == 200
    assert client.get("/backoffice/sejours/menage").json()["urgent_reports"] == 0


def test_rapport_vide_ou_de_type_inconnu_refuse(client, seeded):
    _stay(seeded, days=1)
    task_id = client.get("/backoffice/sejours/menage").json()["tasks"][0]["id"]
    assert client.post(f"/backoffice/sejours/menage/{task_id}/rapports",
                       json={"kind": "issue", "text_note": "   "}).status_code == 400
    assert client.post(f"/backoffice/sejours/menage/{task_id}/rapports",
                       json={"kind": "ragot", "text_note": "x"}).status_code == 400


def test_photo_d_un_rapport_deposee_et_relue(client, seeded, _storage):
    _stay(seeded, days=1)
    task_id = client.get("/backoffice/sejours/menage").json()["tasks"][0]["id"]
    report_id = client.post(f"/backoffice/sejours/menage/{task_id}/rapports",
                            json={"kind": "issue", "text_note": "Carreau fêlé"}).json()["report"]["id"]

    posted = client.post(f"/backoffice/sejours/menage/rapports/{report_id}/photos?filename=carreau.jpg",
                         content=JPEG, headers={"content-type": "image/jpeg"})
    assert posted.status_code == 201
    photo_id = posted.json()["photo"]["id"]

    got = client.get(f"/backoffice/sejours/menage/photos/{photo_id}")
    assert got.status_code == 200
    assert got.content == JPEG
    assert got.headers["x-content-type-options"] == "nosniff"

    detail = client.get(f"/backoffice/sejours/menage/{task_id}").json()["task"]
    assert detail["reports"][0]["photos"][0]["filename"] == "carreau.jpg"


def test_format_de_photo_non_inerte_refuse(client, seeded):
    _stay(seeded, days=1)
    task_id = client.get("/backoffice/sejours/menage").json()["tasks"][0]["id"]
    report_id = client.post(f"/backoffice/sejours/menage/{task_id}/rapports",
                            json={"kind": "note", "text_note": "ok"}).json()["report"]["id"]
    refused = client.post(f"/backoffice/sejours/menage/rapports/{report_id}/photos",
                          content=b"<script>alert(1)</script>",
                          headers={"content-type": "text/html"})
    assert refused.status_code == 400


def test_menage_d_une_autre_agence_inaccessible(client, seeded, db_session):
    db_session.add(CleaningTask(agency_id=AGENCY + 1, property_id=PROPERTY,
                                scheduled_date=datetime.utcnow().date()))
    db_session.commit()
    assert client.get("/backoffice/sejours/menage").json()["tasks"] == []
    assert client.get("/backoffice/sejours/menage/1").status_code == 404
    assert client.patch("/backoffice/sejours/menage/1", json={"status": "done"}).status_code == 404


def test_menage_en_retard_est_signale(client, seeded):
    _stay(seeded, days=-3)   # départ il y a 3 jours : hors fenêtre de génération
    seeded.add(CleaningTask(agency_id=AGENCY, property_id=PROPERTY,
                            scheduled_date=datetime.utcnow().date() - timedelta(days=2)))
    seeded.commit()
    assert client.get("/backoffice/sejours/menage").json()["late"] == 1
