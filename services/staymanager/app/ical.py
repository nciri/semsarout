"""Calendriers des plateformes de location courte durée : récupération, lecture, séjours.

Repris de StayManager (`backend/app/utils/ical_parser.py`), resserré sur ce que les
plateformes publient réellement :

- **Airbnb** : un VEVENT par séjour, résumé « Reserved », description portant le code de
  confirmation et les 4 derniers chiffres du téléphone. Le nom du voyageur n'y est pas.
- **Booking.com** : résumé « CLOSED - Nom du client » ou « Not available ».
- **VRBO** : résumé « Reserved - Nom ».

Deux partis pris :

- **Ne rien inventer.** Un calendrier ne dit pas le prix, ni l'e-mail, ni le nom complet
  chez Airbnb. Les champs absents restent vides plutôt que devinés.
- **L'URL est fournie par l'agence**, donc contrôlée comme celle d'un connecteur : https,
  hôte résolu publiquement, pas de redirection suivie. Sans cela, notre serveur irait lire
  n'importe quel service interne à la demande d'un client.
"""
import ipaddress
import re
import socket
from datetime import date, datetime, time, timezone
from urllib.parse import urlsplit

import httpx
from icalendar import Calendar

TIMEOUT = 20.0
MAX_BYTES = 5 * 1024 * 1024          # un calendrier d'un an pèse quelques dizaines de Ko
PLATFORMS = ("airbnb", "booking", "vrbo", "autre")

BLOCKED_WORDS = ("not available", "blocked", "closed", "unavailable", "indisponible")
CANCELLED_WORDS = ("cancelled", "canceled", "annul")

_NAME_PATTERNS = (
    r"^reserved\s*[-–]\s*(.+)$",          # VRBO : « Reserved - Jane Doe »
    r"^closed\s*[-–]\s*(.+)$",            # Booking : « CLOSED - Jane Doe »
    r"^reserved\s+for\s+(.+?)(?:\s+\(|$)",
)
_GENERIC_NAMES = ("reserved", "airbnb", "not available", "phone number", "closed",
                  "blocked", "unavailable")


class IcalError(Exception):
    """Calendrier illisible ou URL refusée : message lisible pour l'agence."""


def safe_ical_url(raw: str) -> str:
    """URL de calendrier acceptable, normalisée. Lève `IcalError` sinon."""
    parts = urlsplit((raw or "").strip())
    if parts.scheme != "https":
        raise IcalError("L'URL du calendrier doit commencer par https://.")
    if parts.username or parts.password:
        raise IcalError("L'URL ne doit pas contenir d'identifiant.")
    host = (parts.hostname or "").lower()
    if not host:
        raise IcalError("URL invalide.")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise IcalError("Hôte du calendrier introuvable.") from exc
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved
                or addr.is_multicast or addr.is_unspecified):
            raise IcalError("Adresse interdite : le calendrier doit être public.")
    return parts.geturl()


def fetch(url: str) -> str:
    """Contenu du calendrier. L'URL est revalidée ici : elle peut dater d'hier."""
    checked = safe_ical_url(url)
    try:
        resp = httpx.get(checked, timeout=TIMEOUT, follow_redirects=False,
                         headers={"User-Agent": "SemsarOut/1.0 (calendriers)"})
    except httpx.HTTPError as exc:
        raise IcalError(f"Calendrier injoignable : {exc.__class__.__name__}") from exc
    if resp.status_code >= 400:
        raise IcalError(f"Réponse {resp.status_code} de la plateforme.")
    if len(resp.content) > MAX_BYTES:
        raise IcalError("Calendrier trop volumineux.")
    return resp.text


def _as_utc(value) -> datetime:
    """Un VEVENT donne soit un instant, soit un jour entier (arrivées/départs iCal)."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    raise IcalError("Date d'événement illisible.")


def _status_of(summary: str, has_guest_name: bool) -> str:
    """Réservation, blocage ou annulation.

    Booking.com écrit « CLOSED - Salma Bennani » pour une **réservation** et « CLOSED -
    Not available » pour un blocage : le mot-clé ne suffit pas, c'est la présence d'un nom
    qui tranche. Sans cette nuance, toutes les réservations Booking passaient en « bloqué »
    et aucune double réservation n'était détectée.
    """
    low = summary.lower()
    if any(word in low for word in CANCELLED_WORDS):
        return "cancelled"
    if has_guest_name:
        return "confirmed"
    return "blocked" if any(word in low for word in BLOCKED_WORDS) else "confirmed"


def _is_generic(text: str) -> bool:
    """« Reserved », « Not available », « Blocked »… : une étiquette, pas un nom."""
    low = (text or "").lower().strip()
    return (not low) or low in _GENERIC_NAMES or any(word in low for word in BLOCKED_WORDS)


def guest_name(summary: str) -> str | None:
    """Nom du voyageur quand la plateforme le publie. Airbnb ne le publie pas."""
    clean = (summary or "").strip()
    for pattern in _NAME_PATTERNS:
        match = re.match(pattern, clean, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            if not _is_generic(candidate):
                return candidate
    return None if _is_generic(clean) else clean


def _details(description: str) -> dict:
    """Code de confirmation et téléphone partiel, tels qu'Airbnb les met en description."""
    out = {"confirmation_code": None, "phone_partial": None}
    code = re.search(r"reservations/details/(\w+)", description or "")
    if code:
        out["confirmation_code"] = code.group(1)
    # Le libellé d'Airbnb contient lui-même un chiffre (« Last 4 Digits ») : on s'ancre
    # sur le deux-points, pas sur « le premier nombre après l'étiquette ».
    phone = re.search(r"Phone Number[^:\n]*:\s*\**(\d{4})", description or "", re.IGNORECASE)
    if phone:
        out["phone_partial"] = f"****{phone.group(1)}"
    return out


def _guest_count(text: str) -> int | None:
    match = re.search(r"(\d+)\s+(?:guests?|voyageurs?|personnes?)", text or "", re.IGNORECASE)
    return int(match.group(1)) if match else None


def parse(ical_data: str, platform: str) -> list[dict]:
    """Séjours lus dans un calendrier. Les événements sans dates sont ignorés."""
    try:
        calendar = Calendar.from_ical(ical_data)
    except Exception as exc:  # noqa: BLE001 — la bibliothèque lève des types variés
        raise IcalError("Calendrier illisible.") from exc

    stays = []
    for component in calendar.walk():
        if component.name != "VEVENT":
            continue
        dtstart, dtend = component.get("dtstart"), component.get("dtend")
        if not dtstart or not dtend:
            continue
        summary = str(component.get("summary", "")).strip()
        description = str(component.get("description", ""))
        uid = str(component.get("uid", "")).strip()
        details = _details(description)
        check_in, check_out = _as_utc(dtstart.dt), _as_utc(dtend.dt)
        name = guest_name(summary)
        stays.append({
            "external_id": details["confirmation_code"] or uid or None,
            "platform": platform,
            "guest_name": name,
            "phone_partial": details["phone_partial"],
            "check_in": check_in,
            "check_out": check_out,
            "nights": max((check_out.date() - check_in.date()).days, 0),
            "status": _status_of(summary, bool(name)),
            "guest_count": _guest_count(f"{summary} {description}"),
            "raw_data": {"summary": summary, "description": description, "uid": uid},
        })
    return stays


def overlapping_ids(rows) -> set:
    """Identifiants des séjours qui se chevauchent — la double réservation à signaler.

    `rows` : objets portant `id`, `check_in`, `check_out`, `status`. Un départ le jour
    d'une arrivée n'est pas un conflit : c'est la rotation normale.
    """
    confirmed = sorted((r for r in rows if r.status == "confirmed"), key=lambda r: r.check_in)
    clashing = set()
    for i, stay in enumerate(confirmed):
        for other in confirmed[i + 1:]:
            if other.check_in >= stay.check_out:
                break
            clashing.add(stay.id)
            clashing.add(other.id)
    return clashing
