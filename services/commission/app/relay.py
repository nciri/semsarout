"""Relais outbox → RabbitMQ du service commission."""
from semsar_common import get_settings, setup_logging
from semsar_events import run_relay

from .db import SessionLocal


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    run_relay(SessionLocal, settings.rabbitmq_url, settings.events_exchange)


if __name__ == "__main__":
    main()
