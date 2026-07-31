import app.main as main
from app import models
from tests.conftest import make_client


def _accepted(db_session, seller=5, buyer=10):
    inq = models.PurchaseInquiry(id=1, property_id=2, seller_party=seller, buyer_party=buyer, status="accepted")
    off = models.Offer(id=1, inquiry_id=1, amount=900000, status="accepted")
    db_session.add_all([inq, off])
    db_session.commit()


_DATA = {"parties": {"vendeur": {"nom": "A"}, "acheteur": {"nom": "B"}},
         "bien": {"titre_foncier": "12/3", "superficie": "90"},
         "prix": {"montant": 900000}, "vendeur_email": "s@x.c", "acheteur_email": "b@x.c"}


def test_blocked_returns_402(db_session, monkeypatch):
    _accepted(db_session)
    monkeypatch.setattr(main.commission_client, "gate",
                        lambda **k: {"state": "BLOCKED", "pay_url": "/pay?ref=Z"})
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    seller = make_client(db_session, uid="5")
    r = seller.post("/vente/purchase-inquiries/1/compromis", json=_DATA)
    assert r.status_code == 402 and r.json()["pay_url"] == "/pay?ref=Z"
    assert db_session.query(models.SignatureRequest).count() == 0


def test_open_generates_and_sends(db_session, monkeypatch):
    _accepted(db_session)
    monkeypatch.setattr(main.commission_client, "gate", lambda **k: {"state": "OPEN"})
    monkeypatch.setattr(main.signing, "signing_enabled", lambda: True)
    monkeypatch.setattr(main.signing, "create_envelope", lambda *a, **k: "env")
    monkeypatch.setattr(main.signing, "add_document", lambda *a, **k: ("doc", 1))
    monkeypatch.setattr(main.signing, "add_recipient", lambda *a, **k: "r")
    monkeypatch.setattr(main.signing, "place_signature_field", lambda *a, **k: None)
    monkeypatch.setattr(main.signing, "send_envelope", lambda *a, **k: None)
    monkeypatch.setattr(main.compromis_pdf, "render", lambda d: b"%PDF-")
    seller = make_client(db_session, uid="5")
    r = seller.post("/vente/purchase-inquiries/1/compromis", json=_DATA)
    assert r.status_code == 200
    sig = db_session.query(models.SignatureRequest).first()
    assert sig.doc_type == "compromis" and sig.status == "sent"
    assert db_session.query(models.Compromis).first().status == "sent"
