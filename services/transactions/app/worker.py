"""Consumer transactions — maintient `property_ro` (titre/ville) via `listing.*`, et copie les
contrats finalisés/signés dans les documents de transaction via `contract.finalized`/`.signed`
(la finalisation appartient au service contract ; la transaction reçoit une copie du PDF).

`client_ro` est amorcée à la migration (le domaine crm n'émet pas encore d'événements client).

    python -m app.worker
"""
from datetime import datetime

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import ProcessedMessage, PropertyRO, TransactionDocument


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "listing.deleted":
            ro = db.get(PropertyRO, payload.get("id"))
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            pid = payload.get("id")
            ro = db.get(PropertyRO, pid)
            if ro is None:
                ro = PropertyRO(id=pid)
                db.add(ro)
            ro.title = payload.get("title")
            ro.city = payload.get("city")
        elif routing_key == "contract.finalized":
            tid = payload.get("transaction_id")
            key = payload.get("pdf_url")
            if tid and key and not (db.query(TransactionDocument).filter(
                    TransactionDocument.transaction_id == tid,
                    TransactionDocument.file_url == key).first()):
                db.add(TransactionDocument(
                    transaction_id=tid, document_type=payload.get("document_type"),
                    name=payload.get("title"), file_url=key, mime_type="application/pdf",
                    requires_signature=True, signature_status="pending",
                    uploaded_by_id=payload.get("uploaded_by_id")))
        elif routing_key == "contract.signed":
            tid = payload.get("transaction_id")
            key = payload.get("pdf_url")
            doc = db.query(TransactionDocument).filter(
                TransactionDocument.transaction_id == tid,
                TransactionDocument.file_url == key).first() if tid and key else None
            if doc is not None:
                doc.signature_status = "signed"
                doc.signed_at = datetime.utcnow()
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
        settings.rabbitmq_url, service_name=settings.service_name,
        bindings=["listing.#", "contract.#"], exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
