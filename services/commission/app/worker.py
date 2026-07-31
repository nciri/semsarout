"""Worker commission — finalise les conclusions et applique les paiements.

    python -m app.worker
"""
from datetime import datetime

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer, enqueue

from . import events
from .db import SessionLocal, init_db
from .models import Conclusion, DealCounter, ProcessedMessage

_DEAL_BY_KEY = {"rental.lease.signed": ("rental", "id"),
                "sale.compromis.signed": ("sale", "id")}


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key in _DEAL_BY_KEY:
            _conclude(db, routing_key, payload)
        elif routing_key == "payment.completed" and payload.get("purpose") == "commission":
            _apply_payment(db, payload)
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _conclude(db, routing_key: str, payload: dict) -> None:
    deal_type, ref_key = _DEAL_BY_KEY[routing_key]
    source_ref = payload.get(ref_key)
    concl = (db.query(Conclusion)
             .filter(Conclusion.deal_type == deal_type, Conclusion.source_ref == source_ref).first())
    if concl is None or concl.status == "concluded":
        return
    concl.status = "concluded"
    concl.source_event = routing_key
    concl.concluded_at = datetime.utcnow()
    counter = db.get(DealCounter, concl.account_id)
    if counter is None:
        counter = DealCounter(account_id=concl.account_id, concluded_count=0, first_deal_free_used=True)
        db.add(counter)
    counter.concluded_count = (counter.concluded_count or 0) + 1
    evt = events.COMMISSION_SETTLED if concl.billable else events.COMMISSION_WAIVED
    enqueue(db, "conclusion", concl.id, evt, {
        "conclusion_id": concl.id, "account_id": concl.account_id, "deal_type": deal_type,
        "source_ref": source_ref, "amount": float(concl.commission_amount or 0)})


def _apply_payment(db, payload: dict) -> None:
    ref = payload.get("invoice_ref") or payload.get("commission_ref")
    concl = db.query(Conclusion).filter(Conclusion.invoice_ref == ref).first()
    if concl is not None:
        concl.paid = True


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url, service_name=settings.service_name,
        bindings=["rental.lease.signed", "sale.compromis.signed", "payment.completed"],
        exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
