"""Router crm — dossier d'achat : pièces justificatives et qualification.

Deux portes sur le même dossier :

- l'**agence**, sur la fiche client de son portefeuille (`/backoffice/clients/{id}/documents`) ;
- l'**acquéreur**, sur son propre dossier (`/buyer-dossier`), reconnu par l'adresse de son
  compte. Sans cette porte, l'agence réclamerait les pièces par e-mail et les ressaisirait.

Le dépôt accepte le fichier en corps brut, comme les pièces de candidature locative : un
seul transfert, pas de multipart à assembler côté front.
"""
import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from . import qualification, users_client
from .db import get_db
from .models import BuyerDocument, Client
from .util import err, iso, json_body

router = APIRouter()

MAX_DOC_SIZE = 10 * 1024 * 1024
DOC_STATUSES = ("received", "validated", "rejected")


def doc_dict(d: BuyerDocument) -> dict:
    return {"id": d.id, "client_id": d.client_id, "doc_type": d.doc_type, "status": d.status,
            "filename": d.filename, "uploaded_by_user_id": d.uploaded_by_user_id,
            "created_at": iso(d.created_at)}


def documents_of(db: Session, client_id: int) -> list[BuyerDocument]:
    return (db.query(BuyerDocument).filter(BuyerDocument.client_id == client_id)
            .order_by(BuyerDocument.created_at.asc()).all())


def assess_client(c: Client, docs=None) -> dict:
    return qualification.assess(
        budget_max=c.budget_max, down_payment=c.down_payment,
        max_monthly_payment=c.max_monthly_payment,
        has_bank_preapproval=c.has_bank_preapproval,
        documents=None if docs is None else [(d.doc_type, d.status) for d in docs])


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if str(principal.sub).isdigit() else None


def _agency_client(db: Session, client_id: int, principal: Principal):
    """Fiche du portefeuille de l'agence de l'agent connecté, sinon 404/403."""
    c = db.get(Client, client_id)
    if c is None:
        return None, err("Client not found", 404)
    if principal.agency_id is None or c.agency_id != principal.agency_id:
        return None, err("Access denied", 403)
    return c, None


def _own_client(db: Session, client_id: int, principal: Principal):
    """Fiche dont l'e-mail est celui du compte connecté : le dossier appartient à l'acquéreur."""
    email = users_client.email_of(_uid(principal))
    if not email:
        return None, err("Access denied", 403)
    c = db.get(Client, client_id)
    if c is None or not c.email or c.email.lower() != email.lower():
        return None, err("Dossier introuvable.", 404)
    return c, None


async def _stored_document(request: Request, client_id: int, uploaded_by: int | None):
    """Lit le corps, le dépose dans l'objet-store et renvoie la pièce (non commitée)."""
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_DOC_SIZE:
        return None, err("Fichier trop volumineux (max 10 Mo).", 400)
    body = await request.body()
    if not body:
        return None, err("Fichier vide.", 400)
    if len(body) > MAX_DOC_SIZE:
        return None, err("Fichier trop volumineux (max 10 Mo).", 400)
    doc_type = request.query_params.get("doc_type", "autre")
    if doc_type not in qualification.DOC_TYPES:
        return None, err("Type de pièce inconnu.", 400)
    content_type = request.headers.get("content-type", "application/octet-stream")
    from . import storage
    key = f"buyer-documents/{client_id}/{uuid.uuid4().hex}"
    storage.docs_storage().put(key, body, content_type)
    return BuyerDocument(client_id=client_id, doc_type=doc_type, status="received", file_key=key,
                         filename=request.query_params.get("filename", "piece"),
                         content_type=content_type, uploaded_by_user_id=uploaded_by), None


def _download(db: Session, doc_id: int, client: Client):
    d = db.get(BuyerDocument, doc_id)
    if d is None or d.client_id != client.id:
        return err("Pièce introuvable.", 404)
    from . import storage
    data = storage.docs_storage().get(d.file_key)
    return Response(data, media_type=d.content_type or "application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename={d.filename or 'piece'}",
                             "X-Content-Type-Options": "nosniff"})


# ---- Côté agence : la fiche client de son portefeuille ----------------------------------

@router.get("/backoffice/clients/{client_id}/documents")
def agency_documents(client_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    c, e = _agency_client(db, client_id, principal)
    if e:
        return e
    docs = documents_of(db, c.id)
    return {"documents": [doc_dict(d) for d in docs], "qualification": assess_client(c, docs)}


@router.post("/backoffice/clients/{client_id}/documents", status_code=201)
async def agency_upload_document(client_id: int, request: Request,
                                 principal: Principal = Depends(get_principal),
                                 db: Session = Depends(get_db)):
    c, e = _agency_client(db, client_id, principal)
    if e:
        return e
    d, e = await _stored_document(request, c.id, _uid(principal))
    if e:
        return e
    db.add(d)
    db.commit()
    return doc_dict(d)


@router.patch("/backoffice/clients/{client_id}/documents/{doc_id}")
async def agency_validate_document(client_id: int, doc_id: int, request: Request,
                                   principal: Principal = Depends(get_principal),
                                   db: Session = Depends(get_db)):
    c, e = _agency_client(db, client_id, principal)
    if e:
        return e
    d = db.get(BuyerDocument, doc_id)
    if d is None or d.client_id != c.id:
        return err("Pièce introuvable.", 404)
    data = await json_body(request)
    if data.get("status") not in DOC_STATUSES:
        return err("Statut invalide.", 400)
    d.status = data["status"]
    db.commit()
    return doc_dict(d)


@router.get("/backoffice/clients/{client_id}/documents/{doc_id}")
def agency_download_document(client_id: int, doc_id: int,
                             principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    c, e = _agency_client(db, client_id, principal)
    if e:
        return e
    return _download(db, doc_id, c)


# ---- Côté acquéreur : son propre dossier ------------------------------------------------

@router.get("/buyer-dossier")
def my_dossiers(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Un dossier par agence qui suit l'acquéreur : chacune réclame ses propres pièces."""
    email = users_client.email_of(_uid(principal))
    if not email:
        return {"dossiers": []}
    rows = db.query(Client).filter(Client.email.ilike(email)).all()
    out = []
    for c in rows:
        docs = documents_of(db, c.id)
        out.append({
            "client_id": c.id, "agency_id": c.agency_id, "client_type": c.client_type,
            "budget_min": float(c.budget_min) if c.budget_min is not None else None,
            "budget_max": float(c.budget_max) if c.budget_max is not None else None,
            "qualification": assess_client(c, docs),
            "documents": [doc_dict(d) for d in docs],
        })
    return {"dossiers": out}


@router.post("/buyer-dossier/{client_id}/documents", status_code=201)
async def my_upload_document(client_id: int, request: Request,
                             principal: Principal = Depends(get_principal),
                             db: Session = Depends(get_db)):
    c, e = _own_client(db, client_id, principal)
    if e:
        return e
    d, e = await _stored_document(request, c.id, _uid(principal))
    if e:
        return e
    db.add(d)
    db.commit()
    return doc_dict(d)


@router.get("/buyer-dossier/{client_id}/documents/{doc_id}")
def my_download_document(client_id: int, doc_id: int,
                         principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    c, e = _own_client(db, client_id, principal)
    if e:
        return e
    return _download(db, doc_id, c)


@router.delete("/buyer-dossier/{client_id}/documents/{doc_id}")
def my_delete_document(client_id: int, doc_id: int,
                       principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    """Retirer une pièce déposée par erreur — tant que l'agence ne l'a pas validée."""
    c, e = _own_client(db, client_id, principal)
    if e:
        return e
    d = db.get(BuyerDocument, doc_id)
    if d is None or d.client_id != c.id:
        return err("Pièce introuvable.", 404)
    if d.status == "validated":
        return err("Pièce déjà validée par l'agence.", 400)
    db.delete(d)
    db.commit()
    return {"message": "Pièce supprimée"}
