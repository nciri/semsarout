"""Codes d'entrée : mode du bien, code manuel, code TTLock, révocation, cloisonnement."""
from datetime import datetime, timedelta

import pytest

from app import access, ttlock
from app.models import PropertyAccess, PropertyRO, StayAccessCode, StayManagerReservation
from tests.conftest import AGENCY

PROPERTY = 42
CREDS = {"client_id": "cid", "client_secret": "secret", "access_token": "tok", "lock_id": "9"}


@pytest.fixture
def stay(db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Riad Médina", reference="R-1"))
    now = datetime.utcnow()
    res = StayManagerReservation(
        agency_id=AGENCY, property_id=PROPERTY, source="ical", platform="airbnb",
        check_in=now + timedelta(days=1), check_out=now + timedelta(days=4), nights=3,
        guest_name="Salma Bennani", status="confirmed", synced_at=now)
    db_session.add(res)
    db_session.commit()
    return res


def test_la_fenetre_du_code_depasse_le_sejour_des_deux_cotes():
    check_in = datetime(2026, 11, 5, 15, 0)
    check_out = datetime(2026, 11, 8, 11, 0)
    start, end = ttlock.window(check_in, check_out)
    assert start == check_in - timedelta(hours=ttlock.EARLY_HOURS)
    assert end == check_out + timedelta(hours=ttlock.LATE_HOURS)


def test_un_bien_en_remise_de_cles_ne_pose_pas_de_code(client, stay):
    refused = client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "123456"})
    assert refused.status_code == 400


def test_mode_manuel_pose_le_code_saisi_par_l_agence(client, stay):
    client.put(f"/backoffice/sejours/acces/{PROPERTY}",
               json={"mode": "manual", "instructions": "Boîte à clés à droite de la porte"})
    created = client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "4821"})
    assert created.status_code == 201
    assert created.json()["code"]["code"] == "4821"
    assert created.json()["code"]["mode"] == "manual"

    state = client.get(f"/backoffice/sejours/{stay.id}/code").json()
    assert state["mode"] == "manual"
    assert state["instructions"] == "Boîte à clés à droite de la porte"


def test_code_manuel_trop_court_ou_non_numerique_refuse(client, stay):
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "manual"})
    assert client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "12"}).status_code == 400
    assert client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "ouvre-toi"}).status_code == 400


def test_un_nouveau_code_revoque_le_precedent(client, stay, db_session):
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "manual"})
    client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "1111"})
    client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "2222"})
    codes = db_session.query(StayAccessCode).order_by(StayAccessCode.id).all()
    assert [c.status for c in codes] == ["revoked", "active"]
    assert client.get(f"/backoffice/sejours/{stay.id}/code").json()["code"]["code"] == "2222"


def test_revocation_explicite(client, stay):
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "manual"})
    client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "3333"})
    revoked = client.delete(f"/backoffice/sejours/{stay.id}/code")
    assert revoked.json()["code"]["status"] == "revoked"
    assert client.get(f"/backoffice/sejours/{stay.id}/code").json()["code"] is None
    assert client.delete(f"/backoffice/sejours/{stay.id}/code").status_code == 404


def test_mode_ttlock_exige_ses_identifiants(client, stay):
    assert client.put(f"/backoffice/sejours/acces/{PROPERTY}",
                      json={"mode": "ttlock"}).status_code == 400
    assert client.put(f"/backoffice/sejours/acces/{PROPERTY}",
                      json={"mode": "ttlock", "credentials": {"client_id": "cid"}}).status_code == 400
    ok = client.put(f"/backoffice/sejours/acces/{PROPERTY}",
                    json={"mode": "ttlock", "credentials": CREDS})
    assert ok.status_code == 200
    assert ok.json()["access"]["configured"] is True


def test_les_identifiants_ne_ressortent_jamais(client, stay):
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "ttlock", "credentials": CREDS})
    body = client.get("/backoffice/sejours/acces").text
    assert "secret" not in body and "tok" not in body
    assert client.get("/backoffice/sejours/acces").json()["access"][0]["configured"] is True


def test_changer_de_mode_efface_les_identifiants(client, stay, db_session):
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "ttlock", "credentials": CREDS})
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "manual"})
    assert db_session.query(PropertyAccess).one().credentials is None


def test_code_ttlock_demande_a_la_serrure(client, stay, monkeypatch):
    calls = []

    def fake_create(credentials, check_in, check_out):
        calls.append((credentials["lock_id"], check_in, check_out))
        return {"code": "907411", "external_id": "kp-7"}

    monkeypatch.setattr(ttlock, "create_code", fake_create)
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "ttlock", "credentials": CREDS})
    created = client.post(f"/backoffice/sejours/{stay.id}/code", json={})
    assert created.status_code == 201
    assert created.json()["code"]["code"] == "907411"
    assert calls[0][0] == "9"


def test_serrure_qui_refuse_ne_pose_aucun_code(client, stay, monkeypatch, db_session):
    monkeypatch.setattr(ttlock, "create_code",
                        lambda *a, **k: (_ for _ in ()).throw(ttlock.LockError("Serrure injoignable")))
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "ttlock", "credentials": CREDS})
    refused = client.post(f"/backoffice/sejours/{stay.id}/code", json={})
    assert refused.status_code == 502
    assert db_session.query(StayAccessCode).count() == 0


def test_echec_de_revocation_chez_la_serrure_est_signale(client, stay, monkeypatch):
    monkeypatch.setattr(ttlock, "create_code", lambda *a, **k: {"code": "111222", "external_id": "kp-1"})
    monkeypatch.setattr(ttlock, "revoke_code",
                        lambda *a, **k: (_ for _ in ()).throw(ttlock.LockError("Serrure injoignable")))
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "ttlock", "credentials": CREDS})
    client.post(f"/backoffice/sejours/{stay.id}/code", json={})
    out = client.delete(f"/backoffice/sejours/{stay.id}/code").json()
    assert out["code"]["status"] == "revoked"
    assert "Serrure injoignable" in out["warning"]


def test_le_client_ttlock_ne_recopie_pas_la_reponse_du_fournisseur(monkeypatch):
    class _Resp:
        status_code = 200

        @staticmethod
        def json():
            return {"errcode": 20002, "errmsg": "accessToken cid-secret invalide"}

    monkeypatch.setattr(ttlock.httpx, "post", lambda *a, **k: _Resp())
    with pytest.raises(ttlock.LockError) as exc:
        ttlock.create_code(CREDS, datetime.utcnow(), datetime.utcnow() + timedelta(days=1))
    assert "cid-secret" not in str(exc.value)
    assert "20002" in str(exc.value)


def test_bien_et_sejour_d_une_autre_agence_inaccessibles(client, db_session):
    other_property = 77
    db_session.add(PropertyRO(id=other_property, agency_id=AGENCY + 1, title="Ailleurs"))
    other = StayManagerReservation(
        agency_id=AGENCY + 1, property_id=other_property, source="ical", platform="airbnb",
        check_in=datetime.utcnow(), check_out=datetime.utcnow() + timedelta(days=2),
        nights=2, status="confirmed")
    db_session.add(other)
    db_session.commit()
    assert client.put(f"/backoffice/sejours/acces/{other_property}",
                      json={"mode": "manual"}).status_code == 400
    assert client.get(f"/backoffice/sejours/{other.id}/code").status_code == 404
    assert client.post(f"/backoffice/sejours/{other.id}/code", json={"code": "1234"}).status_code == 404


def test_le_code_actif_est_lisible_par_la_messagerie(client, stay, db_session):
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "manual"})
    client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "5566"})
    assert access.active_code(db_session, stay.id).code == "5566"


def test_aucun_code_sur_un_sejour_non_confirme(client, stay, db_session):
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "manual"})
    stay.status = "cancelled"
    db_session.commit()
    assert client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "1234"}).status_code == 400


def test_un_sejour_disparu_du_calendrier_perd_son_code(client, stay, db_session, monkeypatch):
    from app import ical, stays as stays_mod
    from app.models import IcalSource

    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "manual"})
    client.post(f"/backoffice/sejours/{stay.id}/code", json={"code": "7788"})
    source = IcalSource(agency_id=AGENCY, property_id=PROPERTY, platform="airbnb",
                        ical_url="https://calendrier.example.com/a.ics")
    db_session.add(source)
    db_session.commit()
    stay.ical_source_id = source.id
    db_session.commit()

    # Calendrier vide : la plateforme a retiré la réservation.
    monkeypatch.setattr(ical, "fetch", lambda url: "BEGIN:VCALENDAR\nEND:VCALENDAR\n")
    stays_mod.sync_source(db_session, source)
    db_session.commit()
    assert db_session.query(StayAccessCode).one().status == "revoked"


def test_changer_les_identifiants_retire_les_codes_de_la_serrure(client, stay, monkeypatch, db_session):
    revoked = []
    monkeypatch.setattr(ttlock, "create_code", lambda *a, **k: {"code": "111222", "external_id": "kp-1"})
    monkeypatch.setattr(ttlock, "revoke_code", lambda creds, ext: revoked.append((creds["access_token"], ext)))
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "ttlock", "credentials": CREDS})
    client.post(f"/backoffice/sejours/{stay.id}/code", json={})
    client.put(f"/backoffice/sejours/acces/{PROPERTY}", json={"mode": "manual"})
    # Révoqué avec les ANCIENS identifiants, avant leur effacement.
    assert revoked == [("tok", "kp-1")]
    assert db_session.query(StayAccessCode).one().status == "revoked"


def test_revocation_sans_identifiants_le_dit_au_lieu_de_mentir(client, stay, db_session):
    db_session.add(PropertyAccess(agency_id=AGENCY, property_id=PROPERTY, mode="manual"))
    db_session.add(StayAccessCode(agency_id=AGENCY, reservation_id=stay.id, mode="ttlock",
                                  code="999888", external_id="kp-9", status="active"))
    db_session.commit()
    out = client.delete(f"/backoffice/sejours/{stay.id}/code").json()
    assert out["code"]["status"] == "revoked"
    assert "TTLock" in out["warning"]


def test_bien_deja_configure_par_une_autre_agence_est_refuse(client, db_session):
    db_session.add(PropertyRO(id=PROPERTY, agency_id=AGENCY, title="Riad Médina"))
    db_session.add(PropertyAccess(agency_id=AGENCY + 1, property_id=PROPERTY, mode="manual"))
    db_session.commit()
    assert client.put(f"/backoffice/sejours/acces/{PROPERTY}",
                      json={"mode": "manual"}).status_code == 400
