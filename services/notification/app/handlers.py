"""Traitement des événements : idempotent, atomique (effet + marquage dans 1 transaction).

Canaux : `email` (SMTP réel via `app.email`) ou `log` (trace en base). En cas d'échec d'envoi,
on journalise `status='failed'` et on marque quand même le message traité (pas de boucle DLQ ni
de doublon d'email : l'utilisateur peut relancer la demande).
"""
import logging
import os

from . import email as email_adapter
from . import recipients, render
from .db import SessionLocal
from .models import NotificationLog, ProcessedMessage

_PLACEHOLDER_EMAILS = {"non-renseigne@semsarout.ma"}

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
    _try_send(db, to, "password_reset.html", "password_reset", from_email=_noreply(),
              name=payload.get("name") or "", link=link)


# Expéditeur selon le cas : noreply pour les envois automatiques sans réponse attendue ;
# contact pour les emails relationnels (le destinataire peut répondre).
def _noreply() -> str:
    return os.environ.get("SMTP_FROM_NOREPLY", "noreply@semsarout.com")


def _contact() -> str:
    return os.environ.get("SMTP_FROM_CONTACT", "contact@semsarout.com")


def _try_send(db, to: str, template: str, log_name: str, from_email: str | None = None, **ctx) -> None:
    try:
        subject, html, text = render.render_email(template, **ctx)
        email_adapter.send_email(to, subject, text, html=html, from_email=from_email)
        _log(db, "email", to, log_name, "sent")
        logger.info("email envoyé", extra={"template": log_name, "recipient": to})
    except Exception as exc:  # noqa: BLE001 — échec SMTP journalisé, pas de boucle DLQ
        _log(db, "email", to, log_name, "failed")
        logger.error("échec envoi %s: %s", log_name, exc)


def _valid_email(addr) -> bool:
    return bool(addr) and "@" in addr and addr not in _PLACEHOLDER_EMAILS


def _handle_contact(db, payload: dict) -> None:
    """`listing.contacted` / `program.contacted` : accusé au prospect + alerte lead à l'agence."""
    title = payload.get("property_title")
    prospect = (payload.get("email") or "").strip()
    # 1) Accusé de réception au prospect (email réel, hors dossier de vente en ligne).
    if _valid_email(prospect) and payload.get("source") != "service_request":
        _try_send(db, prospect, "contact_confirmation.html", "contact_confirmation",
                  from_email=_noreply(), name=payload.get("name"), property_title=title)
    # 2) Alerte « nouveau lead » à l'agence (ou au propriétaire particulier).
    to = None
    if payload.get("agency_id"):
        to = recipients.agency_email(payload["agency_id"])
    elif payload.get("owner_id"):
        to = recipients.user_email(payload["owner_id"])
    if _valid_email(to):
        _try_send(db, to, "lead_notification.html", "lead_notification", from_email=_contact(),
                  lead_name=payload.get("name"), lead_email=prospect or None,
                  lead_phone=payload.get("phone"), lead_message=payload.get("message"),
                  property_title=title, source=payload.get("source"))


_MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
              "septembre", "octobre", "novembre", "décembre"]
_DAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


def _fmt_fr(iso_str) -> tuple[str, str]:
    """ISO → ("Samedi 15 août 2026", "15h00"). Chaîne vide si non parsable."""
    if not iso_str:
        return "", ""
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
    except ValueError:
        return str(iso_str), ""
    date = f"{_DAYS_FR[dt.weekday()].capitalize()} {dt.day} {_MONTHS_FR[dt.month - 1]} {dt.year}"
    return date, f"{dt.hour}h{dt.minute:02d}"


def _handle_visit(db, payload: dict) -> None:
    """`visit.created` : email de confirmation de visite au visiteur."""
    to = (payload.get("visitor_email") or "").strip()
    if not _valid_email(to):
        return
    date, time = _fmt_fr(payload.get("scheduled_at"))
    _try_send(db, to, "visit_confirmation.html", "visit_confirmation", from_email=_contact(),
              name=payload.get("contact_name"), property_title=payload.get("property_title"),
              date=date, time=time, address=payload.get("property_address"),
              agent_name=payload.get("agent_name"))


def _handle_transaction(db, payload: dict) -> None:
    """`transaction.updated` : email au client uniquement aux statuts terminaux (won/lost) —
    pas à chaque déplacement de pipeline (anti-spam)."""
    if payload.get("status") not in ("won", "lost"):
        return
    c = recipients.client(payload.get("client_id"))
    to = (c.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "transaction_status.html", "transaction_status", from_email=_contact(),
              name=c.get("name"), status=payload.get("status"), reference=payload.get("reference"),
              transaction_type=payload.get("transaction_type"))


def _handle_work_order(db, payload: dict) -> None:
    """`work_order.created` : ordre de service par email à l'artisan."""
    to = (payload.get("artisan_email") or "").strip()
    if not _valid_email(to):
        return
    date, _ = _fmt_fr(payload.get("scheduled_date"))
    _try_send(db, to, "work_order.html", "work_order", from_email=_contact(),
              artisan_name=payload.get("artisan_name"), title=payload.get("title"),
              trade=payload.get("trade"), notes=payload.get("notes"),
              scheduled_date=date or None, cost_estimate=payload.get("cost_estimate"))


def _handle_contract_signed(db, payload: dict) -> None:
    """`contract.signed` : email « document signé » au client (email résolu via crm)."""
    c = recipients.client(payload.get("client_id")) if payload.get("client_id") else {}
    to = (c.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "contract_signed.html", "contract_signed", from_email=_contact(),
              name=c.get("name"), title=payload.get("title"),
              document_type=payload.get("document_type"))


def _handle_mandate_signed(db, payload: dict) -> None:
    """`rental.mandate.signed` : email récap au propriétaire bailleur."""
    landlord = recipients.client(payload.get("landlord_client_id"))
    to = (landlord.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "mandate_signed.html", "mandate_signed", from_email=_contact(),
              name=landlord.get("name"), reference=payload.get("reference"),
              mandate_type=payload.get("mandate_type"), fee_percent=payload.get("fee_percent"))


def _handle_lease_signed(db, payload: dict) -> None:
    """`rental.lease.signed` : email récap au locataire (le propriétaire est notifié via le mandat)."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    prop = None  # titre du bien : projeté en Phase 2 (property_ro) ; absent = géré par le gabarit
    if _valid_email(to):
        _try_send(db, to, "lease_signed.html", "lease_signed", from_email=_contact(),
                  name=tenant.get("name"), property_title=prop,
                  rent_amount=payload.get("rent_amount"), charges_amount=payload.get("charges_amount"),
                  deposit_amount=payload.get("deposit_amount"))


def _handle_rent_paid(db, payload: dict) -> None:
    """`rental.rent.paid` : quittance de loyer au locataire."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "rent_receipt.html", "rent_receipt", from_email=_contact(),
              name=tenant.get("name"), period_label=payload.get("period_label"),
              receipt_number=payload.get("receipt_number"),
              paid_amount=payload.get("paid_amount"), total_amount=payload.get("total_amount"))


def _handle_deposit_returned(db, payload: dict) -> None:
    """`rental.deposit.returned` : confirmation de restitution au locataire."""
    tenant = recipients.client(payload.get("tenant_client_id"))
    to = (tenant.get("email") or "").strip()
    if not _valid_email(to):
        return
    _try_send(db, to, "deposit_return.html", "deposit_return", from_email=_contact(),
              name=tenant.get("name"), deposit_amount=payload.get("deposit_amount"),
              return_amount=payload.get("return_amount"))


def handle_event(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return
        if routing_key == "identity.password_reset":
            _handle_password_reset(db, payload)
        elif routing_key in ("listing.contacted", "program.contacted"):
            _handle_contact(db, payload)
        elif routing_key == "visit.created":
            _handle_visit(db, payload)
        elif routing_key == "transaction.updated":
            _handle_transaction(db, payload)
        elif routing_key == "work_order.created":
            _handle_work_order(db, payload)
        elif routing_key == "contract.signed":
            _handle_contract_signed(db, payload)
        elif routing_key == "rental.mandate.signed":
            _handle_mandate_signed(db, payload)
        elif routing_key == "rental.lease.signed":
            _handle_lease_signed(db, payload)
        elif routing_key == "rental.rent.paid":
            _handle_rent_paid(db, payload)
        elif routing_key == "rental.deposit.returned":
            _handle_deposit_returned(db, payload)
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
