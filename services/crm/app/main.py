"""Service crm — sous-domaine leads (schéma `crm`).

Reproduit à l'identique `/backoffice/leads*`. `property_title` via projection locale,
`assigned_to_name`/agents via l'endpoint interne du monolithe. Erreurs legacy `{'error'}`.
Écart assumé : l'`ActivityLog` (audit) n'est pas répliqué (viendra avec trust-safety).
Les sous-domaines clients/visites/transactions suivront (mêmes patrons).
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, setup_logging, setup_tracing

from . import users_client
from .db import get_db, init_db
from .models import Lead, PropertyRO

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_UPDATABLE = ["name", "email", "phone", "status", "source", "message", "property_id", "assigned_to_id", "notes"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


async def _json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def _iso(v):
    return v.isoformat() if v else None


def _lead_dict(db: Session, l: Lead) -> dict:
    ro = db.get(PropertyRO, l.property_id) if l.property_id else None
    return {
        "id": l.id, "name": l.name, "email": l.email, "phone": l.phone, "message": l.message,
        "notes": l.notes, "source": l.source, "service": l.service, "status": l.status,
        "lost_reason": l.lost_reason, "property_id": l.property_id,
        "property_title": ro.title if ro else None,
        "agency_id": l.agency_id, "assigned_to_id": l.assigned_to_id,
        "assigned_to_name": users_client.name_of(l.agency_id, l.assigned_to_id),
        "is_charged": l.is_charged, "is_read": l.is_read, "read_at": _iso(l.read_at),
        "created_at": _iso(l.created_at), "updated_at": _iso(l.updated_at),
        "contacted_at": _iso(l.contacted_at), "qualified_at": _iso(l.qualified_at),
        "converted_at": _iso(l.converted_at),
    }


def _owned(db: Session, lead_id: int, principal: Principal):
    l = db.get(Lead, lead_id)
    if l is None:
        return None, _err("Lead not found", 404)
    if principal.agency_id and l.agency_id != principal.agency_id:
        return None, _err("Access denied", 403)
    return l, None


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/backoffice/leads")
def get_leads(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    query = db.query(Lead)
    if principal.agency_id:
        query = query.filter(Lead.agency_id == principal.agency_id)
    if qp.get("status"):
        query = query.filter(Lead.status == qp.get("status"))
    if qp.get("source"):
        query = query.filter(Lead.source == qp.get("source"))
    if qp.get("assigned_to"):
        query = query.filter(Lead.assigned_to_id == int(qp.get("assigned_to")))
    if qp.get("property_id"):
        query = query.filter(Lead.property_id == int(qp.get("property_id")))
    if qp.get("q"):
        term = f"%{qp.get('q')}%"
        query = query.filter(or_(Lead.name.ilike(term), Lead.email.ilike(term), Lead.phone.ilike(term)))
    sort_by = qp.get("sort_by") or "created_at"
    col = getattr(Lead, sort_by, Lead.created_at)
    query = query.order_by(col.desc() if (qp.get("sort_order") or "desc") == "desc" else col.asc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"leads": [_lead_dict(db, l) for l in items], "total": total, "pages": pages, "current_page": page}


@app.get("/backoffice/leads/stats")
def lead_stats(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    base = db.query(Lead)
    if principal.agency_id:
        base = base.filter(Lead.agency_id == principal.agency_id)
    by_status = base.with_entities(Lead.status, func.count(Lead.id)).group_by(Lead.status).all()
    by_source = base.with_entities(Lead.source, func.count(Lead.id)).group_by(Lead.source).all()
    total = base.count()
    contacted = base.filter(Lead.contacted_at.isnot(None)).count()
    qualified = base.filter(Lead.qualified_at.isnot(None)).count()
    converted = base.filter(Lead.status == "converted").count()
    return {
        "by_status": [{"status": r[0], "count": r[1]} for r in by_status],
        "by_source": [{"source": r[0], "count": r[1]} for r in by_source],
        "funnel": {
            "total": total, "contacted": contacted, "qualified": qualified, "converted": converted,
            "conversion_rate": round(converted / total * 100, 1) if total > 0 else 0,
        },
    }


@app.get("/backoffice/leads/agents")
def agents(principal: Principal = Depends(get_principal)) -> dict:
    return {"agents": users_client.agents(principal.agency_id)}


@app.get("/backoffice/leads/{lead_id}")
def get_lead(lead_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    l, err = _owned(db, lead_id, principal)
    if err:
        return err
    if not l.is_read:
        l.is_read = True
        l.read_at = datetime.utcnow()
        db.commit()
    return _lead_dict(db, l)


@app.post("/backoffice/leads", status_code=201)
async def create_lead(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await _json(request)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    l = Lead(
        name=data.get("name"), email=data.get("email"), phone=data.get("phone"),
        source=data.get("source", "manual"), status="new", message=data.get("message"),
        property_id=data.get("property_id"), assigned_to_id=data.get("assigned_to_id") or uid,
        agency_id=principal.agency_id,
    )
    db.add(l)
    db.commit()
    return _lead_dict(db, l)


@app.put("/backoffice/leads/{lead_id}")
async def update_lead(lead_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    l, err = _owned(db, lead_id, principal)
    if err:
        return err
    data = await _json(request)
    for field in _UPDATABLE:
        if field in data:
            setattr(l, field, data[field])
    if "status" in data:
        s = data["status"]
        if s == "contacted" and not l.contacted_at:
            l.contacted_at = datetime.utcnow()
        elif s == "qualified" and not l.qualified_at:
            l.qualified_at = datetime.utcnow()
        elif s == "converted" and not l.converted_at:
            l.converted_at = datetime.utcnow()
        elif s == "lost" and not l.lost_at:
            l.lost_at = datetime.utcnow()
            l.lost_reason = data.get("lost_reason")
    l.updated_at = datetime.utcnow()
    db.commit()
    return _lead_dict(db, l)


@app.delete("/backoffice/leads/{lead_id}")
def delete_lead(lead_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    l, err = _owned(db, lead_id, principal)
    if err:
        return err
    db.delete(l)
    db.commit()
    return {"message": "Lead deleted"}


@app.post("/backoffice/leads/{lead_id}/assign")
async def assign_lead(lead_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    l, err = _owned(db, lead_id, principal)
    if err:
        return err
    data = await _json(request)
    l.assigned_to_id = data.get("user_id")
    db.commit()
    return _lead_dict(db, l)


@app.post("/backoffice/leads/{lead_id}/contact")
async def contact_lead(lead_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    l, err = _owned(db, lead_id, principal)
    if err:
        return err
    data = await _json(request)
    l.status = "contacted"
    l.contacted_at = datetime.utcnow()
    if data.get("notes"):
        l.notes = data["notes"]
    db.commit()
    return _lead_dict(db, l)


@app.post("/backoffice/leads/{lead_id}/qualify")
async def qualify_lead(lead_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    l, err = _owned(db, lead_id, principal)
    if err:
        return err
    data = await _json(request)
    l.status = "qualified"
    l.qualified_at = datetime.utcnow()
    if data.get("notes"):
        l.notes = data["notes"]
    db.commit()
    return _lead_dict(db, l)
