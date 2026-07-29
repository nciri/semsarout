"""Consumer notification — s'abonne aux événements et réagit.

    python -m app.worker

File durable `notification.events` (+ DLQ `notification.events.dlq`) liée à
l'exchange topic `semsar.events` sur le motif `identity.kyc.#`.
"""
from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import init_db
from .handlers import handle_event, load_dotenv


def main() -> None:
    load_dotenv()  # SMTP_* + PUBLIC_BASE_URL depuis services/notification/.env
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    consumer = EventConsumer(
        settings.rabbitmq_url,
        service_name=settings.service_name,
        bindings=["identity.kyc.#", "identity.password_reset",
                  "listing.contacted", "program.contacted", "visit.created", "transaction.updated",
                  "work_order.created", "contract.signed"],
        exchange=settings.events_exchange,
    )
    consumer.run(handler=handle_event)


if __name__ == "__main__":
    main()
