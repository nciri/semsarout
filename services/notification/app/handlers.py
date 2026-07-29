"""Traitement des événements : idempotent, atomique (effet + marquage dans 1 transaction).

Canaux : `email` (SMTP réel via `app.email`) ou `log` (trace en base). En cas d'échec d'envoi,
on journalise `status='failed'` et on marque quand même le message traité (pas de boucle DLQ ni
de doublon d'email : l'utilisateur peut relancer la demande).
"""
import logging
import os

from . import email as email_adapter
from . import render
from .db import SessionLocal
from .models import NotificationLog, ProcessedMessage

logger = logging.getLogger("notification")

_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:5600")

# routing key -> (canal, gabarit). Extensible au fil des événements consommés.
_TEMPLATES = {
    "identity.kyc.requested": ("log", "kyc_en_cours"),
    "identity.kyc.verified": ("log", "kyc_validee"),
}


def load_dotenv() -> None:
    """Charge `services/notification/.env` dans l'environnement (SMTP_*, PUBLIC_BASE_URL) — pas de
    dépendance externe. Les variables déjà posées par le lanceur ont la priorité (setdefault)."""
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip())


def _log(db, channel: str, recipient: str, template: str, status: str) -> None:
    db.add(NotificationLog(channel=channel, recipient=recipient, template=template, status=status))


def _handle_password_reset(db, payload: dict) -> None:
    to = (payload.get("email") or "").strip()
    token = payload.get("token") or ""
    if not to or not token:
        _log(db, "email", to or "?", "password_reset", "failed")
        return
    link = f"{_BASE_URL}/reinitialiser-mot-de-passe?token={token}"
    # Gabarit Jinja2 autoescapé → `name` (et toute variable) est échappé : pas d'injection HTML.
    subject, html, text = render.render_email("password_reset.html",
                                              name=payload.get("name") or "", link=link)
    try:
        email_adapter.send_email(to, subject, text, html=html)
        _log(db, "email", to, "password_reset", "sent")
        logger.info("email reset envoyé", extra={"recipient": to})
    except Exception as exc:  # noqa: BLE001 — échec SMTP : journalisé, pas de boucle DLQ
        _log(db, "email", to, "password_reset", "failed")
        logger.error("échec envoi email reset: %s", exc)


def handle_event(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "identity.password_reset":
            _handle_password_reset(db, payload)
        else:
            channel, template = _TEMPLATES.get(routing_key, ("log", routing_key))
            _log(db, channel, str(payload.get("user_id", "?")), template, "sent")
            logger.info("notification traitée", extra={"event": routing_key})
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()  # effet + marquage : atomiques
    except Exception:
        db.rollback()
        raise  # -> DLQ (erreurs inattendues, hors échec SMTP déjà capturé)
    finally:
        db.close()
