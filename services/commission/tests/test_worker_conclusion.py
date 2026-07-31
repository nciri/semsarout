from app import models
from app.worker import _handle


def test_lease_signed_concludes_and_increments(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    # une conclusion "pending" offerte existe (gate déjà passé)
    concl = models.Conclusion(account_id=500, deal_type="rental", source_ref=7,
                              billable=False, paid=True, status="pending")
    db_session.add(concl)
    db_session.add(models.DealCounter(account_id=500, concluded_count=0, first_deal_free_used=True))
    db_session.commit()
    _handle("rental.lease.signed", {"id": 7, "account_id": 500}, "rental:7")
    db_session.expire_all()
    assert db_session.query(models.DealCounter).get(500).concluded_count == 1
    assert db_session.query(models.Conclusion).filter_by(source_ref=7).first().status == "concluded"


def test_worker_idempotent(db_session, monkeypatch):
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: db_session)
    db_session.add(models.Conclusion(account_id=501, deal_type="rental", source_ref=8,
                                     billable=False, paid=True, status="pending"))
    db_session.add(models.DealCounter(account_id=501, concluded_count=0, first_deal_free_used=True))
    db_session.commit()
    _handle("rental.lease.signed", {"id": 8, "account_id": 501}, "rental:8")
    _handle("rental.lease.signed", {"id": 8, "account_id": 501}, "rental:8")
    db_session.expire_all()
    assert db_session.query(models.DealCounter).get(501).concluded_count == 1
