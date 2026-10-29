"""Contrat de séjour : généré depuis un séjour, signé par le voyageur.

Le moteur de contrats est celui-ci — modèles, fusion, PDF, statuts. `staymanager` ne
réécrit rien : il appelle ces routes internes avec le séjour, récupère un identifiant de
contrat, et le voyageur signe depuis son lien d'enregistrement.

La signature est une **acceptation en ligne** horodatée, pas un parafeur : le nom saisi par
le voyageur, la date et son adresse IP sont consignés dans le contexte de fusion. Un
circuit de signature avancée reste du ressort de `semsar_signing`, qui s'appliquera ici
sans rien changer à ce qui suit.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from semsar_common import get_settings

from .db import get_db
from .merge import build_context, render
from .models import AgencyRO, Contract, ContractTemplate, PropertyRO
from .pdf import render_pdf_bytes
from .sanitize import sanitize_html
from .storage import pdf_storage
from .util import err, iso, json_body

router = APIRouter()

DOCUMENT_TYPE = "stay"
SIGNER_NAME_MAX = 200


def _guard(token: str):
    return None if token == get_settings().internal_token else err("Interdit", 403)


def _dict(c: Contract) -> dict:
    return {"id": c.id, "title": c.title, "status": c.status, "pdf_url": c.pdf_url,
            "finalized_at": iso(c.finalized_at), "signed_at": iso(c.signed_at)}


def _finalize(db: Session, contract: Contract) -> None:
    """Un contrat de séjour part tout de suite en PDF : il n'y a pas d'étape de relecture
    entre la génération et l'envoi au voyageur."""
    pdf = render_pdf_bytes(contract.body_html)
    key = f"contracts/{contract.agency_id}/stay_{contract.id}.pdf"
    pdf_storage().put(key, pdf, content_type="application/pdf")
    contract.pdf_url = key
    contract.status = "finalized"
    contract.finalized_at = datetime.utcnow()


@router.post("/internal/contracts/sejour", include_in_schema=False, status_code=201)
async def create_stay_contract(request: Request, x_internal_token: str = Header(default=""),
                               db: Session = Depends(get_db)):
    if (g := _guard(x_internal_token)) is not None:
        return g
    data = await json_body(request)
    try:
        agency_id = int(data.get("agency_id") or 0)
    except (TypeError, ValueError):
        return err("Agence invalide", 400)
    if agency_id <= 0:
        return err("Agence requise", 400)
    stay = data.get("stay") or {}
    if not isinstance(stay, dict):
        return err("Séjour invalide", 400)

    q = db.query(ContractTemplate).filter(
        or_(ContractTemplate.agency_id.is_(None), ContractTemplate.agency_id == agency_id))
    tpl = (q.filter(ContractTemplate.id == data["template_id"]).first()
           if data.get("template_id")
           else q.filter(ContractTemplate.document_type == DOCUMENT_TYPE)
           .order_by(ContractTemplate.agency_id.isnot(None).desc(), ContractTemplate.id).first())
    if tpl is None:
        return err("Aucun modèle de contrat de séjour. Créez-en un dans Contrats > Modèles.", 400)

    property_id = stay.get("property_id")
    prop = (db.query(PropertyRO)
            .filter(PropertyRO.id == property_id, PropertyRO.agency_id == agency_id).first()
            if property_id else None)
    agency = db.get(AgencyRO, agency_id)
    context = build_context(agency, property=prop, stay=stay)
    contract = Contract(
        agency_id=agency_id, title=data.get("title") or tpl.name, document_type=DOCUMENT_TYPE,
        template_id=tpl.id, property_id=(prop.id if prop else None),
        body_html=sanitize_html(render(tpl.body_html, context)), merge_context=context,
        status="draft")
    db.add(contract)
    db.flush()
    _finalize(db, contract)
    db.commit()
    return {"contract": _dict(contract)}


@router.get("/internal/contracts/{cid}", include_in_schema=False)
def read_stay_contract(cid: int, agency_id: int = 0, x_internal_token: str = Header(default=""),
                       db: Session = Depends(get_db)):
    if (g := _guard(x_internal_token)) is not None:
        return g
    c = db.get(Contract, cid)
    if c is None or c.agency_id != agency_id:
        return err("Contrat introuvable", 404)
    return {"contract": _dict(c)}


@router.post("/internal/contracts/{cid}/signe", include_in_schema=False)
async def sign_stay_contract(cid: int, request: Request, x_internal_token: str = Header(default=""),
                             db: Session = Depends(get_db)):
    """Acceptation du voyageur : nom saisi, horodatage et IP consignés avec le contrat."""
    if (g := _guard(x_internal_token)) is not None:
        return g
    data = await json_body(request)
    try:
        agency_id = int(data.get("agency_id") or 0)
    except (TypeError, ValueError):
        return err("Agence invalide", 400)
    c = db.get(Contract, cid)
    if c is None or c.agency_id != agency_id:
        return err("Contrat introuvable", 404)
    if c.status == "signed":
        return {"contract": _dict(c)}
    if c.status != "finalized":
        return err("Le contrat doit être finalisé avant signature.", 409)
    name = (data.get("signer_name") or "").strip()[:SIGNER_NAME_MAX]
    if not name:
        return err("Nom du signataire requis", 400)

    c.status = "signed"
    c.signed_at = datetime.utcnow()
    # `merge_context` est un JSON : le réassigner entier, sinon SQLAlchemy ne voit pas la
    # modification d'une clé et la trace de signature serait perdue au commit.
    c.merge_context = {**(c.merge_context or {}),
                       "signed_by": name,
                       "signed_at": c.signed_at.isoformat(),
                       "signed_ip": (data.get("signer_ip") or "")[:45]}
    db.commit()
    return {"contract": _dict(c)}
