"""Messagerie de séjour : gabarits de l'agence et messages dus.

Reprise de StayManager (`app/utils/automation.py`, `app/services/message_template_service.py`)
ramenée à ce que SemsarOut sait vraiment faire :

- **Un seul moteur d'envoi.** Le service `notification` envoie déjà les emails (SMTP de
  l'agence, journal, gabarit HTML). Ici on ne stocke que le texte de l'agence et le moment
  d'envoi ; l'ordonnanceur de `notification` vient chercher ce qui est dû.
- **Pas de variables inventées.** Un calendrier iCal ne donne ni prix, ni email : les
  variables se limitent à ce qu'un séjour porte réellement. Une variable inconnue est
  laissée telle quelle plutôt que remplacée par du vide, pour que l'agence voie sa faute.
- **Pas d'envoi sans destinataire.** Airbnb ne publie pas l'email du voyageur ; le message
  attend que l'agence complète la fiche du séjour.
"""
import re
from datetime import datetime, timedelta
from email.utils import parseaddr

# Les cinq moments d'un séjour : StayManager écrivait aussi pendant le séjour et la veille
# du départ, que trois déclencheurs ne savaient pas placer.
TRIGGERS = ("on_booking", "before_check_in", "after_check_in", "before_check_out",
            "after_check_out")
MAX_OFFSET_HOURS = 24 * 30
# Au-delà, le message n'a plus de sens : on l'abandonne plutôt que de l'envoyer en retard.
LATE_GRACE_HOURS = 48

PLACEHOLDERS = ("guest_name", "property_title", "check_in", "check_out", "nights",
                "platform", "agency_name", "access_code", "access_instructions")
_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")


SUBJECT_MAX = 200
NAME_MAX = 255
_BAD_IN_ADDRESS = re.compile(r"[\s,;<>\"\\\x00-\x1f]")


def valid_address(raw: str) -> bool:
    """Une seule adresse, sans séparateur ni blanc : un message d'agence ne part pas en liste.

    Un `{{guest_name}}` ou une adresse « a@x, b@y » saisis à la main suffiraient sinon à
    transformer la messagerie de séjour en envoi de masse sous notre marque.
    """
    addr = (raw or "").strip()
    if not addr or len(addr) > NAME_MAX or _BAD_IN_ADDRESS.search(addr):
        return False
    name, parsed = parseaddr(addr)
    if name or parsed != addr:
        return False
    local, _, domain = parsed.partition("@")
    return bool(local) and "." in domain and not domain.startswith(".") and not domain.endswith(".")


def _fr_date(value: datetime | None) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def variables(stay, property_title: str | None, agency_name: str | None,
              access_code: str | None = None, access_instructions: str | None = None) -> dict:
    return {
        # Le code d'entrée vient de `app/access.py` : un gabarit qui le réclame avant
        # qu'il existe partirait avec un trou, donc `is_ready` refuse d'envoyer.
        "access_code": access_code or "",
        "access_instructions": access_instructions or "",
        "guest_name": stay.guest_name or "",
        "property_title": property_title or "",
        "check_in": _fr_date(stay.check_in),
        "check_out": _fr_date(stay.check_out),
        "nights": str(stay.nights or 0),
        "platform": stay.platform or "",
        "agency_name": agency_name or "",
    }


def render(text: str, values: dict) -> str:
    """Remplace `{{variable}}`. Une variable hors liste reste visible : c'est une faute de saisie."""
    return _VAR.sub(lambda m: values[m.group(1)] if m.group(1) in values else m.group(0), text or "")


def unknown_placeholders(text: str) -> list[str]:
    return sorted({v for v in _VAR.findall(text or "") if v not in PLACEHOLDERS})


ACCESS_PLACEHOLDERS = ("access_code",)


def needs_access(text: str) -> bool:
    """Le gabarit annonce-t-il le code d'entrée ?

    Seul le code fait attendre : il n'existe qu'une fois émis. Les consignes d'accès sont un
    réglage du bien, et un gabarit de remise de clés ne doit pas rester bloqué derrière un
    code qui ne viendra jamais.
    """
    return any(v in ACCESS_PLACEHOLDERS for v in _VAR.findall(text or ""))


def due_at(template, stay) -> datetime | None:
    """Moment d'envoi d'un gabarit pour un séjour."""
    offset = timedelta(hours=template.offset_hours or 0)
    if template.trigger_event == "on_booking":
        return stay.synced_at or stay.created_at
    if template.trigger_event == "before_check_in":
        return stay.check_in - offset
    if template.trigger_event == "after_check_in":
        return stay.check_in + offset
    if template.trigger_event == "before_check_out":
        return stay.check_out - offset
    if template.trigger_event == "after_check_out":
        return stay.check_out + offset
    return None


def is_due(template, stay, now: datetime) -> bool:
    when = due_at(template, stay)
    return bool(when and when <= now and when >= now - timedelta(hours=LATE_GRACE_HOURS))
