from app.models import ProcessedMessage, TrustLevel
from app.worker import _handle_with_session


def test_kyc_verified_upserts_user(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "_owned_agency_ids", lambda user_id: [])
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 5}, "mid-1")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "user", "entity_id": 5})
    assert row.level == "verified"
    assert db_session.get(ProcessedMessage, "mid-1") is not None


def test_kyc_verified_is_idempotent(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "_owned_agency_ids", lambda user_id: [])
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 5}, "mid-2")
    db_session.commit()
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 5}, "mid-2")
    db_session.commit()  # ne doit pas planter (message déjà traité)


def test_kyc_verified_propagates_to_owned_agencies(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "_owned_agency_ids", lambda user_id: [11, 12] if user_id == 5 else [])
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 5}, "mid-owner-1")
    db_session.commit()
    assert db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 11}).level == "verified"
    assert db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 12}).level == "verified"


def test_deal_concluded_increments_agency(db_session):
    _handle_with_session(db_session, "commission.settled", {"agency_id": 9}, "mid-3")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 9})
    assert row.level == "none"  # pas de KYC -> pas de badge malgre le deal
    assert row.deal_count == 1


def test_deal_concluded_promotes_to_experience_when_already_verified(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "_owned_agency_ids", lambda user_id: [1] if user_id == 1 else [])
    _handle_with_session(db_session, "identity.kyc.verified", {"user_id": 1}, "mid-4")
    db_session.commit()
    _handle_with_session(db_session, "commission.settled", {"agency_id": 1}, "mid-5")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "agency", "entity_id": 1})
    assert row.level == "verified_experience"
    assert row.deal_count == 1


def test_lease_signed_falls_back_to_user_for_particulier(db_session):
    _handle_with_session(db_session, "rental.lease.signed", {"account_id": 77}, "mid-6")
    db_session.commit()
    row = db_session.get(TrustLevel, {"entity_type": "user", "entity_id": 77})
    assert row.deal_count == 1


def test_owned_agency_ids_returns_empty_on_error(monkeypatch):
    import app.worker as w
    import httpx

    def _raise(*a, **k):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(httpx, "get", _raise)
    assert w._owned_agency_ids(1) == []
