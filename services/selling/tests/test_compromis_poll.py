import app.main as main
from app import models


def test_completion_emits_compromis_signed(db_session, monkeypatch):
    inq = models.PurchaseInquiry(id=1, property_id=2, seller_party=5, buyer_party=10, status="compromis_pending")
    c = models.Compromis(id=1, inquiry_id=1, status="sent")
    sig = models.SignatureRequest(id=1, doc_type="compromis", doc_ref_id=1,
                                  envelope_id="env", document_id="doc", status="sent")
    db_session.add_all([inq, c, sig])
    db_session.commit()
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "get_status", lambda e: "completed")
    monkeypatch.setattr(main.signing, "fetch_signed_pdf", lambda e, d: b"%PDF-s")

    class _NoopStorage:
        def put(self, *a):
            return None

    monkeypatch.setattr(main.storage, "docs_storage", lambda: _NoopStorage())
    emitted = []
    monkeypatch.setattr(main, "enqueue", lambda db, at, aid, et, p: emitted.append((et, p)))
    r = main.poll_signatures(x_internal_token=main.settings.internal_token, db=db_session)
    assert any(et == "sale.compromis.signed" and p.get("account_id") == 5 for et, p in emitted)
    db_session.expire_all()
    assert db_session.get(models.Compromis, 1).status == "signed"
    assert db_session.get(models.PurchaseInquiry, 1).status == "concluded"


def test_declined_voids_commission(db_session, monkeypatch):
    inq = models.PurchaseInquiry(id=2, property_id=3, seller_party=6, buyer_party=11, status="compromis_pending")
    c = models.Compromis(id=2, inquiry_id=2, status="sent")
    sig = models.SignatureRequest(id=2, doc_type="compromis", doc_ref_id=2,
                                  envelope_id="env2", document_id="doc2", status="sent")
    db_session.add_all([inq, c, sig])
    db_session.commit()
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "get_status", lambda e: "declined")
    voided = []
    monkeypatch.setattr(main.commission_client, "void", lambda dt, ref: voided.append((dt, ref)))
    r = main.poll_signatures(x_internal_token=main.settings.internal_token, db=db_session)
    assert voided == [("sale", 2)]
    db_session.expire_all()
    assert db_session.get(models.SignatureRequest, 2).status == "declined"


def test_bad_token_forbidden(db_session):
    r = main.poll_signatures(x_internal_token="wrong", db=db_session)
    assert r.status_code == 403
