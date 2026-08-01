from app import models
from app.worker import _handle


def _session(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from semsar_events import OutboxBase
    engine = create_engine("sqlite:///:memory:", future=True)
    models.Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    import app.worker as w
    monkeypatch.setattr(w, "SessionLocal", lambda: s)
    return s


def test_commission_due_creates_invoice(monkeypatch):
    s = _session(monkeypatch)
    _handle("commission.due", {"purpose": "commission", "invoice_ref": "PAY-1",
                               "account_id": 42, "deal_type": "rental", "amount": 4999}, "c:1")
    inv = s.query(models.Invoice).filter_by(reference="PAY-1").first()
    assert inv is not None
    assert inv.invoice_type == "commission"
    assert inv.account_id == 42
    assert inv.status == "unpaid"


def test_commission_payment_marks_paid(monkeypatch):
    s = _session(monkeypatch)
    _handle("commission.due", {"purpose": "commission", "invoice_ref": "PAY-2",
                               "account_id": 42, "deal_type": "rental", "amount": 4999}, "c:2")
    _handle("payment.completed", {"purpose": "commission", "invoice_ref": "PAY-2"}, "c:3")
    inv = s.query(models.Invoice).filter_by(reference="PAY-2").first()
    assert inv.status == "paid"
