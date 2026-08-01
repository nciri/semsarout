import app.main as main
from app import models
from tests.conftest import make_client  # helper multi-uid (comme messaging)


def test_buyer_creates_inquiry_emits_event(db_session, monkeypatch):
    monkeypatch.setattr(main.listing_client, "owner_of", lambda pid: 5)
    buyer = make_client(db_session, uid="10")
    r = buyer.post("/vente/purchase-inquiries", json={"property_id": 2})
    assert r.status_code == 201
    inq = db_session.query(models.PurchaseInquiry).first()
    assert inq.seller_party == 5 and inq.buyer_party == 10
    from semsar_events import OutboxEvent
    assert db_session.query(OutboxEvent).filter_by(event_type="sale.inquiry.created").count() == 1


def test_offer_and_accept_flow(db_session, monkeypatch):
    monkeypatch.setattr(main.listing_client, "owner_of", lambda pid: 5)
    buyer = make_client(db_session, uid="10")
    inq_id = buyer.post("/vente/purchase-inquiries", json={"property_id": 2}).json()["inquiry"]["id"]
    oid = buyer.post(f"/vente/purchase-inquiries/{inq_id}/offers",
                     json={"amount": 900000}).json()["offer"]["id"]
    seller = make_client(db_session, uid="5")
    r = seller.post(f"/vente/purchase-inquiries/{inq_id}/offers/{oid}/accept")
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.get(models.Offer, oid).status == "accepted"
    assert db_session.get(models.PurchaseInquiry, inq_id).status == "accepted"
