"""Consumer analytics — maintient les agrégats à jour.

    python -m app.worker

S'abonne à `listing.#` et `identity.#`. Idempotent (dédup par message_id) — indispensable
pour des compteurs. Reconstructible en rejouant les événements.
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from . import projections
from .db import init_db


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url,
        service_name=settings.service_name,
        bindings=["listing.#", "identity.#"],
        exchange=settings.events_exchange,
    )
    consumer.run(handler=projections.apply)


if __name__ == "__main__":
    main()
