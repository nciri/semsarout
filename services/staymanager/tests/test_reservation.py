"""Réservation directe, fiche d'un séjour et calendrier mensuel.

Ce que ces cas défendent : une agence saisit une location de la main à la main sans passer
par une plateforme, voit tout ce qui est accroché au séjour sur une seule page, et ne peut
pas modifier un séjour qu'une plateforme réécrira à la prochaine synchronisation.
"""
from datetime import datetime, timedelta

import pytest

from app.models import (
    CleaningTask, PropertyRO, StayAccessCode, StayCheckinLink, StayGuest,
    StayManagerReservation,
)
from tests.conftest import AGENCY

PROPERTY = 77
OTHER_AGENCY = 99


@pytest.fixture
def bien(db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Appartement Gueliz",
                              reference="P-77"))
    db_session.commit()


def _payload(**over):
    base = {"property_id": PROPERTY, "check_in": "2026-12-10", "check_out": "2026-12-14",
            "guest_name": "Salma Idrissi", "guest_email": "salma@example.com",
            "guest_count": 2, "total_price": 3200}
    base.update(over)
    return base


# ---- Saisie directe --------------------------------------------------------------------

def test_une_reservation_directe_calcule_ses_nuits_et_se_dit_modifiable(client, bien):
    r = client.post("/backoffice/sejours", json=_payload())
    assert r.status_code == 201
    stay = r.json()["stay"]
    assert stay["nights"] == 4
    assert stay["source"] == "manual"
    assert stay["platform"] == "direct"
    assert stay["editable"] is True
    assert stay["total_price"] == 3200.0


def test_un_depart_avant_l_arrivee_est_refuse(client, bien):
    r = client.post("/backoffice/sejours", json=_payload(check_out="2026-12-09"))
    assert r.status_code == 400
    assert "départ" in r.json()["error"]


def test_un_bien_d_une_autre_agence_est_refuse(client, db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=OTHER_AGENCY, title="Villa voisine"))
    db_session.commit()
    r = client.post("/backoffice/sejours", json=_payload())
    assert r.status_code == 400


def test_un_bien_sans_proprietaire_connu_est_refuse(client, db_session):
    # Une projection incomplète ne vaut pas autorisation : sans agence sur le bien, on refuse.
    db_session.add(PropertyRO(id=PROPERTY, agency_id=None, title="Bien orphelin"))
    db_session.commit()
    assert client.post("/backoffice/sejours", json=_payload()).status_code == 400


def test_une_reservation_directe_qui_chevauche_est_acceptee_mais_signalee(client, bien, db_session):
    client.post("/backoffice/sejours", json=_payload())
    r = client.post("/backoffice/sejours", json=_payload(check_in="2026-12-12",
                                                         check_out="2026-12-16"))
    assert r.status_code == 201
    # Deux lignes qui se croisent, c'est ce qu'il faut montrer : on ne refuse pas, on marque.
    rows = db_session.query(StayManagerReservation).all()
    assert [bool(x.has_conflict) for x in rows] == [True, True]


# ---- Fiche -----------------------------------------------------------------------------

def test_la_fiche_rassemble_occupants_menage_code_et_enregistrement(client, bien, db_session):
    stay_id = client.post("/backoffice/sejours", json=_payload()).json()["stay"]["id"]
    db_session.add_all([
        StayGuest(reservation_id=stay_id, full_name="Salma Idrissi", is_lead=True,
                  status="validated", document_type="cin"),
        StayGuest(reservation_id=stay_id, full_name="Omar Idrissi", status="declared"),
        CleaningTask(agency_id=AGENCY, property_id=PROPERTY, reservation_id=stay_id,
                     scheduled_date=datetime(2026, 12, 14).date(), status="pending"),
        StayAccessCode(agency_id=AGENCY, reservation_id=stay_id, mode="manual", code="4821",
                       status="active"),
        StayCheckinLink(agency_id=AGENCY, reservation_id=stay_id, token_hash="h" * 64,
                        status="submitted", expires_at=datetime(2026, 12, 15)),
    ])
    db_session.commit()

    body = client.get(f"/backoffice/sejours/{stay_id}").json()
    assert [g["full_name"] for g in body["guests"]] == ["Salma Idrissi", "Omar Idrissi"]
    assert body["cleaning"]["status"] == "pending"
    assert body["access_code"]["code"] == "4821"
    assert body["checkin"]["status"] == "submitted"
    assert body["conflicts"] == []


def test_la_fiche_d_une_autre_agence_est_introuvable(client, db_session):
    db_session.add(StayManagerReservation(
        agency_id=OTHER_AGENCY, property_id=PROPERTY, source="manual",
        check_in=datetime(2026, 12, 10), check_out=datetime(2026, 12, 12), nights=2))
    db_session.commit()
    row = db_session.query(StayManagerReservation).first()
    assert client.get(f"/backoffice/sejours/{row.id}").status_code == 404


# ---- Modification et annulation --------------------------------------------------------

def test_un_sejour_venu_d_un_calendrier_n_est_pas_modifiable(client, bien, db_session):
    db_session.add(StayManagerReservation(
        agency_id=AGENCY, property_id=PROPERTY, source="ical", platform="airbnb",
        check_in=datetime(2026, 12, 1), check_out=datetime(2026, 12, 4), nights=3))
    db_session.commit()
    row = db_session.query(StayManagerReservation).first()
    r = client.put(f"/backoffice/sejours/{row.id}", json=_payload())
    assert r.status_code == 400
    assert "calendrier" in r.json()["error"]


def test_modifier_une_reservation_directe_recalcule_les_nuits(client, bien):
    stay_id = client.post("/backoffice/sejours", json=_payload()).json()["stay"]["id"]
    r = client.put(f"/backoffice/sejours/{stay_id}",
                   json=_payload(check_out="2026-12-20", guest_count=3))
    assert r.status_code == 200
    assert r.json()["stay"]["nights"] == 10
    assert r.json()["stay"]["guest_count"] == 3


def test_decaler_les_dates_revoque_le_code_d_entree(client, bien, db_session):
    stay_id = client.post("/backoffice/sejours", json=_payload()).json()["stay"]["id"]
    db_session.add(StayAccessCode(agency_id=AGENCY, reservation_id=stay_id, mode="manual",
                                  code="4821", status="active"))
    db_session.commit()

    r = client.put(f"/backoffice/sejours/{stay_id}", json=_payload(check_in="2026-12-18",
                                                                   check_out="2026-12-22"))
    assert r.status_code == 200
    db_session.expire_all()
    # Un code calé sur les anciennes dates ouvrirait des jours où plus personne n'est attendu.
    assert db_session.query(StayAccessCode).first().status == "revoked"


def test_la_fiche_ignore_un_sejour_conflictuel_d_une_autre_agence(client, bien, db_session):
    stay_id = client.post("/backoffice/sejours", json=_payload()).json()["stay"]["id"]
    db_session.add(StayManagerReservation(
        agency_id=OTHER_AGENCY, property_id=PROPERTY, source="ical", platform="airbnb",
        check_in=datetime(2026, 12, 11), check_out=datetime(2026, 12, 13), nights=2))
    row = db_session.get(StayManagerReservation, stay_id)
    row.has_conflict = True
    db_session.commit()

    assert client.get(f"/backoffice/sejours/{stay_id}").json()["conflicts"] == []


def test_annuler_un_sejour_revoque_son_code_et_sa_tache_de_menage(client, bien, db_session):
    stay_id = client.post("/backoffice/sejours", json=_payload()).json()["stay"]["id"]
    db_session.add_all([
        StayAccessCode(agency_id=AGENCY, reservation_id=stay_id, mode="manual", code="4821",
                       status="active"),
        CleaningTask(agency_id=AGENCY, property_id=PROPERTY, reservation_id=stay_id,
                     scheduled_date=datetime(2026, 12, 14).date(), status="pending"),
    ])
    db_session.commit()

    r = client.post(f"/backoffice/sejours/{stay_id}/annuler")
    assert r.status_code == 200
    assert r.json()["stay"]["status"] == "cancelled"
    db_session.expire_all()
    assert db_session.query(StayAccessCode).first().status == "revoked"
    assert db_session.query(CleaningTask).first().status == "cancelled"


# ---- Calendrier ------------------------------------------------------------------------

def test_le_calendrier_rend_les_sejours_du_mois_groupes_par_bien(client, bien):
    client.post("/backoffice/sejours", json=_payload())
    # À cheval sur deux mois : doit apparaître dans les deux grilles.
    client.post("/backoffice/sejours", json=_payload(check_in="2026-12-28",
                                                     check_out="2027-01-03"))
    decembre = client.get("/backoffice/sejours/calendrier?mois=2026-12").json()
    assert decembre["days"] == 31
    assert len(decembre["properties"]) == 1
    assert len(decembre["properties"][0]["stays"]) == 2
    assert decembre["properties"][0]["property_title"] == "Appartement Gueliz"

    janvier = client.get("/backoffice/sejours/calendrier?mois=2027-01").json()
    assert len(janvier["properties"][0]["stays"]) == 1


def test_le_calendrier_ignore_les_sejours_annules(client, bien):
    stay_id = client.post("/backoffice/sejours", json=_payload()).json()["stay"]["id"]
    client.post(f"/backoffice/sejours/{stay_id}/annuler")
    body = client.get("/backoffice/sejours/calendrier?mois=2026-12").json()
    assert body["properties"] == []


def test_un_mois_mal_ecrit_est_refuse(client, bien):
    assert client.get("/backoffice/sejours/calendrier?mois=decembre").status_code == 400


def test_l_apercu_reste_accessible_malgre_la_route_de_fiche(client, bien):
    # `/backoffice/sejours/{stay_id}` ne doit pas avaler les routes littérales.
    assert client.get("/backoffice/sejours/apercu").status_code == 200
    assert client.get("/backoffice/sejours/calendriers").status_code == 200
    mois = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m")
    assert client.get(f"/backoffice/sejours/calendrier?mois={mois}").status_code == 200


# ---- Notes et demandes du voyageur en texte riche ---------------------------------------

_SALE = '<p class="MsoNormal">Arrivée <strong>tardive</strong></p><script>alert(1)</script>'
_PROPRE = "<p>Arrivée <strong>tardive</strong></p>"


def test_les_notes_et_demandes_sont_assainies_a_la_saisie(client, bien):
    """Les deux champs sont saisis en WYSIWYG : ce qui est stocké est du HTML, donc un XSS
    stocké déclenché par la fiche du séjour s'il n'est pas assaini ici."""
    r = client.post("/backoffice/sejours", json=_payload(
        guest_notes=_SALE,
        special_requests='<ul><li>Lit bébé</li></ul><img src=x onerror="alert(2)">',
        guest_name="Salma <Idrissi> & co"))

    assert r.status_code == 201
    # `stay_dict` ne porte pas les notes : la fiche complète est la vue qui les renvoie.
    sejour = client.get(f"/backoffice/sejours/{r.json()['stay']['id']}").json()["stay"]
    assert sejour["guest_notes"] == _PROPRE
    assert sejour["special_requests"] == "<ul><li>Lit bébé</li></ul>"
    # Le nom reste du texte brut : l'assainir ferait apparaître des entités à l'écran.
    assert sejour["guest_name"] == "Salma <Idrissi> & co"


def test_un_champ_vide_par_l_editeur_redevient_nul(client, bien):
    r = client.post("/backoffice/sejours", json=_payload(guest_notes="<p><br></p>",
                                                         special_requests=""))
    sejour = client.get(f"/backoffice/sejours/{r.json()['stay']['id']}").json()["stay"]
    assert sejour["guest_notes"] is None
    assert sejour["special_requests"] is None


def test_une_note_trop_longue_est_tronquee_sans_laisser_de_balise_ouverte(client, bien):
    """Le plafond s'applique au HTML : la troncature peut couper au milieu d'une balise.
    L'assainisseur repasse derrière et referme l'arbre, plutôt que de stocker du balisage
    ouvert que seul l'affichage rattraperait."""
    from app.booking import NOTE_MAX

    r = client.post("/backoffice/sejours",
                    json=_payload(guest_notes=f"<p>{'a' * (NOTE_MAX + 50)}</p>"))

    note = client.get(f"/backoffice/sejours/{r.json()['stay']['id']}").json()["stay"]["guest_notes"]
    assert len(note) <= NOTE_MAX + len("</p>")
    assert note.startswith("<p>aaa") and note.endswith("</p>")
    assert note.count("<p>") == note.count("</p>") == 1
