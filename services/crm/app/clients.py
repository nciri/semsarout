"""Router crm — sous-domaine clients (+ interactions, convert-lead intra-service)."""
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from . import users_client
from .db import get_db
from .models import Client, ClientInteraction, Lead
from .util import err, iso, json_body

router = APIRouter()

_FIELDS = [
    "first_name", "last_name", "email", "phone", "phone_secondary", "whatsapp", "address",
    "city", "postal_code", "client_type", "status", "source", "source_detail",
    "search_criteria", "budget_min", "budget_max", "notes", "rating", "tags",
    "assigned_to_id", "gdpr_consent", "marketing_consent",
]


def _client_dict(c: Client, include_interactions: bool = False, db: Session = None) -> dict:
    data = {
        "id": c.id, "first_name": c.first_name, "last_name": c.last_name,
        "full_name": f"{c.first_name or ''} {c.last_name or ''}".strip(),
        "email": c.email, "phone": c.phone, "whatsapp": c.whatsapp, "address": c.address,
        "city": c.city, "client_type": c.client_type, "status": c.status, "source": c.source,
        "search_criteria": c.search_criteria,
        "budget_min": float(c.budget_min) if c.budget_min is not None else None,
        "budget_max": float(c.budget_max) if c.budget_max is not None else None,
        "notes": c.notes, "next_follow_up": iso(c.next_follow_up), "rating": c.rating,
        "tags": c.tags or [], "assigned_to_id": c.assigned_to_id,
        "assigned_to_name": users_client.name_of(c.agency_id, c.assigned_to_id),
        "agency_id": c.agency_id,
        # visits_count / transactions_count : 0 tant que les stages C/D (visites/transactions)
        # ne sont pas dans crm. Câblés à ce moment-là.
        "visits_count": 0, "transactions_count": 0,
        "created_at": iso(c.created_at), "last_contact_at": iso(c.last_contact_at),
    }
    if include_interactions and db is not None:
        rows = (db.query(ClientInteraction).filter(ClientInteraction.client_id == c.id)
                .order_by(ClientInteraction.created_at.desc()).limit(20).all())
        data["interactions"] = [_interaction_dict(i, c.agency_id) for i in rows]
    return data


def _interaction_dict(i: ClientInteraction, agency_id: int | None) -> dict:
    return {
        "id": i.id, "client_id": i.client_id, "interaction_type": i.interaction_type,
        "direction": i.direction, "subject": i.subject, "content": i.content,
        "duration": i.duration, "property_id": i.property_id, "created_by_id": i.created_by_id,
        "created_by_name": users_client.name_of(agency_id, i.created_by_id),
        "created_at": iso(i.created_at),
    }


def _owned(db: Session, client_id: int, principal: Principal):
    c = db.get(Client, client_id)
    if c is None:
        return None, err("Client not found", 404)
    if principal.agency_id and c.agency_id != principal.agency_id:
        return None, err("Access denied", 403)
    return c, None


@router.get("/backoffice/clients")
def get_clients(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    query = db.query(Client)
    if principal.agency_id:
        query = query.filter(Client.agency_id == principal.agency_id)
    if qp.get("type"):
        query = query.filter(Client.client_type == qp.get("type"))
    if qp.get("status"):
        query = query.filter(Client.status == qp.get("status"))
    if qp.get("assigned_to"):
        query = query.filter(Client.assigned_to_id == int(qp.get("assigned_to")))
    if qp.get("source"):
        query = query.filter(Client.source == qp.get("source"))
    if qp.get("rating"):
        query = query.filter(Client.rating == int(qp.get("rating")))
    if qp.get("q"):
        term = f"%{qp.get('q')}%"
        query = query.filter(or_(Client.first_name.ilike(term), Client.last_name.ilike(term),
                                 Client.email.ilike(term), Client.phone.ilike(term)))
    sort_by = qp.get("sort_by") or "created_at"
    col = getattr(Client, sort_by, Client.created_at)
    query = query.order_by(col.desc() if (qp.get("sort_order") or "desc") == "desc" else col.asc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"clients": [_client_dict(c) for c in items], "total": total, "pages": pages, "current_page": page}


@router.get("/backoffice/clients/stats")
def client_stats(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    base = db.query(Client)
    if principal.agency_id:
        base = base.filter(Client.agency_id == principal.agency_id)
    by_type = base.filter(Client.status == "active").with_entities(Client.client_type, func.count(Client.id)).group_by(Client.client_type).all()
    by_source = base.with_entities(Client.source, func.count(Client.id)).group_by(Client.source).all()
    by_rating = base.filter(Client.status == "active").with_entities(Client.rating, func.count(Client.id)).group_by(Client.rating).all()
    return {
        "by_type": [{"type": r[0], "count": r[1]} for r in by_type],
        "by_source": [{"source": r[0], "count": r[1]} for r in by_source],
        "by_rating": [{"rating": r[0], "count": r[1]} for r in by_rating],
    }


@router.post("/backoffice/clients/convert-lead/{lead_id}", status_code=201)
async def convert_lead(lead_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if lead is None:
        return err("Lead not found", 404)
    if principal.agency_id and lead.agency_id != principal.agency_id:
        return err("Access denied", 403)
    data = await json_body(request)
    parts = (lead.name or "").split(" ", 1)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    c = Client(
        first_name=data.get("first_name", parts[0] if parts else ""),
        last_name=data.get("last_name", parts[1] if len(parts) > 1 else ""),
        email=lead.email, phone=lead.phone, client_type=data.get("client_type", "buyer"),
        source=lead.source, notes=lead.message,
        assigned_to_id=data.get("assigned_to_id") or uid, agency_id=principal.agency_id, lead_id=lead.id,
    )
    db.add(c)
    lead.status = "converted"
    lead.converted_at = datetime.utcnow()
    db.commit()
    return _client_dict(c)


@router.get("/backoffice/clients/{client_id}")
def get_client(client_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    c, e = _owned(db, client_id, principal)
    if e:
        return e
    return _client_dict(c, include_interactions=True, db=db)


@router.post("/backoffice/clients", status_code=201)
async def create_client(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await json_body(request)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    c = Client(
        agency_id=principal.agency_id,
        assigned_to_id=data.get("assigned_to_id") or uid,
        gdpr_consent_date=datetime.utcnow() if data.get("gdpr_consent") else None,
        **{k: data[k] for k in _FIELDS if k in data and k != "assigned_to_id"},
    )
    if not c.first_name:
        c.first_name = data.get("first_name", "")
    if not c.last_name:
        c.last_name = data.get("last_name", "")
    db.add(c)
    db.commit()
    return _client_dict(c)


@router.put("/backoffice/clients/{client_id}")
async def update_client(client_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    c, e = _owned(db, client_id, principal)
    if e:
        return e
    data = await json_body(request)
    for field in _FIELDS:
        if field in data:
            setattr(c, field, data[field])
    c.updated_at = datetime.utcnow()
    db.commit()
    return _client_dict(c)


@router.delete("/backoffice/clients/{client_id}")
def delete_client(client_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    c, e = _owned(db, client_id, principal)
    if e:
        return e
    db.delete(c)
    db.commit()
    return {"message": "Client deleted"}


@router.get("/backoffice/clients/{client_id}/interactions")
def list_interactions(client_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    c, e = _owned(db, client_id, principal)
    if e:
        return e
    rows = (db.query(ClientInteraction).filter(ClientInteraction.client_id == c.id)
            .order_by(ClientInteraction.created_at.desc()).all())
    return {"interactions": [_interaction_dict(i, c.agency_id) for i in rows]}


@router.post("/backoffice/clients/{client_id}/interactions", status_code=201)
async def create_interaction(client_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    c, e = _owned(db, client_id, principal)
    if e:
        return e
    data = await json_body(request)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    i = ClientInteraction(
        client_id=c.id, interaction_type=data.get("interaction_type"), direction=data.get("direction"),
        subject=data.get("subject"), content=data.get("content"), duration=data.get("duration"),
        property_id=data.get("property_id"), created_by_id=uid,
    )
    db.add(i)
    c.last_contact_at = datetime.utcnow()
    db.commit()
    return _interaction_dict(i, c.agency_id)
