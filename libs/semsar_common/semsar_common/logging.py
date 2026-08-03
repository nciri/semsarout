"""Logs structurés JSON (agrégables par Loki)."""
import logging
import sys

from pythonjsonlogger import jsonlogger


def setup_logging(service_name: str, level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        jsonlogger.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "ts", "levelname": "level", "name": "logger"},
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    logging.LoggerAdapter(logging.getLogger(service_name), {"service": service_name}).info(
        "logging initialised"
    )
