"""Traitement des événements : idempotent, atomique (effet + marquage dans 1 transaction).

L'« envoi » est ici une écriture dans `notification_log` (+ log) ; en cible, un adaptateur
email/SMS/WhatsApp est branché. En cas d'exception, le message part en DLQ (pas de rejeu infini).
"""
import logging

from .db import SessionLocal
from .models import NotificationLog, ProcessedMessage

logger = logging.getLogger("notification")

# routing key -> (canal, gabarit). Extensible au fil des événements consommés.
_TEMPLATES = {
    "identity.kyc.requested": ("log", "kyc_en_cours"),
    "identity.kyc.verified": ("log", "kyc_validee"),
}


def handle_event(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        # Idempotence : si déjà traité, on ne refait rien.
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return

        channel, template = _TEMPLATES.get(routing_key, ("log", routing_key))
        recipient = str(payload.get("user_id", "?"))

        db.add(NotificationLog(channel=channel, recipient=recipient, template=template, status="sent"))
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()  # effet + marquage : atomiques

        logger.info("notification envoyée", extra={"event": routing_key, "recipient": recipient})
    except Exception:
        db.rollback()
        raise  # -> DLQ
    finally:
        db.close()
