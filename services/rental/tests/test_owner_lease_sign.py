import app.main as main
from app import models
from tests.conftest import make_owner_client


def _lease(db_session, owner=5):
    l = models.Lease(id=3, property_id=2, owner_id=owner, tenant_user_id=10,
                     reference="BP-1", status="draft", rent_amount=4500)
    db_session.add(l)
    db_session.commit()
    return l


def test_blocked_returns_402_with_pay_url(db_session, monkeypatch):
    _lease(db_session)
    monkeypatch.setattr(main.commission_client, "gate",
                        lambda **k: {"state": "BLOCKED", "billable": True, "pay_url": "/pay?ref=X"})
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases/3/request-signature", json={"tenant_email": "t@x.c"})
    assert r.status_code == 402
    assert r.json()["pay_url"] == "/pay?ref=X"
    assert db_session.query(models.SignatureRequest).count() == 0


def test_gate_unavailable_is_fail_closed(db_session, monkeypatch):
    _lease(db_session)
    def boom(**k):
        raise main.commission_client.CommissionUnavailable("down")
    monkeypatch.setattr(main.commission_client, "gate", boom)
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases/3/request-signature", json={})
    assert r.status_code == 503
    assert db_session.query(models.SignatureRequest).count() == 0


def test_open_launches_signature(db_session, monkeypatch):
    _lease(db_session)
    monkeypatch.setattr(main.commission_client, "gate", lambda **k: {"state": "OPEN", "billable": False})
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "create_envelope", lambda *a, **k: "env-1")
    monkeypatch.setattr(main.signing, "add_document", lambda *a, **k: ("doc-1", 1))
    monkeypatch.setattr(main.signing, "add_recipient", lambda *a, **k: "r-1")
    monkeypatch.setattr(main.signing, "place_signature_field", lambda *a, **k: None)
    monkeypatch.setattr(main.signing, "send_envelope", lambda *a, **k: None)
    monkeypatch.setattr(main, "_owner_lease_pdf_bytes", lambda db, l: b"%PDF-")
    monkeypatch.setattr(main, "_owner_email", lambda uid: "owner@x.c")
    monkeypatch.setattr(main, "_applicant_email_for_lease", lambda db, l: "tenant@x.c")
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases/3/request-signature", json={})
    assert r.status_code == 200
    sig = db_session.query(models.SignatureRequest).first()
    assert sig.doc_type == "lease" and sig.doc_ref_id == 3 and sig.status == "sent"
