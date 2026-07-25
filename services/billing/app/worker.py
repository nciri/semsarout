"""Worker billing — chorégraphie : active l'abonnement à la libération du paiement.

    python -m app.worker

Consomme `payment.released`. Pour un paiement d'abonnement, marque la dernière facture
impayée de l'agence comme payée, active l'abonnement (période +30 j) et émet
`billing.subscription.activated`. **Idempotent** (dédup par message_id).
"""
from datetime import datetime, timedelta, timezone

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer, enqueue

from . import events
from .db import SessionLocal, init_db
from .models import Invoice, ProcessedMessage, Subscription


def _activate(routing_key: str, payload: dict, message_id: str) -> None:
    if payload.get("purpose") != "subscription":
        return
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return  # idempotence
        agency_id = payload.get("agency_id")
        sub = (
            db.query(Subscription)
            .filter(Subscription.agency_id == agency_id,
                    Subscription.status.in_(["pending", "incomplete"]))
            .order_by(Subscription.id.desc())
            .first()
        )
        if sub is not None:
            sub.status = "active"
            sub.end_date = datetime.now(timezone.utc) + timedelta(days=30)
            invoice = (
                db.query(Invoice)
                .filter(Invoice.subscription_id == sub.id, Invoice.status == "unpaid")
                .first()
            )
            if invoice is not None:
                invoice.status = "paid"
            enqueue(db, "subscription", sub.id, events.SUBSCRIPTION_ACTIVATED,
                    {"subscription_id": sub.id, "agency_id": agency_id})
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url,
        service_name=settings.service_name,
        bindings=["payment.released"],
        exchange=settings.events_exchange,
    )
    consumer.run(handler=_activate)


if __name__ == "__main__":
    main()
