"""Service transactions — pipeline ventes/locations (schéma `transactions`).

Reproduit à l'identique `/backoffice/transactions*` (liste, pipeline Kanban, stats, stages,
CRUD, déplacement de stage, offres, documents) — cf. `backend/app/api/v1/backoffice/transactions.py`.
Erreurs legacy `{'error'}`. Champs dénormalisés via projections locales (PropertyRO/ClientRO) et
l'endpoint interne du monolithe (noms d'agents). Émet `transaction.*` (outbox) → crm maintient
`transaction_ro`.

Écarts assumés (hors contrat de lecture, non consommés par le front) :
- l'`ActivityLog` (audit create/stage_change) n'est pas répliqué (comme crm — viendra via audit) ;
- la bascule `property.status = sold/rented` sur `won` est un effet cross-domaine (listing) différé ;
- le détail (`include_property`/`include_client`) renvoie les projections réduites (id/titre/ville,
  id/nom) et non le dict complet du bien/client (domaines listing/crm) — aucun consommateur front.
"""
from contextlib import asynccontextmanager
from datetime import datetime
import uuid

from fastapi import Depends, FastAPI, Request
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, users_client
from .db import get_db, init_db
from .models import (
    ClientRO, Offer, PropertyRO, RENT_STAGES, SALE_STAGES, Transaction, TransactionDocument,
)
from .util import err, iso, json_body, num

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


def _reference() -> str:
    return f"TX-{datetime.utcnow().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"


def _full_name(c: ClientRO | None) -> str | None:
    return f"{c.first_name} {c.last_name}" if c else None


def _emit(db: Session, t: Transaction, event_type: str) -> None:
    enqueue(db, "transaction", t.id, event_type, {
        "id": t.id, "client_id": t.client_id, "property_id": t.property_id,
        "agency_id": t.agency_id, "status": t.status, "transaction_type": t.transaction_type,
    })


def _offer_dict(o: Offer, agency_id: int | None) -> dict:
    return {
        "id": o.id, "transaction_id": o.transaction_id, "amount": num(o.amount),
        "conditions": o.conditions, "offer_type": o.offer_type, "from_party": o.from_party,
        "status": o.status, "expires_at": iso(o.expires_at), "response_notes": o.response_notes,
        "responded_at": iso(o.responded_at), "created_at": iso(o.created_at),
        "created_by_name": users_client.name_of(agency_id, o.created_by_id),
    }


def _doc_dict(d: TransactionDocument, agency_id: int | None) -> dict:
    return {
        "id": d.id, "transaction_id": d.transaction_id, "document_type": d.document_type,
        "name": d.name, "file_url": d.file_url, "file_size": d.file_size, "mime_type": d.mime_type,
        "requires_signature": d.requires_signature, "signature_status": d.signature_status,
        "signed_at": iso(d.signed_at),
        "uploaded_by_name": users_client.name_of(agency_id, d.uploaded_by_id),
        "created_at": iso(d.created_at),
    }


def _tx_dict(db: Session, t: Transaction, include_property: bool = False,
             include_client: bool = False, include_offers: bool = False) -> dict:
    prop = db.get(PropertyRO, t.property_id) if t.property_id else None
    client = db.get(ClientRO, t.client_id) if t.client_id else None
    seller = db.get(ClientRO, t.seller_id) if t.seller_id else None
    data = {
        "id": t.id, "reference": t.reference, "property_id": t.property_id,
        "property_title": prop.title if prop else None,
        "property_city": prop.city if prop else None,
        "client_id": t.client_id, "client_name": _full_name(client),
        "seller_id": t.seller_id, "seller_name": _full_name(seller),
        "agent_id": t.agent_id,
        "agent_name": users_client.name_of(t.agency_id, t.agent_id),
        "transaction_type": t.transaction_type, "stage": t.stage, "stage_order": t.stage_order,
        "asking_price": num(t.asking_price), "offer_price": num(t.offer_price),
        "final_price": num(t.final_price), "commission_rate": num(t.commission_rate),
        "commission_amount": num(t.commission_amount), "status": t.status,
        "lost_reason": t.lost_reason, "contact_date": iso(t.contact_date),
        "expected_closing_date": iso(t.expected_closing_date), "closing_date": iso(t.closing_date),
        "probability": t.probability, "priority": t.priority, "notes": t.notes,
        "created_at": iso(t.created_at),
    }
    if include_property and prop:
        data["property"] = {"id": prop.id, "title": prop.title, "city": prop.city}
    if include_client and client:
        data["client"] = {"id": client.id, "first_name": client.first_name,
                          "last_name": client.last_name, "full_name": _full_name(client)}
    if include_offers:
        offers = (db.query(Offer).filter(Offer.transaction_id == t.id)
                  .order_by(Offer.created_at.desc()).all())
        data["offers"] = [_offer_dict(o, t.agency_id) for o in offers]
    return data


def _owned(db: Session, tx_id: int, principal: Principal):
    t = db.get(Transaction, tx_id)
    if t is None:
        return None, err("Transaction not found", 404)
    if principal.agency_id and t.agency_id != principal.agency_id:
        return None, err("Access denied", 403)
    return t, None


def _parse_dt(v):
    return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Collections & agrégats (routes littérales AVANT /{tx_id}) ----
@app.get("/backoffice/transactions")
def get_transactions(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    query = db.query(Transaction)
    if principal.agency_id:
        query = query.filter(Transaction.agency_id == principal.agency_id)
    if qp.get("type"):
        query = query.filter(Transaction.transaction_type == qp.get("type"))
    if qp.get("status"):
        query = query.filter(Transaction.status == qp.get("status"))
    if qp.get("stage"):
        query = query.filter(Transaction.stage == qp.get("stage"))
    if qp.get("agent_id"):
        query = query.filter(Transaction.agent_id == int(qp.get("agent_id")))
    if qp.get("client_id"):
        query = query.filter(Transaction.client_id == int(qp.get("client_id")))
    if qp.get("property_id"):
        query = query.filter(Transaction.property_id == int(qp.get("property_id")))
    if qp.get("priority"):
        query = query.filter(Transaction.priority == qp.get("priority"))
    if qp.get("q"):
        term = f"%{qp.get('q')}%"
        query = query.filter(or_(Transaction.reference.ilike(term), Transaction.notes.ilike(term)))
    sort_by = qp.get("sort_by") or "created_at"
    if hasattr(Transaction, sort_by):
        col = getattr(Transaction, sort_by)
        query = query.order_by(col.desc() if (qp.get("sort_order") or "desc") == "desc" else col.asc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"transactions": [_tx_dict(db, t) for t in items], "total": total,
            "pages": pages, "current_page": page}


@app.get("/backoffice/transactions/pipeline")
def get_pipeline(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    transaction_type = qp.get("type") or "sale"
    query = db.query(Transaction).filter(
        Transaction.status == "active", Transaction.transaction_type == transaction_type)
    if principal.agency_id:
        query = query.filter(Transaction.agency_id == principal.agency_id)
    if qp.get("agent_id"):
        query = query.filter(Transaction.agent_id == int(qp.get("agent_id")))
    items = query.order_by(Transaction.stage_order).all()

    stages = SALE_STAGES if transaction_type == "sale" else RENT_STAGES
    pipeline = {s["id"]: {"id": s["id"], "name": s["name"], "color": s["color"],
                          "order": s["order"], "transactions": []} for s in stages}
    for t in items:
        if t.stage in pipeline:
            pipeline[t.stage]["transactions"].append(_tx_dict(db, t))
    return {"pipeline": list(pipeline.values()), "stages": stages}


@app.get("/backoffice/transactions/stats")
def get_stats(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    base = db.query(Transaction)
    if principal.agency_id:
        base = base.filter(Transaction.agency_id == principal.agency_id)
    by_status = base.with_entities(
        Transaction.status, func.count(Transaction.id), func.sum(Transaction.asking_price)
    ).group_by(Transaction.status).all()
    by_stage = base.filter(Transaction.status == "active").with_entities(
        Transaction.stage, func.count(Transaction.id), func.sum(Transaction.asking_price)
    ).group_by(Transaction.stage).all()
    by_agent = base.filter(Transaction.status == "won").with_entities(
        Transaction.agent_id, func.count(Transaction.id), func.sum(Transaction.commission_amount)
    ).group_by(Transaction.agent_id).all()
    return {
        "by_status": [{"status": r[0], "count": r[1], "value": float(r[2] or 0)} for r in by_status],
        "by_stage": [{"stage": r[0], "count": r[1], "value": float(r[2] or 0)} for r in by_stage],
        "by_agent": [{"name": users_client.name_of(principal.agency_id, r[0]),
                      "count": r[1], "commission": float(r[2] or 0)} for r in by_agent],
    }


@app.get("/backoffice/transactions/stages")
def get_stages(request: Request, principal: Principal = Depends(get_principal)) -> dict:
    transaction_type = request.query_params.get("type") or "sale"
    return {"stages": SALE_STAGES if transaction_type == "sale" else RENT_STAGES}


@app.get("/backoffice/transactions/{tx_id}")
def get_transaction(tx_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    return _tx_dict(db, t, include_property=True, include_client=True, include_offers=True)


@app.post("/backoffice/transactions", status_code=201)
async def create_transaction(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await json_body(request)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    t = Transaction(
        reference=_reference(), property_id=data.get("property_id"), client_id=data.get("client_id"),
        seller_id=data.get("seller_id"), agent_id=data.get("agent_id") or uid,
        transaction_type=data.get("transaction_type", "sale"), stage=data.get("stage", "contact"),
        stage_order=data.get("stage_order", 0), asking_price=data.get("asking_price"),
        commission_rate=data.get("commission_rate"), priority=data.get("priority", "medium"),
        probability=data.get("probability", 50),
        expected_closing_date=_parse_dt(data.get("expected_closing_date")),
        notes=data.get("notes"), agency_id=principal.agency_id,
    )
    db.add(t)
    db.flush()
    _emit(db, t, events.TRANSACTION_CREATED)
    db.commit()
    return _tx_dict(db, t)


@app.put("/backoffice/transactions/{tx_id}")
async def update_transaction(tx_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    data = await json_body(request)
    old_stage = t.stage
    for field in ["property_id", "client_id", "seller_id", "agent_id", "transaction_type",
                  "stage", "stage_order", "asking_price", "offer_price", "final_price",
                  "commission_rate", "commission_amount", "commission_split", "status",
                  "lost_reason", "probability", "priority", "notes"]:
        if field in data:
            setattr(t, field, data[field])
    for date_field in ["expected_closing_date", "visit_date", "offer_date",
                       "acceptance_date", "compromise_date", "closing_date"]:
        if date_field in data:
            setattr(t, date_field, _parse_dt(data[date_field]))
    if "stage" in data and data["stage"] != old_stage:
        stages = SALE_STAGES if t.transaction_type == "sale" else RENT_STAGES
        info = next((s for s in stages if s["id"] == data["stage"]), None)
        if info:
            t.stage_order = info["order"]
    if "status" in data:
        if data["status"] == "won" and t.status != "won":
            t.closed_at = datetime.utcnow()
        elif data["status"] == "lost" and t.status != "lost":
            t.closed_at = datetime.utcnow()
    t.updated_at = datetime.utcnow()
    _emit(db, t, events.TRANSACTION_UPDATED)
    db.commit()
    return _tx_dict(db, t)


@app.post("/backoffice/transactions/{tx_id}/move")
async def move_transaction(tx_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    data = await json_body(request)
    t.stage = data.get("stage")
    t.stage_order = data.get("order", 0)
    t.updated_at = datetime.utcnow()
    _emit(db, t, events.TRANSACTION_UPDATED)
    db.commit()
    return _tx_dict(db, t)


@app.delete("/backoffice/transactions/{tx_id}")
def delete_transaction(tx_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    t.status = "lost"
    t.lost_reason = "Archived"
    t.closed_at = datetime.utcnow()
    _emit(db, t, events.TRANSACTION_UPDATED)
    db.commit()
    return {"message": "Transaction archived"}


# ---- Offres ----
@app.get("/backoffice/transactions/{tx_id}/offers")
def get_offers(tx_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    offers = (db.query(Offer).filter(Offer.transaction_id == tx_id)
              .order_by(Offer.created_at.desc()).all())
    return {"offers": [_offer_dict(o, t.agency_id) for o in offers]}


@app.post("/backoffice/transactions/{tx_id}/offers", status_code=201)
async def create_offer(tx_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    data = await json_body(request)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    o = Offer(
        transaction_id=tx_id, amount=data.get("amount"), conditions=data.get("conditions"),
        offer_type=data.get("offer_type", "initial"), from_party=data.get("from_party"),
        expires_at=_parse_dt(data.get("expires_at")), created_by_id=uid,
    )
    db.add(o)
    t.offer_price = o.amount
    if t.stage == "visit":
        t.stage = "offer"
        t.offer_date = datetime.utcnow()
    db.commit()
    return _offer_dict(o, t.agency_id)


@app.put("/backoffice/transactions/{tx_id}/offers/{offer_id}")
async def update_offer(tx_id: int, offer_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    o = db.get(Offer, offer_id)
    if o is None or o.transaction_id != tx_id:
        return err("Offer not found", 404)
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    data = await json_body(request)
    if "status" in data:
        o.status = data["status"]
        o.responded_at = datetime.utcnow()
        o.response_notes = data.get("response_notes")
        if data["status"] == "accepted":
            t.final_price = o.amount
            t.acceptance_date = datetime.utcnow()
            if t.stage in ("contact", "visit", "offer"):
                t.stage = "negotiation"
    db.commit()
    return _offer_dict(o, t.agency_id)


# ---- Documents ----
@app.get("/backoffice/transactions/{tx_id}/documents")
def get_documents(tx_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    docs = (db.query(TransactionDocument).filter(TransactionDocument.transaction_id == tx_id)
            .order_by(TransactionDocument.created_at.desc()).all())
    return {"documents": [_doc_dict(d, t.agency_id) for d in docs]}


@app.post("/backoffice/transactions/{tx_id}/documents", status_code=201)
async def add_document(tx_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    t, e = _owned(db, tx_id, principal)
    if e:
        return e
    data = await json_body(request)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    d = TransactionDocument(
        transaction_id=tx_id, document_type=data.get("document_type"), name=data.get("name"),
        file_url=data.get("file_url"), file_size=data.get("file_size"),
        mime_type=data.get("mime_type"), requires_signature=data.get("requires_signature", False),
        uploaded_by_id=uid,
    )
    db.add(d)
    db.commit()
    return _doc_dict(d, t.agency_id)
