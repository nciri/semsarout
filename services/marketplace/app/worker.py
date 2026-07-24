"""Consumer marketplace — projette le catalogue et nettoie sur suppression.

    python -m app.worker

S'abonne à `product.#` (created/updated/deleted).
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from . import projection
from .db import init_db


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url,
        service_name=settings.service_name,
        bindings=["product.#"],
        exchange=settings.events_exchange,
    )
    consumer.run(handler=projection.handle)


if __name__ == "__main__":
    main()
