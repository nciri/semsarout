import app.main as main
from app import models


def test_owner_lease_completion_emits_signed(db_session, monkeypatch):
    l = models.Lease(id=4, property_id=2, owner_id=5, tenant_user_id=10, reference="BP", status="draft",
                      rent_amount=1200)
    sig = models.SignatureRequest(id=1, doc_type="lease", doc_ref_id=4, agency_id=0,
                                  envelope_id="env", document_id="doc", status="sent")
    db_session.add_all([l, sig])
    db_session.commit()
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "get_status", lambda env: "completed")
    monkeypatch.setattr(main.signing, "fetch_signed_pdf", lambda e, d: b"%PDF-signed")
    import app.storage as storage
    monkeypatch.setattr(storage, "docs_storage", lambda: type("S", (), {"put": lambda self, *a: None})())
    emitted = []
    real = main.enqueue
    monkeypatch.setattr(main, "enqueue", lambda db, at, aid, et, p: emitted.append((et, p)))
    main.poll_signatures(x_internal_token=main.settings.internal_token, db=db_session)
    assert any(et == "rental.lease.signed" and p.get("account_id") == 5 for et, p in emitted)
    db_session.expire_all()
    assert db_session.get(models.Lease, 4).status == "active"
