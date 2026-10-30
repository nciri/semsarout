"""Consumer agency — projette (id, agency_id) des biens via `listing.*` pour properties_count,
et pousse les nouveaux clients vers les CRM connectés par l'agence (`crm.client.created`).

    python -m app.worker
Idempotent (dédup par message_id). Reconstructible.
"""
import logging
from datetime import datetime

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from . import integrations
from .db import SessionLocal, init_db
from .models import IntegrationConnection, ListingRO, ProcessedMessage

logger = logging.getLogger("agency.worker")


def _contact_of(payload: dict) -> dict:
    """Contact au format attendu par les connecteurs — le nom complet, jamais vide."""
    first, last = payload.get("first_name") or "", payload.get("last_name") or ""
    return {"name": f"{first} {last}".strip() or payload.get("email") or "Contact",
            "first_name": first or None, "last_name": last or None,
            "email": payload.get("email"), "phone": payload.get("phone"),
            "city": payload.get("city")}


def _push_to_crms(db, payload: dict) -> None:
    """Envoie le client aux CRM connectés de son agence, chacun indépendamment.

    L'échec d'un fournisseur (jeton expiré, quota) est consigné sur sa connexion et ne doit
    ni faire échouer le message ni empêcher les autres envois : l'agence le voit dans
    Paramètres → Intégrations, et le contact reste dans notre CRM de toute façon.
    """
    agency_id = payload.get("agency_id")
    if agency_id is None:
        return
    rows = (db.query(IntegrationConnection)
            .filter(IntegrationConnection.agency_id == agency_id,
                    IntegrationConnection.status == "connected").all())
    contact = _contact_of(payload)
    for conn in rows:
        try:
            if not integrations.push_contact(conn.provider, dict(conn.credentials or {}), contact):
                continue       # fournisseur sans envoi de contact (SAP)
            conn.last_sync_at = datetime.utcnow()
            conn.synced_count = (conn.synced_count or 0) + 1
        except integrations.IntegrationError as exc:
            conn.status, conn.last_error = "error", str(exc)
            logger.warning("envoi %s refusé : %s", conn.provider, exc)


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "crm.client.created":
            _push_to_crms(db, payload)
            if message_id:
                db.add(ProcessedMessage(message_id=message_id))
            db.commit()
            return
        pid = payload.get("id")
        if routing_key == "listing.deleted":
            ro = db.get(ListingRO, pid)
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            ro = db.get(ListingRO, pid)
            if ro is None:
                ro = ListingRO(id=pid)
                db.add(ro)
            ro.agency_id = payload.get("agency_id")
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
        bindings=["listing.#", "crm.client.created"], exchange=settings.events_exchange,
    )
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
