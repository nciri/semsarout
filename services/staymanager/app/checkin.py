"""Enregistrement du voyageur : lien privé, occupants déclarés, pièce d'identité.

Reprise de StayManager (`app/routes/verification.py`, `app/routes/guests.py`) adaptée à
SemsarOut :

- **Le lien remplace le compte.** Un voyageur de passage ne crée pas de compte : l'agence
  lui envoie une URL privée, valable jusqu'au lendemain du départ. Le jeton n'est stocké
  que haché, et l'URL complète n'est rendue qu'une fois, à sa création.
- **Pas d'OCR.** StayManager lisait la pièce automatiquement (`app/utils/ocr.py`) ; aucun
  moteur n'est raccordé ici, donc le voyageur saisit son nom et son numéro, et l'agence
  compare à la photo. Mieux vaut une saisie vérifiée qu'une extraction inventée.
- **Pas de second service de signature.** Le contrat de location courte durée reste du
  ressort de `contract` + `semsar_signing` : rien n'est réécrit ici.
- **Pas de KYC Didit.** Il vaut pour les comptes (`identity`), pas pour un occupant de
  passage dont on ne garde qu'une pièce justificative.
"""
import hashlib
import secrets
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from . import contract_client
from .db import get_db
from .gate import gate
from .models import (
    PropertyRO, StayCheckinLink, StayGuest, StayGuestDocument, StayManagerReservation,
)
from .util import attachment_headers, err, iso, json_body, safe_filename

router = APIRouter()

DOCUMENT_TYPES = ("cin", "passeport", "titre_sejour")
GUEST_STATUSES = ("declared", "validated", "rejected")
# Le lien sert encore après le départ : la pièce manquante se réclame le jour même.
LINK_GRACE_DAYS = 1
MAX_GUESTS = 12
ALLOWED_DOC_TYPES = ("image/jpeg", "image/png", "image/webp", "application/pdf")
MAX_DOC_SIZE = 8 * 1024 * 1024
# Recto, verso, et une reprise si la photo est ratée : au-delà, c'est du remplissage.
MAX_DOCS_PER_GUEST = 3


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _bounded_body(request: Request) -> bytes | None:
    """Corps lu par morceaux : un `content-length` absent ou menteur ne doit rien changer."""
    size, chunks = 0, []
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_DOC_SIZE:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def _guest_dict(db: Session, g: StayGuest, with_documents: bool = True) -> dict:
    out = {"id": g.id, "full_name": g.full_name, "is_lead": bool(g.is_lead),
           "birth_date": iso(g.birth_date), "nationality": g.nationality,
           "document_type": g.document_type, "document_number": g.document_number,
           "status": g.status, "review_note": g.review_note, "created_at": iso(g.created_at)}
    if with_documents:
        docs = db.query(StayGuestDocument).filter(StayGuestDocument.guest_id == g.id).all()
        out["documents"] = [{"id": d.id, "filename": d.filename} for d in docs]
    return out


def _guests_of(db: Session, reservation_id: int) -> list[StayGuest]:
    return (db.query(StayGuest).filter(StayGuest.reservation_id == reservation_id)
            .order_by(StayGuest.is_lead.desc(), StayGuest.id).all())


def _link_dict(link: StayCheckinLink, token: str | None = None) -> dict:
    out = {"id": link.id, "reservation_id": link.reservation_id, "status": link.status,
           "expires_at": iso(link.expires_at), "submitted_at": iso(link.submitted_at)}
    if token:
        # Rendu une seule fois : le jeton n'est gardé que haché.
        out["token"] = token
        out["path"] = f"/sejour/enregistrement/{token}"
    return out


def _own_stay(db: Session, stay_id: int, principal: Principal):
    if (g := gate(principal)) is not None:
        return None, g
    stay = db.get(StayManagerReservation, stay_id)
    if stay is None or stay.agency_id != principal.agency_id:
        return None, err("Séjour introuvable", 404)
    return stay, None


# ---- Côté agence -----------------------------------------------------------------------

@router.post("/backoffice/sejours/{stay_id}/enregistrement", status_code=201)
def create_checkin_link(stay_id: int, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    """Crée (ou renouvelle) le lien d'enregistrement du séjour et renvoie son URL."""
    stay, e = _own_stay(db, stay_id, principal)
    if e:
        return e
    token = secrets.token_urlsafe(32)
    link = (db.query(StayCheckinLink)
            .filter(StayCheckinLink.reservation_id == stay.id).first())
    if link is None:
        link = StayCheckinLink(agency_id=stay.agency_id, reservation_id=stay.id,
                               token_hash=_hash(token), expires_at=datetime.utcnow())
        db.add(link)
    else:
        link.token_hash = _hash(token)
        link.status = "sent"
        link.submitted_at = None
    link.expires_at = stay.check_out + timedelta(days=LINK_GRACE_DAYS)
    db.commit()
    return {"link": _link_dict(link, token)}


@router.get("/backoffice/sejours/{stay_id}/enregistrement")
def get_checkin(stay_id: int, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    stay, e = _own_stay(db, stay_id, principal)
    if e:
        return e
    link = (db.query(StayCheckinLink)
            .filter(StayCheckinLink.reservation_id == stay.id).first())
    guests = _guests_of(db, stay.id)
    return {"link": _link_dict(link) if link else None,
            "guests": [_guest_dict(db, g) for g in guests],
            "declared": len(guests), "expected": stay.guest_count,
            "document_types": list(DOCUMENT_TYPES)}


@router.patch("/backoffice/sejours/voyageurs/{guest_id}")
async def review_guest(guest_id: int, request: Request,
                       principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    """Verdict de l'agence sur un occupant : la photo correspond-elle à la saisie ?"""
    guest = db.get(StayGuest, guest_id)
    stay, e = _own_stay(db, guest.reservation_id, principal) if guest else (None, None)
    if guest is None or stay is None:
        return e or err("Occupant introuvable", 404)
    data = await json_body(request)
    status = (data.get("status") or "").strip()
    if status not in GUEST_STATUSES:
        return err("Statut inconnu", 400)
    guest.status = status
    guest.review_note = (data.get("review_note") or "").strip()[:255] or None
    db.commit()
    return {"guest": _guest_dict(db, guest)}


@router.get("/backoffice/sejours/voyageurs/pieces/{doc_id}")
def download_guest_document(doc_id: int, principal: Principal = Depends(get_principal),
                            db: Session = Depends(get_db)):
    doc = db.get(StayGuestDocument, doc_id)
    guest = db.get(StayGuest, doc.guest_id) if doc else None
    stay, e = _own_stay(db, guest.reservation_id, principal) if guest else (None, None)
    if stay is None:
        return e or err("Pièce introuvable", 404)
    from . import storage
    data = storage.photos_storage().get(doc.file_key)
    return Response(data, media_type=doc.content_type or "application/octet-stream",
                    headers=attachment_headers(doc.filename or "piece"))


# ---- Côté voyageur : le lien tient lieu d'identification -------------------------------

def _by_token(db: Session, token: str):
    link = (db.query(StayCheckinLink)
            .filter(StayCheckinLink.token_hash == _hash(token)).first())
    if link is None:
        return None, None, err("Lien inconnu ou expiré.", 404)
    if link.expires_at < datetime.utcnow():
        return None, None, err("Ce lien a expiré. Demandez-en un nouveau à votre hôte.", 410)
    stay = db.get(StayManagerReservation, link.reservation_id)
    if stay is None:
        return None, None, err("Lien inconnu ou expiré.", 404)
    return link, stay, None


@router.get("/sejours/enregistrement/{token}")
def guest_view(token: str, db: Session = Depends(get_db)):
    """Ce que le voyageur voit : son séjour, et ce qu'il a déjà déclaré. Rien d'autre."""
    link, stay, e = _by_token(db, token)
    if e:
        return e
    ro = db.get(PropertyRO, stay.property_id) if stay.property_id else None
    guests = _guests_of(db, stay.id)
    return {"stay": {"property_title": ro.title if ro else None, "check_in": iso(stay.check_in),
                     "check_out": iso(stay.check_out), "nights": stay.nights,
                     "expected_guests": stay.guest_count},
            "status": link.status, "expires_at": iso(link.expires_at),
            "guests": [_guest_dict(db, g) for g in guests],
            # Le contrat n'est annoncé que s'il existe : rien ne sert de demander une
            # signature à un voyageur dont l'agence n'a pas établi de contrat.
            "contract": ({"status": stay.contract_status} if stay.contract_id else None),
            "document_types": list(DOCUMENT_TYPES)}


@router.post("/sejours/enregistrement/{token}/voyageurs", status_code=201)
async def declare_guest(token: str, request: Request, db: Session = Depends(get_db)):
    link, stay, e = _by_token(db, token)
    if e:
        return e
    data = await json_body(request)
    name = (data.get("full_name") or "").strip()[:200]
    if len(name) < 2:
        return err("Le nom complet est obligatoire.", 400)
    existing = _guests_of(db, stay.id)
    if len(existing) >= MAX_GUESTS:
        return err("Trop d'occupants déclarés.", 400)
    doc_type = (data.get("document_type") or "").strip()
    if doc_type and doc_type not in DOCUMENT_TYPES:
        return err("Type de pièce inconnu.", 400)
    birth = None
    if (data.get("birth_date") or "").strip():
        try:
            birth = date.fromisoformat(data["birth_date"].strip())
        except ValueError:
            return err("Date de naissance invalide.", 400)
    guest = StayGuest(reservation_id=stay.id, full_name=name,
                      is_lead=not any(g.is_lead for g in existing),
                      birth_date=birth,
                      nationality=(data.get("nationality") or "").strip()[:60] or None,
                      document_type=doc_type or None,
                      document_number=(data.get("document_number") or "").strip()[:60] or None)
    db.add(guest)
    db.commit()
    return {"guest": _guest_dict(db, guest)}


@router.post("/sejours/enregistrement/{token}/voyageurs/{guest_id}/piece", status_code=201)
async def upload_guest_document(token: str, guest_id: int, request: Request,
                                db: Session = Depends(get_db)):
    """Pièce en corps brut : un seul transfert depuis le téléphone du voyageur."""
    link, stay, e = _by_token(db, token)
    if e:
        return e
    guest = db.get(StayGuest, guest_id)
    if guest is None or guest.reservation_id != stay.id:
        return err("Occupant introuvable.", 404)
    if (db.query(StayGuestDocument).filter(StayGuestDocument.guest_id == guest.id).count()
            >= MAX_DOCS_PER_GUEST):
        return err("Trop de pièces déposées pour cet occupant.", 400)
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_DOC_TYPES:
        return err("Format accepté : JPEG, PNG, WebP ou PDF.", 400)
    body = await _bounded_body(request)
    if body is None:
        return err("Fichier trop volumineux (max 8 Mo).", 400)
    if not body:
        return err("Fichier vide.", 400)
    from . import storage
    key = f"enregistrement/{stay.id}/{uuid.uuid4().hex}"
    storage.photos_storage().put(key, body, content_type)
    doc = StayGuestDocument(guest_id=guest.id, file_key=key, content_type=content_type,
                            filename=safe_filename(request.query_params.get("filename"), "piece"))
    # Une pièce redéposée relance l'examen : le verdict précédent portait sur l'ancienne.
    guest.status = "declared"
    guest.review_note = None
    db.add(doc)
    db.commit()
    return {"document": {"id": doc.id, "filename": doc.filename}}


@router.post("/sejours/enregistrement/{token}/valider")
def submit_checkin(token: str, db: Session = Depends(get_db)):
    """Le voyageur dit avoir fini : l'agence sait qu'elle peut examiner le dossier."""
    link, stay, e = _by_token(db, token)
    if e:
        return e
    guests = _guests_of(db, stay.id)
    if not guests:
        return err("Déclarez au moins un occupant.", 400)
    if not any(db.query(StayGuestDocument)
               .filter(StayGuestDocument.guest_id == g.id).first() for g in guests):
        return err("Déposez la pièce d'identité du voyageur principal.", 400)
    link.status = "submitted"
    link.submitted_at = datetime.utcnow()
    db.commit()
    return {"link": _link_dict(link)}


@router.post("/sejours/enregistrement/{token}/contrat")
async def sign_stay_contract(token: str, request: Request, db: Session = Depends(get_db)):
    """Acceptation du contrat par le voyageur, depuis son lien privé.

    Le nom saisi est consigné avec la date et l'adresse IP par le service `contract` : la
    signature vaut par sa trace, pas par une case cochée.
    """
    link, stay, e = _by_token(db, token)
    if e:
        return e
    if not stay.contract_id:
        return err("Aucun contrat à signer pour ce séjour.", 404)
    name = ((await json_body(request)).get("signer_name") or "").strip()[:200]
    if len(name) < 2:
        return err("Indiquez le nom qui signe le contrat.", 400)
    try:
        contract = contract_client.sign(stay.agency_id, stay.contract_id, name,
                                        (request.client.host if request.client else ""))
    except contract_client.ContractError as exc:
        return err(str(exc), 502)
    stay.contract_status = contract["status"]
    db.commit()
    return {"contract": {"status": contract["status"], "signed_at": contract.get("signed_at")}}
