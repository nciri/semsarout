"""Worker billing — chorégraphie abonnement pilotée par les événements paiement.

    python -m app.worker

- `payment.released` : active l'abonnement *pending/incomplete* de l'agence (période +30 j),
  marque la facture impayée comme payée, émet `billing.subscription.activated`.
- `payment.completed` : confirmation passerelle (webhook payment) → crée/prolonge l'abonnement
  actif de l'agence (parité du webhook du monolithe, sans écriture cross-domaine).
**Idempotent** (dédup par message_id).
"""
from datetime import datetime, timedelta, timezone

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer, enqueue

from . import events
from .db import SessionLocal, init_db
from .models import Invoice, ProcessedMessage, Subscription


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    purpose = payload.get("purpose")
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return  # idempotence
        if routing_key == "commission.due" and purpose == "commission":
            _create_commission_invoice(db, payload)
        elif routing_key == "payment.completed" and purpose == "commission":
            _mark_commission_paid(db, payload)
        elif purpose == "subscription":
            agency_id = payload.get("agency_id")
            if routing_key == "payment.released":
                _activate_pending(db, agency_id)
            elif routing_key == "payment.completed":
                _create_or_extend(db, payload, agency_id)
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _create_commission_invoice(db, payload) -> None:
    ref = payload.get("invoice_ref")
    if db.query(Invoice).filter(Invoice.reference == ref).first() is not None:
        return
    inv = Invoice(reference=ref, invoice_type="commission", account_id=payload.get("account_id"),
                  amount=payload.get("amount"), status="unpaid",
                  period_label=f"commission {payload.get('deal_type')}")
    db.add(inv)
    db.flush()
    enqueue(db, "invoice", inv.id, events.INVOICE_CREATED, {
        "invoice_id": inv.id, "account_id": payload.get("account_id"),
        "amount": float(payload.get("amount") or 0), "purpose": "commission"})


def _mark_commission_paid(db, payload) -> None:
    inv = db.query(Invoice).filter(Invoice.reference == payload.get("invoice_ref")).first()
    if inv is not None and inv.status != "paid":
        inv.status = "paid"
        inv.paid_at = datetime.utcnow()


def _activate_pending(db, agency_id) -> None:
    sub = (db.query(Subscription)
           .filter(Subscription.agency_id == agency_id,
                   Subscription.status.in_(["pending", "incomplete"]))
           .order_by(Subscription.id.desc()).first())
    if sub is None:
        return
    sub.status = "active"
    sub.end_date = datetime.now(timezone.utc) + timedelta(days=30)
    invoice = (db.query(Invoice)
               .filter(Invoice.subscription_id == sub.id, Invoice.status == "unpaid").first())
    if invoice is not None:
        invoice.status = "paid"
    enqueue(db, "subscription", sub.id, events.SUBSCRIPTION_ACTIVATED,
            {"subscription_id": sub.id, "agency_id": agency_id})


def _create_or_extend(db, payload, agency_id) -> None:
    """Webhook payment confirmé → crée/prolonge l'abonnement actif (parité monolithe)."""
    days = 365 if payload.get("billing_cycle") == "yearly" else 30
    now = datetime.utcnow()
    sub = (db.query(Subscription)
           .filter(Subscription.agency_id == agency_id, Subscription.status == "active").first())
    if sub is not None:
        sub.end_date = (sub.end_date or now) + timedelta(days=days)
    else:
        db.add(Subscription(agency_id=agency_id, plan_id=payload.get("plan_id"),
                            billing_cycle=payload.get("billing_cycle"), amount=payload.get("amount"),
                            status="active", start_date=now, end_date=now + timedelta(days=days)))


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url,
        service_name=settings.service_name,
        bindings=["payment.released", "payment.completed", "commission.due"],
        exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
