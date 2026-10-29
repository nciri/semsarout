"""Fiche d'un séjour, saisie directe et vue calendrier.

Trois provenances cohabitent dans la même table : le miroir d'un compte StayManager, les
calendriers iCal des plateformes, et la **réservation directe** saisie ici (`source` vaut
alors `manual`). La distinction n'est pas cosmétique : un séjour venu d'un calendrier
appartient à la plateforme, qui le réécrit à chaque synchronisation — le modifier ici
reviendrait à perdre la modification au prochain passage. Seules les réservations directes
sont donc modifiables, et les champs que la plateforme ne publie pas (contact, prix, notes)
restent ouverts à tous via leurs routes dédiées.

La fiche agrège ce qui est éparpillé dans les autres modules (occupants, ménage, code
d'entrée, messages) : l'agent qui prépare une arrivée a une seule page à ouvrir.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from . import stays
from .db import get_db
from .gate import gate
from .models import (
    CleaningTask, PropertyRO, StayAccessCode, StayCheckinLink, StayGuest,
    StayManagerReservation, StayMessage,
)
from .util import err, iso, json_body

router = APIRouter()

# Statuts qu'une agence pose elle-même. `cancelled` passe par sa propre route (elle
# révoque le code d'entrée), les autres valeurs viennent des plateformes.
EDITABLE_STATUSES = ("confirmed", "blocked")
MAX_NIGHTS = 365
MAX_GUEST_COUNT = 30
# Un séjour saisi pour 2051 est une faute de frappe, pas une réservation.
MAX_YEARS_AHEAD = 5
NAME_MAX = 200
NOTE_MAX = 2000


def stay_dict(db: Session, r: StayManagerReservation) -> dict:
    """Ligne de planning : ce qui tient dans un tableau, sans requête par séjour."""
    ro = db.get(PropertyRO, r.property_id) if r.property_id else None
    return {"id": r.id, "property_id": r.property_id,
            "property_title": ro.title if ro else None,
            "platform": r.platform, "source": r.source, "external_id": r.external_id,
            "guest_name": r.guest_name, "guest_phone": r.guest_phone,
            "guest_email": r.guest_email, "guest_count": r.guest_count,
            "check_in": iso(r.check_in), "check_out": iso(r.check_out), "nights": r.nights,
            "status": r.status, "has_conflict": bool(r.has_conflict),
            "total_price": float(r.total_price) if r.total_price is not None else None,
            "cleaning_fee": float(r.cleaning_fee) if r.cleaning_fee is not None else None,
            "currency": r.currency, "contract_status": r.contract_status,
            "editable": r.source == "manual", "synced_at": iso(r.synced_at)}


def _own_stay(db: Session, stay_id: int, principal: Principal):
    row = db.get(StayManagerReservation, stay_id)
    if row is None or row.agency_id != principal.agency_id:
        return None, err("Séjour introuvable", 404)
    return row, None


def _parse_day(raw, field: str):
    """Date d'arrivée ou de départ : la journée suffit, l'heure appartient au bien."""
    if not raw:
        return None, err(f"{field} obligatoire", 400)
    try:
        value = datetime.fromisoformat(str(raw))
    except ValueError:
        return None, err(f"{field} invalide", 400)
    return datetime(value.year, value.month, value.day), None


def _parse_amount(raw, field: str):
    if raw in (None, ""):
        return None, None
    try:
        amount = float(raw)
    except (TypeError, ValueError):
        return None, err(f"{field} invalide", 400)
    if amount < 0 or amount > 10_000_000:
        return None, err(f"{field} hors limites", 400)
    return amount, None


def _payload(data: dict, *, require_property: bool):
    out = {}
    if require_property:
        try:
            property_id = int(data.get("property_id") or 0)
        except (TypeError, ValueError):
            return None, err("Bien invalide", 400)
        if property_id <= 0:
            return None, err("Bien obligatoire", 400)
        out["property_id"] = property_id

    check_in, e = _parse_day(data.get("check_in"), "Date d'arrivée")
    if e:
        return None, e
    check_out, e = _parse_day(data.get("check_out"), "Date de départ")
    if e:
        return None, e
    if check_out <= check_in:
        return None, err("Le départ doit suivre l'arrivée", 400)
    nights = (check_out - check_in).days
    if nights > MAX_NIGHTS:
        return None, err(f"Un séjour ne peut dépasser {MAX_NIGHTS} nuits", 400)
    if check_in.year > datetime.utcnow().year + MAX_YEARS_AHEAD:
        return None, err("Date d'arrivée trop lointaine", 400)
    out.update({"check_in": check_in, "check_out": check_out, "nights": nights})

    status = (data.get("status") or "confirmed").strip()
    if status not in EDITABLE_STATUSES:
        return None, err("Statut invalide", 400)
    out["status"] = status

    guest_count = data.get("guest_count")
    if guest_count in (None, ""):
        out["guest_count"] = None
    else:
        try:
            guest_count = int(guest_count)
        except (TypeError, ValueError):
            return None, err("Nombre de voyageurs invalide", 400)
        if not 1 <= guest_count <= MAX_GUEST_COUNT:
            return None, err("Nombre de voyageurs hors limites", 400)
        out["guest_count"] = guest_count

    for field in ("total_price", "cleaning_fee"):
        amount, e = _parse_amount(data.get(field), "Montant")
        if e:
            return None, e
        out[field] = amount

    out["guest_name"] = (data.get("guest_name") or "").strip()[:NAME_MAX] or None
    out["guest_email"] = (data.get("guest_email") or "").strip()[:255] or None
    out["guest_phone"] = (data.get("guest_phone") or "").strip()[:50] or None
    out["guest_notes"] = (data.get("guest_notes") or "").strip()[:NOTE_MAX] or None
    out["special_requests"] = (data.get("special_requests") or "").strip()[:NOTE_MAX] or None
    return out, None


@router.get("/backoffice/sejours/calendrier")
def stays_calendar(request: Request, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    """Occupation d'un mois, bien par bien : `mois=AAAA-MM`, défaut le mois courant.

    Un séjour à cheval sur deux mois est renvoyé dans les deux : la barre d'occupation
    doit commencer au bord de la grille, pas au premier jour du séjour.
    """
    if (g := gate(principal)) is not None:
        return g
    raw = request.query_params.get("mois") or datetime.utcnow().strftime("%Y-%m")
    try:
        first = datetime.strptime(raw, "%Y-%m")
    except ValueError:
        return err("Mois invalide", 400)
    last = datetime(first.year + (first.month == 12), (first.month % 12) + 1, 1)

    q = (db.query(StayManagerReservation)
         .filter(StayManagerReservation.agency_id == principal.agency_id,
                 StayManagerReservation.status != "cancelled",
                 StayManagerReservation.check_in < last,
                 StayManagerReservation.check_out > first))
    if request.query_params.get("property_id", "").isdigit():
        q = q.filter(StayManagerReservation.property_id == int(request.query_params["property_id"]))
    rows = q.order_by(StayManagerReservation.check_in).all()

    properties = {}
    for r in rows:
        properties.setdefault(r.property_id, []).append(stay_dict(db, r))
    titles = {p.id: p.title for p in db.query(PropertyRO).filter(
        PropertyRO.id.in_(list(properties)))} if properties else {}
    return {
        "month": first.strftime("%Y-%m"),
        "days": (last - first).days,
        "properties": [{"property_id": pid, "property_title": titles.get(pid), "stays": items}
                       for pid, items in sorted(properties.items(),
                                                key=lambda kv: (titles.get(kv[0]) or "", kv[0]))],
    }


@router.post("/backoffice/sejours", status_code=201)
async def create_stay(request: Request, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    """Réservation directe : la location de la main à la main, hors plateforme."""
    if (g := gate(principal)) is not None:
        return g
    data = await json_body(request)
    payload, e = _payload(data, require_property=True)
    if e:
        return e
    ro = db.get(PropertyRO, payload["property_id"])
    if ro is None or ro.agency_id != principal.agency_id:
        return err("Bien introuvable dans votre portefeuille", 400)

    row = StayManagerReservation(agency_id=principal.agency_id, source="manual",
                                 platform="direct", **payload)
    db.add(row)
    db.flush()
    # Le chevauchement n'est pas refusé : deux lignes qui se croisent, c'est précisément
    # ce que l'écran doit montrer pour qu'on tranche.
    stays.refresh_conflicts(db, row.property_id, principal.agency_id)
    db.commit()
    return {"stay": stay_dict(db, row)}


@router.get("/backoffice/sejours/{stay_id}")
def get_stay(stay_id: int, principal: Principal = Depends(get_principal),
             db: Session = Depends(get_db)):
    """Fiche complète : le séjour et tout ce qui lui est accroché."""
    if (g := gate(principal)) is not None:
        return g
    row, e = _own_stay(db, stay_id, principal)
    if e:
        return e

    guests = (db.query(StayGuest).filter(StayGuest.reservation_id == row.id)
              .order_by(StayGuest.is_lead.desc(), StayGuest.id).all())
    link = db.query(StayCheckinLink).filter(StayCheckinLink.reservation_id == row.id).first()
    task = db.query(CleaningTask).filter(CleaningTask.reservation_id == row.id).first()
    code = (db.query(StayAccessCode)
            .filter(StayAccessCode.reservation_id == row.id, StayAccessCode.status == "active")
            .order_by(StayAccessCode.id.desc()).first())
    messages = (db.query(StayMessage).filter(StayMessage.reservation_id == row.id)
                .order_by(StayMessage.due_at).all())
    other = (db.query(StayManagerReservation)
             .filter(StayManagerReservation.agency_id == principal.agency_id,
                     StayManagerReservation.property_id == row.property_id,
                     StayManagerReservation.id != row.id,
                     StayManagerReservation.status != "cancelled",
                     StayManagerReservation.check_in < row.check_out,
                     StayManagerReservation.check_out > row.check_in).all()) if row.has_conflict else []

    return {
        "stay": {**stay_dict(db, row),
                 "guest_notes": row.guest_notes, "special_requests": row.special_requests,
                 "created_at": iso(row.created_at)},
        "guests": [{"id": g.id, "full_name": g.full_name, "is_lead": bool(g.is_lead),
                    "status": g.status, "document_type": g.document_type,
                    "nationality": g.nationality} for g in guests],
        "checkin": ({"status": link.status, "expires_at": iso(link.expires_at),
                     "submitted_at": iso(link.submitted_at)} if link else None),
        "cleaning": ({"id": task.id, "status": task.status,
                      "scheduled_date": iso(task.scheduled_date),
                      "assigned_to_id": task.assigned_to_id} if task else None),
        "access_code": ({"id": code.id, "mode": code.mode, "code": code.code,
                         "valid_from": iso(code.valid_from),
                         "valid_until": iso(code.valid_until)} if code else None),
        "messages": [{"id": m.id, "subject": m.subject, "status": m.status,
                      "due_at": iso(m.due_at), "sent_at": iso(m.sent_at)} for m in messages],
        "conflicts": [stay_dict(db, o) for o in other],
    }


@router.put("/backoffice/sejours/{stay_id}")
async def update_stay(stay_id: int, request: Request,
                      principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if (g := gate(principal)) is not None:
        return g
    row, e = _own_stay(db, stay_id, principal)
    if e:
        return e
    if row.source != "manual":
        return err("Ce séjour vient d'un calendrier : la plateforme le réécrira à la "
                   "prochaine synchronisation", 400)
    data = await json_body(request)
    payload, e = _payload(data, require_property=False)
    if e:
        return e
    from . import access  # import tardif : access importe ce module pour la fiche

    # Un code d'entrée est calé sur les dates du séjour : décaler les dates sans le révoquer
    # laisserait une porte ouverte pendant des jours où plus personne n'est attendu.
    moved = (payload["check_in"] != row.check_in or payload["check_out"] != row.check_out
             or payload["status"] != row.status)
    for field, value in payload.items():
        setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    warnings = access.revoke_codes_of_stay(db, row) if moved else []
    db.flush()
    stays.refresh_conflicts(db, row.property_id, principal.agency_id)
    db.commit()
    return {"stay": stay_dict(db, row), "code_warnings": warnings}


@router.post("/backoffice/sejours/{stay_id}/annuler")
def cancel_stay(stay_id: int, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    """Annule le séjour et retire le code d'entrée : un séjour annulé n'ouvre plus rien."""
    if (g := gate(principal)) is not None:
        return g
    row, e = _own_stay(db, stay_id, principal)
    if e:
        return e
    if row.status == "cancelled":
        return {"stay": stay_dict(db, row), "code_warnings": []}
    from . import access  # import tardif : access importe déjà ce module pour la fiche

    row.status = "cancelled"
    row.updated_at = datetime.utcnow()
    warnings = access.revoke_codes_of_stay(db, row)
    task = (db.query(CleaningTask)
            .filter(CleaningTask.reservation_id == row.id,
                    CleaningTask.status.in_(("pending", "in_progress"))).first())
    if task is not None:
        task.status = "cancelled"
    db.flush()
    stays.refresh_conflicts(db, row.property_id, principal.agency_id)
    db.commit()
    return {"stay": stay_dict(db, row), "code_warnings": warnings}
