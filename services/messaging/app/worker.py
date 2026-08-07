"""Consumer messaging — projette listing_ro, amorce les fils médiés (legacy) et génère les
notifications in-app m3a-l3achrane sur les événements bail/paiement de `coloc-listing`.

    python -m app.worker
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import DEFAULT_TENANT, Conversation, ListingRO, Notification, ProcessedMessage


def _open_thread(db, context_type, context_ref_id, property_id, owner_party, requester_party) -> None:
    exists = (db.query(Conversation)
              .filter(Conversation.property_id == property_id,
                      Conversation.requester_party == requester_party,
                      Conversation.context_type == context_type).first())
    if exists is None:
        db.add(Conversation(property_id=property_id, owner_party=owner_party,
                            requester_party=requester_party, context_type=context_type,
                            context_ref_id=context_ref_id, status="open"))


# Statuts de paiement escrow considérés comme « paiement reçu » côté bailleur — pending →
# escrowed (fonds bloqués) et escrowed → released (fonds libérés au bailleur).
_PAYMENT_RECEIVED_STATUSES = {"escrowed", "released"}


def _notify_lease_created(db, payload: dict) -> None:
    """`coloc.lease_created` : le locataire a un bail à signer/consulter."""
    tenant_user_id = payload.get("tenant_user_id")
    lease_id = payload.get("lease_id")
    if not isinstance(tenant_user_id, int) or lease_id is None:
        return
    db.add(Notification(
        tenant=DEFAULT_TENANT, user_id=tenant_user_id, type="lease.to_sign",
        payload={"lease_id": lease_id, "listing_id": payload.get("listing_id")},
        link=f"/bail/{lease_id}",
    ))


def _notify_payment_status_changed(db, payload: dict) -> None:
    """`coloc.payment_status_changed` : paiement dû (intent/à venir) → locataire ; paiement
    reçu (séquestré/libéré) → bailleur ; remboursement → locataire."""
    new_status = payload.get("new_status")
    lease_id = payload.get("lease_id")
    owner_id = payload.get("owner_id")
    tenant_user_id = payload.get("tenant_user_id")
    if lease_id is None:
        return
    base_payload = {"lease_id": lease_id, "payment_id": payload.get("payment_id"),
                    "payment_type": payload.get("payment_type"), "amount": payload.get("amount")}
    link = f"/bail/{lease_id}"
    if new_status in _PAYMENT_RECEIVED_STATUSES and isinstance(owner_id, int):
        db.add(Notification(tenant=DEFAULT_TENANT, user_id=owner_id, type="payment.received",
                            payload=base_payload, link=link))
    elif new_status == "refunded" and isinstance(tenant_user_id, int):
        db.add(Notification(tenant=DEFAULT_TENANT, user_id=tenant_user_id, type="payment.received",
                            payload=base_payload, link=link))


def _notify_candidature_received(db, payload: dict) -> None:
    """`coloc.candidature_received` : le bailleur a une nouvelle candidature à traiter."""
    owner_id = payload.get("owner_id")
    candidature_id = payload.get("candidature_id")
    if not isinstance(owner_id, int) or candidature_id is None:
        return
    db.add(Notification(
        tenant=DEFAULT_TENANT, user_id=owner_id, type="candidature.received",
        payload={"candidature_id": candidature_id, "listing_id": payload.get("listing_id"),
                 "listing_title": payload.get("listing_title")},
        link="/espace/candidatures",
    ))


def _notify_candidature_accepted(db, payload: dict) -> None:
    """`coloc.candidature_accepted` : le candidat est accepté, bail à signer bientôt."""
    candidate_user_id = payload.get("candidate_user_id")
    candidature_id = payload.get("candidature_id")
    if not isinstance(candidate_user_id, int) or candidature_id is None:
        return
    db.add(Notification(
        tenant=DEFAULT_TENANT, user_id=candidate_user_id, type="candidature.accepted",
        payload={"candidature_id": candidature_id, "listing_id": payload.get("listing_id")},
        link="/espace/candidature",
    ))


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "listing.deleted":
            ro = db.get(ListingRO, payload.get("id"))
            if ro is not None:
                db.delete(ro)
        elif routing_key in ("listing.created", "listing.updated"):
            if db.get(ListingRO, payload.get("id")) is None:
                db.add(ListingRO(id=payload.get("id")))
        elif routing_key == "rental.application.received":
            _open_thread(db, "rental_application", payload.get("id"), payload.get("property_id"),
                         payload.get("owner_id"), payload.get("applicant_user_id"))
        elif routing_key == "sale.inquiry.created":
            _open_thread(db, "sale_inquiry", payload.get("id"), payload.get("property_id"),
                         payload.get("seller_party"), payload.get("buyer_party"))
        elif routing_key == "coloc.lease_created":
            _notify_lease_created(db, payload)
        elif routing_key == "coloc.payment_status_changed":
            _notify_payment_status_changed(db, payload)
        elif routing_key == "coloc.candidature_received":
            _notify_candidature_received(db, payload)
        elif routing_key == "coloc.candidature_accepted":
            _notify_candidature_accepted(db, payload)
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
        bindings=["listing.#", "rental.application.received", "sale.inquiry.created",
                  "coloc.lease_created", "coloc.payment_status_changed",
                  "coloc.candidature_received", "coloc.candidature_accepted"],
        exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
