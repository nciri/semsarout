"""Projection analytics : événements → compteurs d'agrégats (idempotent, atomique)."""
import logging

from .db import SessionLocal
from .models import MetricCounter, ProcessedMessage

logger = logging.getLogger("analytics")


def _metrics_for(routing_key: str, payload: dict) -> list[str]:
    """Liste des compteurs à incrémenter pour un événement (compteurs d'événements,
    monotones — le net courant se déduit, ex. listings = created - deleted)."""
    names: list[str] = []
    if routing_key == "listing.created":
        names.append("listings.created")
        if payload.get("city"):
            names.append(f"listings.created.city.{payload['city']}")
        if payload.get("transaction_type"):
            names.append(f"listings.created.txn.{payload['transaction_type']}")
    elif routing_key == "listing.deleted":
        names.append("listings.deleted")
    elif routing_key == "identity.kyc.requested":
        names.append("kyc.requested")
    elif routing_key == "identity.kyc.verified":
        names.append("kyc.verified")
    return names


def _increment(db, name: str, delta: int = 1) -> None:
    counter = db.get(MetricCounter, name)
    if counter is None:
        db.add(MetricCounter(name=name, value=delta))
    else:
        counter.value = (counter.value or 0) + delta


def apply(routing_key: str, payload: dict, message_id: str) -> None:
    names = _metrics_for(routing_key, payload)
    if not names:
        return  # événement non pertinent pour analytics
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return  # idempotence : déjà comptabilisé
        for name in names:
            _increment(db, name, 1)
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()  # compteurs + marquage : atomiques
        logger.info("agrégats mis à jour", extra={"event": routing_key, "metrics": names})
    except Exception:
        db.rollback()
        raise  # -> DLQ
    finally:
        db.close()
