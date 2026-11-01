"""Codes d'entrée d'un séjour : mode du bien, génération, révocation.

Reprise de StayManager (`app/routes/smart_locks.py`, `app/routes/reservation_passcodes.py`)
avec deux partis pris :

- **Le mode manuel marche tout seul.** Une agence sans serrure connectée pose son code à la
  main et la messagerie de séjour le reprend : la fonctionnalité sert dès le premier jour,
  sans compte TTLock.
- **Un seul code actif par séjour.** Générer un nouveau code révoque le précédent, chez
  nous *et* chez la serrure : deux codes en circulation, c'est une porte qu'on ne referme
  plus.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from . import ttlock
from .db import get_db
from .gate import gate
from .models import PropertyAccess, PropertyRO, StayAccessCode, StayManagerReservation
from .util import err, iso, json_body

router = APIRouter()

MODES = ("traditional", "manual", "ttlock")
CODE_MAX = 20


def _access_dict(a: PropertyAccess, title: str | None = None) -> dict:
    return {"property_id": a.property_id, "property_title": title, "mode": a.mode,
            "instructions": a.instructions,
            # Jamais les identifiants : seulement s'ils sont posés.
            "configured": bool(a.credentials), "updated_at": iso(a.updated_at)}


def _code_dict(c: StayAccessCode) -> dict:
    return {"id": c.id, "reservation_id": c.reservation_id, "mode": c.mode, "code": c.code,
            "valid_from": iso(c.valid_from), "valid_until": iso(c.valid_until),
            "status": c.status, "created_at": iso(c.created_at), "revoked_at": iso(c.revoked_at)}


def _own_stay(db: Session, stay_id: int, principal: Principal):
    if (g := gate(principal)) is not None:
        return None, g
    stay = db.get(StayManagerReservation, stay_id)
    if stay is None or stay.agency_id != principal.agency_id:
        return None, err("Séjour introuvable", 404)
    return stay, None


def active_code(db: Session, reservation_id: int) -> StayAccessCode | None:
    return (db.query(StayAccessCode)
            .filter(StayAccessCode.reservation_id == reservation_id,
                    StayAccessCode.status == "active")
            .order_by(StayAccessCode.id.desc()).first())


def _active_ttlock_codes(db: Session, access: PropertyAccess) -> list[StayAccessCode]:
    """Codes TTLock encore actifs sur les séjours de ce bien."""
    stay_ids = [row.id for row in db.query(StayManagerReservation.id)
                .filter(StayManagerReservation.agency_id == access.agency_id,
                        StayManagerReservation.property_id == access.property_id).all()]
    if not stay_ids:
        return []
    return (db.query(StayAccessCode)
            .filter(StayAccessCode.reservation_id.in_(stay_ids),
                    StayAccessCode.status == "active",
                    StayAccessCode.mode == "ttlock").all())


def revoke_codes_of_stay(db: Session, stay) -> list[str]:
    """Retire les codes d'un séjour annulé ou déplacé. Renvoie les échecs à signaler."""
    code = active_code(db, stay.id)
    if code is None:
        return []
    entry = access_of(db, stay.agency_id, stay.property_id) if stay.property_id else None
    failure = _revoke(db, code, entry.credentials if entry else None)
    return [failure] if failure else []


def access_of(db: Session, agency_id: int, property_id: int) -> PropertyAccess | None:
    return (db.query(PropertyAccess)
            .filter(PropertyAccess.agency_id == agency_id,
                    PropertyAccess.property_id == property_id).first())


def _revoke(db: Session, code: StayAccessCode, credentials: dict | None) -> str | None:
    """Révoque un code. Renvoie le message à montrer à l'agence si la serrure n'a pas suivi.

    Un code TTLock marqué « révoqué » chez nous mais toujours valide sur la serrure est le
    pire des deux mondes : la ligne ment. Faute d'identifiants utilisables, on le dit.
    """
    failure = None
    if code.mode == "ttlock" and code.external_id:
        if not credentials:
            failure = ("Code retiré de SemsarOut, mais la serrure n'a pas pu être contactée "
                       "(identifiants TTLock absents) : supprimez-le depuis l'application TTLock.")
        else:
            try:
                ttlock.revoke_code(credentials, code.external_id)
            except ttlock.LockError as exc:
                failure = str(exc)
    code.status = "revoked"
    code.revoked_at = datetime.utcnow()
    return failure


@router.get("/backoffice/sejours/acces")
def list_access(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Mode d'entrée de chaque bien configuré."""
    if (g := gate(principal)) is not None:
        return g
    rows = (db.query(PropertyAccess)
            .filter(PropertyAccess.agency_id == principal.agency_id)
            .order_by(PropertyAccess.property_id).all())
    titles = {r.property_id: (db.get(PropertyRO, r.property_id).title
                              if db.get(PropertyRO, r.property_id) else None) for r in rows}
    return {"access": [_access_dict(a, titles.get(a.property_id)) for a in rows],
            "modes": list(MODES)}


@router.put("/backoffice/sejours/acces/{property_id}")
async def set_access(property_id: int, request: Request,
                     principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    """Mode d'entrée d'un bien. Les identifiants TTLock ne sont acceptés qu'en mode `ttlock`."""
    if (g := gate(principal)) is not None:
        return g
    ro = db.get(PropertyRO, property_id)
    if ro is None or ro.agency_id != principal.agency_id:
        return err("Bien introuvable dans votre portefeuille", 400)
    data = await json_body(request)
    mode = (data.get("mode") or "").strip()
    if mode not in MODES:
        return err("Mode d'entrée inconnu", 400)
    # Recherche par bien seul : la contrainte d'unicité porte sur le bien, donc une ligne
    # d'une autre agence doit être refusée, pas doublée.
    access = db.query(PropertyAccess).filter(PropertyAccess.property_id == property_id).first()
    if access is not None and access.agency_id != principal.agency_id:
        return err("Bien introuvable dans votre portefeuille", 400)
    # Tout est validé AVANT d'écrire : un refus ne doit pas laisser de ligne à moitié posée,
    # qui ferait échouer la tentative suivante sur la contrainte d'unicité.
    credentials = None
    if mode == "ttlock":
        provided = {k: v for k, v in (data.get("credentials") or {}).items() if v}
        if provided:
            try:
                credentials = ttlock.credentials_from(provided)
            except ttlock.LockError as exc:
                return err(str(exc), 400)
        elif access is not None and access.credentials:
            credentials = access.credentials
        else:
            return err("Identifiants TTLock obligatoires pour ce mode.", 400)

    # Les codes posés avec les anciens identifiants doivent être retirés de la serrure
    # AVANT qu'on perde ces identifiants : sinon ils resteraient valides pour toujours.
    warnings = []
    if access is not None and access.credentials and access.credentials != credentials:
        for code in _active_ttlock_codes(db, access):
            failure = _revoke(db, code, access.credentials)
            if failure:
                warnings.append(failure)

    if access is None:
        access = PropertyAccess(agency_id=principal.agency_id, property_id=property_id)
        db.add(access)
    access.mode = mode
    access.instructions = (data.get("instructions") or "").strip()[:2000] or None
    # Hors mode TTLock, les identifiants n'ont plus de raison d'être gardés.
    access.credentials = credentials
    db.commit()
    out = {"access": _access_dict(access, ro.title)}
    if warnings:
        out["warning"] = " ".join(warnings)
    return out


@router.get("/backoffice/sejours/{stay_id}/code")
def get_code(stay_id: int, principal: Principal = Depends(get_principal),
             db: Session = Depends(get_db)):
    stay, e = _own_stay(db, stay_id, principal)
    if e:
        return e
    access = access_of(db, principal.agency_id, stay.property_id) if stay.property_id else None
    code = active_code(db, stay.id)
    return {"code": _code_dict(code) if code else None,
            "mode": access.mode if access else "traditional",
            "instructions": access.instructions if access else None}


@router.post("/backoffice/sejours/{stay_id}/code", status_code=201)
async def issue_code(stay_id: int, request: Request,
                     principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    """Pose un code pour le séjour : saisi par l'agence, ou demandé à la serrure."""
    stay, e = _own_stay(db, stay_id, principal)
    if e:
        return e
    if stay.status != "confirmed":
        return err("Ce séjour n'est pas confirmé : aucun code ne doit l'ouvrir.", 400)
    access = access_of(db, principal.agency_id, stay.property_id) if stay.property_id else None
    mode = access.mode if access else "traditional"
    if mode == "traditional":
        return err("Ce bien se remet en main propre : configurez un mode d'entrée par code.", 400)

    data = await json_body(request)
    valid_from, valid_until = ttlock.window(stay.check_in, stay.check_out)
    if mode == "manual":
        code_value = (data.get("code") or "").strip()[:CODE_MAX]
        if not code_value.isdigit() or len(code_value) < 4:
            return err("Le code doit comporter au moins 4 chiffres.", 400)
        external_id = None
    else:
        try:
            issued = ttlock.create_code(access.credentials or {}, stay.check_in, stay.check_out)
        except ttlock.LockError as exc:
            return err(str(exc), 502)
        code_value, external_id = issued["code"], issued["external_id"]

    previous = active_code(db, stay.id)
    warning = _revoke(db, previous, access.credentials if access else None) if previous else None
    code = StayAccessCode(agency_id=stay.agency_id, reservation_id=stay.id, mode=mode,
                          code=code_value, external_id=external_id,
                          valid_from=valid_from, valid_until=valid_until)
    db.add(code)
    db.commit()
    out = {"code": _code_dict(code)}
    if warning:
        # L'ancien code n'a peut-être pas été retiré de la serrure : l'agence doit le savoir.
        out["warning"] = warning
    return out


@router.delete("/backoffice/sejours/{stay_id}/code")
def revoke_stay_code(stay_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    stay, e = _own_stay(db, stay_id, principal)
    if e:
        return e
    code = active_code(db, stay.id)
    if code is None:
        return err("Aucun code actif pour ce séjour", 404)
    access = access_of(db, principal.agency_id, stay.property_id) if stay.property_id else None
    failure = _revoke(db, code, access.credentials if access else None)
    db.commit()
    return {"code": _code_dict(code), **({"warning": failure} if failure else {})}
