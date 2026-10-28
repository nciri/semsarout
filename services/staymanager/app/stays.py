"""Séjours courte durée : synchronisation d'une source iCal et détection des conflits.

La synchronisation est un rapprochement, pas un import : une plateforme republie son
calendrier entier à chaque fois. On rapproche donc par `external_id` quand elle en fournit
un (code de confirmation Airbnb, UID), sinon par les dates — et **ce qui a disparu du
calendrier est annulé**, pas supprimé : un séjour annulé hier doit rester lisible
aujourd'hui, le ménage et les codes d'accès en dépendent.
"""
from datetime import datetime

from . import access, ical
from .models import IcalSource, StayManagerReservation


def _key(stay: dict) -> str:
    """Clé de rapprochement : l'identifiant de la plateforme, sinon le couple de dates."""
    return stay["external_id"] or f"{stay['check_in'].date()}~{stay['check_out'].date()}"


def _existing_key(row: StayManagerReservation) -> str:
    return row.external_id or f"{row.check_in.date()}~{row.check_out.date()}"


def refresh_conflicts(db, property_id: int) -> int:
    """Marque les séjours du bien qui se chevauchent. Renvoie leur nombre.

    Le calcul porte sur tout le bien, pas sur une source : la double réservation arrive
    justement entre deux plateformes qui ne se parlent pas.
    """
    rows = (db.query(StayManagerReservation)
            .filter(StayManagerReservation.property_id == property_id).all())
    clashing = ical.overlapping_ids(rows)
    for row in rows:
        row.has_conflict = row.id in clashing
    return len(clashing)


def sync_source(db, source: IcalSource) -> dict:
    """Rejoue le calendrier d'une source. Lève `ical.IcalError` si la plateforme refuse."""
    stays = ical.parse(ical.fetch(source.ical_url), source.platform)

    rows = (db.query(StayManagerReservation)
            .filter(StayManagerReservation.ical_source_id == source.id).all())
    by_key = {_existing_key(r): r for r in rows}
    seen, created, updated = set(), 0, 0

    for stay in stays:
        key = _key(stay)
        seen.add(key)
        row = by_key.get(key)
        if row is None:
            row = StayManagerReservation(
                agency_id=source.agency_id, property_id=source.property_id,
                ical_source_id=source.id, source="ical")
            db.add(row)
            created += 1
        else:
            updated += 1
        row.external_id = stay["external_id"]
        row.platform = stay["platform"]
        row.check_in, row.check_out, row.nights = stay["check_in"], stay["check_out"], stay["nights"]
        row.guest_name = stay["guest_name"]
        row.guest_phone = stay["phone_partial"]
        row.guest_count = stay["guest_count"]
        row.status = stay["status"]
        row.raw_data = stay["raw_data"]
        row.synced_at = datetime.utcnow()

    # Disparu du calendrier = annulé chez la plateforme. Le code d'entrée tombe avec le
    # séjour : un voyageur dont la réservation a disparu ne doit plus pouvoir ouvrir.
    cancelled, code_warnings = 0, []
    for key, row in by_key.items():
        if key not in seen and row.status != "cancelled":
            row.status = "cancelled"
            row.synced_at = datetime.utcnow()
            code_warnings += access.revoke_codes_of_stay(db, row)
            cancelled += 1

    db.flush()
    conflicts = refresh_conflicts(db, source.property_id)

    source.status = "ok"
    source.last_error = None
    source.last_synced_at = datetime.utcnow()
    source.reservations_count = len([s for s in stays if s["status"] != "cancelled"])
    out = {"created": created, "updated": updated, "cancelled": cancelled,
           "conflicts": conflicts, "total": len(stays)}
    if code_warnings:
        out["code_warnings"] = code_warnings
    return out


def mark_failure(source: IcalSource, message: str) -> None:
    source.status = "error"
    source.last_error = message[:255]
    source.last_synced_at = datetime.utcnow()
