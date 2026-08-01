"""Consumer de projection — maintient l'index OpenSearch des biens à jour.

    python -m app.worker

S'abonne à `listing.#`. La projection est **idempotente par nature** (upsert par id) :
pas de table d'idempotence nécessaire. Reconstructible en rejouant les événements.
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer
from semsar_search import delete_property, ensure_index, index_property, os_client

from . import coloc_index


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    client = os_client(settings.opensearch_url)
    ensure_index(client)
    coloc_index.ensure_coloc_index(client)

    def handle(routing_key: str, payload: dict, _message_id: str) -> None:
        if routing_key == "listing.deleted":
            delete_property(client, payload["id"])
        elif routing_key in ("listing.created", "listing.updated"):
            index_property(client, payload)
        elif routing_key == "coloc.listing_published":
            coloc_index.index_coloc_listing(client, payload)
        elif routing_key == "coloc.listing_status_changed":
            if payload.get("new_status") != "PUBLIEE":
                coloc_index.delete_coloc_listing(client, payload["listing_id"])
        # autres (ex. listing.contacted) : non pertinents pour l'index → ignorés

    consumer = EventConsumer(
        settings.rabbitmq_url,
        service_name=settings.service_name,
        bindings=["listing.#", "coloc.#"],
        exchange=settings.events_exchange,
    )
    consumer.run(handler=handle)


if __name__ == "__main__":
    main()
