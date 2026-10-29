"""Séjours courte durée : lecture des calendriers, rapprochement, conflits, cloisonnement.

Les calendriers sont ceux que publient réellement les plateformes — Airbnb ne donne pas le
nom du voyageur, Booking le met dans le résumé.
"""
from datetime import datetime, timedelta

import pytest

from app import ical, stays
from app.models import IcalSource, PropertyRO, StayManagerReservation
from tests.conftest import AGENCY

PROPERTY = 42
URL = "https://calendrier.example.com/anfa.ics"


def _ics(*events: str) -> str:
    body = "".join(events)
    return f"BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Test//FR\n{body}END:VCALENDAR\n"


def _event(uid: str, start: str, end: str, summary: str, description: str = "") -> str:
    return (f"BEGIN:VEVENT\nUID:{uid}\nDTSTART;VALUE=DATE:{start}\nDTEND;VALUE=DATE:{end}\n"
            f"SUMMARY:{summary}\nDESCRIPTION:{description}\nEND:VEVENT\n")


AIRBNB = _ics(
    _event("airbnb-1", "20261105", "20261108", "Reserved",
           "Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABCD1234 "
           "Phone Number (Last 4 Digits): 6789"),
    _event("airbnb-2", "20261120", "20261122", "Airbnb (Not available)"),
)


@pytest.fixture(autouse=True)
def _dns_public(monkeypatch):
    monkeypatch.setattr(ical.socket, "getaddrinfo",
                        lambda host, *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))])


def _feed(monkeypatch, text, status=200):
    class _Resp:
        def __init__(self):
            self.text = text
            self.status_code = status
            self.content = text.encode()

    monkeypatch.setattr(ical.httpx, "get", lambda *a, **k: _Resp())


@pytest.fixture
def bien(db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Riad Médina", reference="P-42"))
    db_session.commit()


# ---- Lecture d'un calendrier ------------------------------------------------------------

def test_un_sejour_airbnb_donne_son_code_et_son_telephone_partiel():
    found = ical.parse(AIRBNB, "airbnb")
    assert [s["status"] for s in found] == ["confirmed", "blocked"]
    sejour = found[0]
    assert sejour["external_id"] == "HMABCD1234"     # le code de confirmation, pas l'UID
    assert sejour["phone_partial"] == "****6789"
    assert sejour["guest_name"] is None              # Airbnb ne publie pas le nom
    assert sejour["check_in"] == datetime(2026, 11, 5)
    assert sejour["nights"] == 3


def test_booking_et_vrbo_publient_le_nom_du_voyageur():
    booking = ical.parse(_ics(_event("b-1", "20261201", "20261204", "CLOSED - Salma Bennani")), "booking")
    vrbo = ical.parse(_ics(_event("v-1", "20261201", "20261204", "Reserved - Jane Doe")), "vrbo")
    assert booking[0]["guest_name"] == "Salma Bennani"
    assert vrbo[0]["guest_name"] == "Jane Doe"


def test_booking_distingue_une_reservation_dun_blocage(monkeypatch):
    """« CLOSED - Nom » est une réservation ; « CLOSED - Not available » un blocage."""
    reserve = ical.parse(_ics(_event("b-1", "20261201", "20261204", "CLOSED - Salma Bennani")), "booking")
    bloque = ical.parse(_ics(_event("b-2", "20261210", "20261212", "CLOSED - Not available")), "booking")
    assert reserve[0]["status"] == "confirmed"
    assert bloque[0]["status"] == "blocked"


def test_un_calendrier_illisible_est_dit_tel_quel():
    with pytest.raises(ical.IcalError):
        ical.parse("ceci n'est pas un calendrier", "airbnb")


def test_une_url_interne_ou_en_clair_est_refusee(monkeypatch):
    with pytest.raises(ical.IcalError):
        ical.safe_ical_url("http://calendrier.example.com/a.ics")
    monkeypatch.setattr(ical.socket, "getaddrinfo",
                        lambda host, *a, **k: [(2, 1, 6, "", ("127.0.0.1", 443))])
    with pytest.raises(ical.IcalError):
        ical.safe_ical_url("https://interne.example.com/a.ics")


# ---- Synchronisation --------------------------------------------------------------------

def test_le_calendrier_ajoute_puis_synchronise_aussitot(client, bien, db_session, monkeypatch):
    _feed(monkeypatch, AIRBNB)
    resp = client.post("/backoffice/sejours/calendriers",
                       json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})

    assert resp.status_code == 201
    body = resp.json()
    assert body["source"]["status"] == "ok"
    assert body["sync"] == {"created": 2, "updated": 0, "cancelled": 0, "conflicts": 0, "total": 2}
    assert db_session.query(StayManagerReservation).count() == 2


def test_une_resynchronisation_rapproche_au_lieu_de_dupliquer(client, bien, db_session, monkeypatch):
    _feed(monkeypatch, AIRBNB)
    client.post("/backoffice/sejours/calendriers",
                json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})
    source_id = db_session.query(IcalSource).one().id

    result = client.post(f"/backoffice/sejours/calendriers/{source_id}/sync").json()["sync"]
    assert result == {"created": 0, "updated": 2, "cancelled": 0, "conflicts": 0, "total": 2}
    assert db_session.query(StayManagerReservation).count() == 2


def test_un_sejour_disparu_du_calendrier_est_annule_pas_supprime(client, bien, db_session, monkeypatch):
    _feed(monkeypatch, AIRBNB)
    client.post("/backoffice/sejours/calendriers",
                json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})
    source_id = db_session.query(IcalSource).one().id

    _feed(monkeypatch, _ics())          # la plateforme ne publie plus rien
    result = client.post(f"/backoffice/sejours/calendriers/{source_id}/sync").json()["sync"]

    assert result["cancelled"] == 2
    statuts = {r.status for r in db_session.query(StayManagerReservation).all()}
    assert statuts == {"cancelled"} and db_session.query(StayManagerReservation).count() == 2


def test_un_calendrier_en_panne_est_signale_sans_perdre_lhistorique(client, bien, db_session, monkeypatch):
    _feed(monkeypatch, AIRBNB)
    client.post("/backoffice/sejours/calendriers",
                json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})
    source_id = db_session.query(IcalSource).one().id

    _feed(monkeypatch, "", status=503)
    resp = client.post(f"/backoffice/sejours/calendriers/{source_id}/sync")

    assert resp.status_code == 400 and "503" in resp.json()["error"]
    db_session.expire_all()
    src = db_session.get(IcalSource, source_id)
    assert src.status == "error" and "503" in src.last_error
    assert db_session.query(StayManagerReservation).count() == 2


def test_deux_plateformes_sur_le_meme_bien_revelent_la_double_reservation(client, bien, monkeypatch):
    """C'est tout l'intérêt de croiser les calendriers : Airbnb ignore Booking."""
    _feed(monkeypatch, AIRBNB)
    client.post("/backoffice/sejours/calendriers",
                json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})

    _feed(monkeypatch, _ics(_event("b-1", "20261106", "20261109", "CLOSED - Salma Bennani")))
    result = client.post("/backoffice/sejours/calendriers",
                         json={"property_id": PROPERTY, "platform": "booking",
                               "ical_url": "https://calendrier.example.com/booking.ics"}).json()

    assert result["sync"]["conflicts"] == 2
    assert client.get("/backoffice/sejours").json()["conflicts"] == 2


def test_un_depart_le_jour_dune_arrivee_nest_pas_un_conflit(client, bien, monkeypatch):
    _feed(monkeypatch, _ics(_event("a", "20261105", "20261108", "Reserved")))
    client.post("/backoffice/sejours/calendriers",
                json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})
    _feed(monkeypatch, _ics(_event("b", "20261108", "20261111", "CLOSED - Salma")))
    result = client.post("/backoffice/sejours/calendriers",
                         json={"property_id": PROPERTY, "platform": "booking",
                               "ical_url": "https://calendrier.example.com/b.ics"}).json()
    assert result["sync"]["conflicts"] == 0


# ---- Garde-fous et lecture --------------------------------------------------------------

def test_un_bien_dune_autre_agence_est_refuse(client, db_session):
    db_session.add(PropertyRO(id=99, agency_id=AGENCY + 1, title="Voisin"))
    db_session.commit()
    resp = client.post("/backoffice/sejours/calendriers",
                       json={"property_id": 99, "platform": "airbnb", "ical_url": URL})
    assert resp.status_code == 400
    assert db_session.query(IcalSource).count() == 0


def test_deux_fois_la_meme_plateforme_sur_un_bien_est_refuse(client, bien, monkeypatch):
    _feed(monkeypatch, AIRBNB)
    client.post("/backoffice/sejours/calendriers",
                json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})
    resp = client.post("/backoffice/sejours/calendriers",
                       json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})
    assert resp.status_code == 400


def test_le_planning_est_filtrable_et_cloisonne(client, bien, db_session, monkeypatch):
    _feed(monkeypatch, AIRBNB)
    client.post("/backoffice/sejours/calendriers",
                json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})
    db_session.add(StayManagerReservation(
        agency_id=AGENCY + 1, property_id=99, source="ical", status="confirmed",
        check_in=datetime(2026, 11, 6), check_out=datetime(2026, 11, 7)))
    db_session.commit()

    tout = client.get("/backoffice/sejours").json()["stays"]
    assert len(tout) == 2                                     # rien de l'agence voisine
    bloques = client.get("/backoffice/sejours?status=blocked").json()["stays"]
    assert [s["status"] for s in bloques] == ["blocked"]
    fenetre = client.get("/backoffice/sejours?from=2026-11-15T00:00:00").json()["stays"]
    assert [s["external_id"] for s in fenetre] == ["airbnb-2"]


def test_lapercu_dit_ce_quil_y_a_a_faire(client, bien, db_session):
    now = datetime.utcnow()
    today = datetime(now.year, now.month, now.day)
    db_session.add_all([
        StayManagerReservation(agency_id=AGENCY, property_id=PROPERTY, source="ical",
                               status="confirmed", check_in=today,
                               check_out=today + timedelta(days=3), nights=3),
        StayManagerReservation(agency_id=AGENCY, property_id=PROPERTY, source="ical",
                               status="confirmed", check_in=today - timedelta(days=2),
                               check_out=today, nights=2),
        StayManagerReservation(agency_id=AGENCY, property_id=PROPERTY, source="ical",
                               status="cancelled", check_in=today + timedelta(days=5),
                               check_out=today + timedelta(days=6), nights=1),
    ])
    db_session.add(IcalSource(agency_id=AGENCY, property_id=PROPERTY, platform="vrbo",
                              ical_url=URL, status="error", last_error="Réponse 503"))
    db_session.commit()

    body = client.get("/backoffice/sejours/apercu").json()
    assert body["arrivals_today"] == 1 and body["departures_today"] == 1
    assert body["upcoming"] == 0                 # l'annulé ne compte pas
    assert body["sources"] == {"total": 1, "in_error": 1}
    # Le front éteint ménage et messages quand ce compte est nul ; l'annulé n'y figure pas.
    assert body["stays_total"] == 2


def test_retirer_un_calendrier_garde_les_sejours_importes(client, bien, db_session, monkeypatch):
    _feed(monkeypatch, AIRBNB)
    client.post("/backoffice/sejours/calendriers",
                json={"property_id": PROPERTY, "platform": "airbnb", "ical_url": URL})
    source_id = db_session.query(IcalSource).one().id

    assert client.delete(f"/backoffice/sejours/calendriers/{source_id}").status_code == 200
    assert db_session.query(IcalSource).count() == 0
    assert db_session.query(StayManagerReservation).count() == 2


def test_la_synchronisation_globale_continue_apres_un_canal_en_panne(client, bien, db_session, monkeypatch):
    db_session.add_all([
        IcalSource(agency_id=AGENCY, property_id=PROPERTY, platform="airbnb", ical_url=URL),
        IcalSource(agency_id=AGENCY, property_id=PROPERTY, platform="vrbo",
                   ical_url="https://calendrier.example.com/vrbo.ics"),
    ])
    db_session.commit()

    appels = {"n": 0}

    class _Resp:
        def __init__(self, text, status):
            self.text, self.status_code, self.content = text, status, text.encode()

    def get(*a, **k):
        appels["n"] += 1
        return _Resp(AIRBNB, 200) if appels["n"] == 1 else _Resp("", 500)

    monkeypatch.setattr(ical.httpx, "get", get)
    body = client.post("/backoffice/sejours/sync").json()
    assert body == {"sources": 2, "ok": 1, "failed": 1, "created": 2, "cancelled": 0,
                    "conflicts": 0}


def test_le_rapprochement_sans_identifiant_passe_par_les_dates(db_session, monkeypatch):
    """Certains calendriers ne donnent ni code ni UID : restent les dates."""
    source = IcalSource(agency_id=AGENCY, property_id=PROPERTY, platform="autre", ical_url=URL)
    db_session.add(source)
    db_session.commit()
    sans_uid = _ics("BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261201\nDTEND;VALUE=DATE:20261203\n"
                    "SUMMARY:Reserved\nEND:VEVENT\n")
    _feed(monkeypatch, sans_uid)

    assert stays.sync_source(db_session, source)["created"] == 1
    assert stays.sync_source(db_session, source)["updated"] == 1
    assert db_session.query(StayManagerReservation).count() == 1
