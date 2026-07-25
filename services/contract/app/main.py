"""Service contract — modèles + contrats + fusion + finalisation PDF (cloisonné par agence).

Reproduit à l'identique les routes legacy `/backoffice/contracts*` (+ `/finalize`, `/mark-signed`,
`/pdf`) et `/backoffice/contract-templates*` — cf. `backend/app/api/v1/backoffice/contracts.py`.
Gate premium via `Principal.features` : `contracts` (accès) et `contract_templates` (gestion des
modèles, plan Entreprise → `can_manage_templates`). La fusion (`build_context`+`render`) lit les
projections locales ; le PDF finalisé est archivé en stockage objet (MinIO/S3). La copie du PDF dans
les documents de la transaction liée est déléguée via `contract.finalized`/`contract.signed`
(le service transactions crée/maj le `TransactionDocument`).
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, users_client
from .db import get_db, init_db
from .merge import build_context, render
from .models import (
    AgencyRO, ClientRO, Contract, ContractTemplate, PropertyRO, TransactionRO,
)
from .pdf import render_pdf_bytes
from .sanitize import sanitize_html
from .storage import pdf_storage
from .util import err, iso, json_body

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _gate(principal: Principal) -> JSONResponse | None:
    """Miroir de `require_contracts` : agence + plan `has_contracts` (feature `contracts`)."""
    if principal.agency_id is None or "contracts" not in principal.features:
        return err("Fonction réservée aux plans Pro et Entreprise.", 403)
    return None


def _can_manage_templates(principal: Principal) -> bool:
    """Parité `can_manage_templates` : plan Entreprise → entitlement `contract_templates`."""
    return "contract_templates" in principal.features


def _template_dict(t: ContractTemplate, include_body: bool = True) -> dict:
    d = {"id": t.id, "agency_id": t.agency_id, "document_type": t.document_type,
         "name": t.name, "is_builtin": t.is_builtin, "is_global": t.agency_id is None,
         "created_at": iso(t.created_at)}
    if include_body:
        d["body_html"] = t.body_html
    return d


def _contract_dict(c: Contract, include_body: bool = True) -> dict:
    d = {"id": c.id, "agency_id": c.agency_id, "title": c.title,
         "document_type": c.document_type, "template_id": c.template_id,
         "transaction_id": c.transaction_id, "property_id": c.property_id,
         "client_id": c.client_id, "status": c.status, "pdf_url": c.pdf_url,
         "finalized_at": iso(c.finalized_at), "signed_at": iso(c.signed_at),
         "created_at": iso(c.created_at)}
    if include_body:
        d["body_html"] = c.body_html
    return d


def _get_contract(db: Session, cid: int, agency_id: int) -> Contract | None:
    return db.query(Contract).filter(Contract.id == cid, Contract.agency_id == agency_id).first()


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Modèles ----
@app.get("/backoffice/contract-templates")
def list_templates(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    aid = principal.agency_id
    rows = (db.query(ContractTemplate)
            .filter(or_(ContractTemplate.agency_id.is_(None), ContractTemplate.agency_id == aid))
            .order_by(ContractTemplate.name).all())
    return {"templates": [_template_dict(t) for t in rows],
            "can_manage_templates": _can_manage_templates(principal)}


@app.post("/backoffice/contract-templates", status_code=201)
async def create_template(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    if not _can_manage_templates(principal):
        return err("Les modèles personnalisés sont réservés au plan Entreprise.", 403)
    data = await json_body(request)
    if not data.get("name") or not data.get("document_type") or not data.get("body_html"):
        return err("name, document_type et body_html requis", 400)
    t = ContractTemplate(agency_id=principal.agency_id, document_type=data["document_type"],
                         name=data["name"], body_html=sanitize_html(data["body_html"]),
                         is_builtin=False,
                         created_by=int(principal.sub) if principal.sub.isdigit() else None)
    db.add(t)
    db.commit()
    return JSONResponse({"template": _template_dict(t)}, status_code=201)


@app.put("/backoffice/contract-templates/{tid}")
async def update_template(tid: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    if not _can_manage_templates(principal):
        return err("Réservé au plan Entreprise.", 403)
    t = db.query(ContractTemplate).filter(
        ContractTemplate.id == tid, ContractTemplate.agency_id == principal.agency_id).first()
    if not t:
        return err("Modèle introuvable", 404)
    data = await json_body(request)
    if "name" in data:
        t.name = data["name"]
    if "body_html" in data:
        t.body_html = sanitize_html(data["body_html"])
    if "document_type" in data:
        t.document_type = data["document_type"]
    db.commit()
    return {"template": _template_dict(t)}


@app.delete("/backoffice/contract-templates/{tid}")
def delete_template(tid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    if not _can_manage_templates(principal):
        return err("Réservé au plan Entreprise.", 403)
    t = db.query(ContractTemplate).filter(
        ContractTemplate.id == tid, ContractTemplate.agency_id == principal.agency_id).first()
    if not t:
        return err("Modèle introuvable", 404)
    db.delete(t)
    db.commit()
    return {"message": "Modèle supprimé"}


# ---- Contrats ----
@app.get("/backoffice/contracts")
def list_contracts(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    q = db.query(Contract).filter(Contract.agency_id == principal.agency_id)
    qp = request.query_params
    if qp.get("status"):
        q = q.filter(Contract.status == qp.get("status"))
    if qp.get("transaction_id"):
        q = q.filter(Contract.transaction_id == int(qp.get("transaction_id")))
    rows = q.order_by(Contract.created_at.desc()).all()
    return {"contracts": [_contract_dict(c, include_body=False) for c in rows]}


@app.post("/backoffice/contracts", status_code=201)
async def create_contract(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    aid = principal.agency_id
    data = await json_body(request)
    tpl = db.query(ContractTemplate).filter(
        ContractTemplate.id == data.get("template_id"),
        or_(ContractTemplate.agency_id.is_(None), ContractTemplate.agency_id == aid)).first()
    if not tpl:
        return err("Modèle invalide", 400)

    txn = db.query(TransactionRO).filter(
        TransactionRO.id == data["transaction_id"], TransactionRO.agency_id == aid).first() if data.get("transaction_id") else None
    prop = db.query(PropertyRO).filter(
        PropertyRO.id == data["property_id"], PropertyRO.agency_id == aid).first() if data.get("property_id") else None
    cli = db.query(ClientRO).filter(
        ClientRO.id == data["client_id"], ClientRO.agency_id == aid).first() if data.get("client_id") else None
    # Dérivation depuis la transaction (parité build_context : prop/cli = ceux du txn à défaut).
    if txn is not None and prop is None and txn.property_id:
        prop = db.get(PropertyRO, txn.property_id)
    if txn is not None and cli is None and txn.client_id:
        cli = db.get(ClientRO, txn.client_id)
    agent_name = users_client.name_of(aid, txn.agent_id) if txn is not None else ""

    agency = db.get(AgencyRO, aid)
    context = build_context(agency, transaction=txn, property=prop, client=cli, agent_name=agent_name)
    body = sanitize_html(render(tpl.body_html, context))
    contract = Contract(
        agency_id=aid, title=data.get("title") or tpl.name, document_type=tpl.document_type,
        template_id=tpl.id, transaction_id=(txn.id if txn else None),
        property_id=(prop.id if prop else None), client_id=(cli.id if cli else None),
        body_html=body, merge_context=context, status="draft",
        created_by=int(principal.sub) if principal.sub.isdigit() else None)
    db.add(contract)
    db.commit()
    return JSONResponse({"contract": _contract_dict(contract)}, status_code=201)


@app.get("/backoffice/contracts/{cid}")
def get_contract(cid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    c = _get_contract(db, cid, principal.agency_id)
    if not c:
        return err("Contrat introuvable", 404)
    return {"contract": _contract_dict(c)}


@app.put("/backoffice/contracts/{cid}")
async def update_contract(cid: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    c = _get_contract(db, cid, principal.agency_id)
    if not c:
        return err("Contrat introuvable", 404)
    if c.status != "draft":
        return err("Un contrat finalisé ne peut plus être édité.", 409)
    data = await json_body(request)
    if "title" in data:
        c.title = data["title"]
    if "body_html" in data:
        c.body_html = sanitize_html(data["body_html"])
    db.commit()
    return {"contract": _contract_dict(c)}


@app.delete("/backoffice/contracts/{cid}")
def delete_contract(cid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    c = _get_contract(db, cid, principal.agency_id)
    if not c:
        return err("Contrat introuvable", 404)
    if c.status != "draft":
        return err("Seul un brouillon peut être supprimé.", 409)
    db.delete(c)
    db.commit()
    return {"message": "Contrat supprimé"}


@app.post("/backoffice/contracts/{cid}/finalize")
def finalize_contract(cid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    c = _get_contract(db, cid, principal.agency_id)
    if not c:
        return err("Contrat introuvable", 404)
    if c.status != "draft":
        return err("Seul un brouillon peut être finalisé.", 409)
    pdf = render_pdf_bytes(c.body_html)
    key = f"contracts/{c.agency_id}/contract_{c.id}.pdf"
    pdf_storage().put(key, pdf, content_type="application/pdf")
    c.pdf_url = key
    c.status = "finalized"
    c.finalized_at = datetime.utcnow()
    uid = int(principal.sub) if principal.sub.isdigit() else None
    if c.transaction_id:
        # Copie dans les documents de la transaction liée → délégué au service transactions.
        enqueue(db, "contract", c.id, events.CONTRACT_FINALIZED, {
            "contract_id": c.id, "agency_id": c.agency_id, "transaction_id": c.transaction_id,
            "document_type": c.document_type, "title": c.title, "pdf_url": key,
            "uploaded_by_id": uid,
        })
    db.commit()
    return {"contract": _contract_dict(c)}


@app.post("/backoffice/contracts/{cid}/mark-signed")
def mark_signed(cid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    c = _get_contract(db, cid, principal.agency_id)
    if not c:
        return err("Contrat introuvable", 404)
    if c.status != "finalized":
        return err("Le contrat doit être finalisé avant signature.", 409)
    c.status = "signed"
    c.signed_at = datetime.utcnow()
    if c.transaction_id and c.pdf_url:
        enqueue(db, "contract", c.id, events.CONTRACT_SIGNED, {
            "contract_id": c.id, "transaction_id": c.transaction_id, "pdf_url": c.pdf_url,
        })
    db.commit()
    return {"contract": _contract_dict(c)}


@app.get("/backoffice/contracts/{cid}/pdf")
def download_pdf(cid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    c = _get_contract(db, cid, principal.agency_id)
    if not c or not c.pdf_url:
        return err("PDF indisponible", 404)
    data = pdf_storage().get(c.pdf_url)
    return Response(content=data, media_type="application/pdf",
                    headers={"content-disposition": f'inline; filename="{c.title}.pdf"'})
