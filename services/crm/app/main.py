"""Service crm — sous-domaine leads (schéma `crm`).

Reproduit à l'identique `/backoffice/leads*`. `property_title` via projection locale,
`assigned_to_name`/agents via l'endpoint interne du monolithe. Erreurs legacy `{'error'}`.
Écart assumé : l'`ActivityLog` (audit) n'est pas répliqué (viendra avec trust-safety).
Les sous-domaines clients/visites/transactions suivront (mêmes patrons).
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from . import clients, users_client, visits
from .visits import _visit_dict
from .db import get_db, init_db
from .models import Client, Lead, PropertyRO, Visit

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_UPDATABLE = ["name", "email", "phone", "status", "source", "message", "property_id", "assigned_to_id", "notes"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)  # Problem (require_*/get_principal) -> {'error': ...} legacy

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
app.include_router(clients.router)  # sous-domaine clients (Stage B)
app.include_router(visits.router)   # sous-domaine visites + calendrier (Stage C)


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


# ---- Leads publics / « mes leads » (parité `backend/app/api/v1/leads.py`) ----
# crm possède les leads. La création via contact/reveal-phone sur une annonce est déjà pilotée
# par listing (`listing.contacted` → worker crm). Restent : la demande de service publique et la
# consultation/gestion des leads de l'utilisateur (agence, ou propriétaire particulier via owner_id).
_LEAD_STATUSES = {"new", "contacted", "qualified", "converted", "lost"}
_VALID_SERVICES = {"vente", "mise-en-location", "gestion-locative", "courte-duree", "estimation", "autre"}
_OVERDUE_DAYS = 3


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and str(principal.sub).isdigit() else None


def _my_leads_query(db: Session, principal: Principal):
    """Cloisonnement parité `_leads_query_for` : agence entière, sinon biens du particulier."""
    if principal.agency_id:
        return db.query(Lead).filter(Lead.agency_id == principal.agency_id)
    return db.query(Lead).filter(Lead.owner_id == _uid(principal))


def _authorized(lead: Lead, principal: Principal) -> bool:
    if principal.agency_id:
        return lead.agency_id == principal.agency_id
    return lead.owner_id == _uid(principal)


@app.post("/contact", status_code=201)
async def create_service_request(request: Request, db: Session = Depends(get_db)):
    """Demande de service depuis la page contact publique (aucune auth)."""
    data = await _json(request)
    if not data.get("name") or not data.get("email"):
        return _err("Name and email are required", 400)
    service = data.get("service")
    if service and service not in _VALID_SERVICES:
        return _err("Invalid service", 400)
    lead = Lead(name=data["name"], email=data["email"], phone=data.get("phone"),
                message=data.get("message"), source="service_request", service=service)
    db.add(lead)
    db.commit()
    return JSONResponse({"message": "Service request sent successfully", "lead_id": lead.id}, status_code=201)


@app.get("/my-leads")
def my_leads(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if _uid(principal) is None:
        return _err("User not found", 404)
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    query = _my_leads_query(db, principal)
    if qp.get("status"):
        query = query.filter(Lead.status == qp.get("status"))
    query = query.order_by(Lead.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"leads": [_lead_dict(db, l) for l in items], "total": total, "pages": pages, "current_page": page}


@app.get("/my-leads/summary")
def my_leads_summary(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if _uid(principal) is None:
        return _err("User not found", 404)
    from datetime import timedelta
    unread = _my_leads_query(db, principal).filter(Lead.is_read.is_(False))
    cutoff = datetime.utcnow() - timedelta(days=_OVERDUE_DAYS)
    return {"unread_count": unread.count(),
            "overdue_count": unread.filter(Lead.created_at < cutoff).count(),
            "overdue_days": _OVERDUE_DAYS}


@app.get("/leads/{lead_id}")
def get_lead(lead_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if _uid(principal) is None:
        return _err("User not found", 404)
    lead = db.get(Lead, lead_id)
    if lead is None:
        return _err("Not found", 404)
    if not _authorized(lead, principal):
        return _err("Unauthorized", 403)
    if not lead.is_read:  # ouvrir le détail marque comme lu
        lead.is_read = True
        lead.read_at = datetime.utcnow()
        db.commit()
    return {"lead": _lead_dict(db, lead)}


@app.put("/leads/{lead_id}/status")
async def update_lead_status(lead_id: int, request: Request,
                             principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if lead is None:
        return _err("Not found", 404)
    if not _authorized(lead, principal):
        return _err("Unauthorized", 403)
    data = await _json(request)
    new_status = data.get("status")
    if new_status not in _LEAD_STATUSES:
        return _err("Invalid status", 400)
    lead.status = new_status
    if new_status == "contacted" and not lead.contacted_at:
        lead.contacted_at = datetime.utcnow()
    elif new_status == "converted":
        lead.converted_at = datetime.utcnow()
    db.commit()
    return {"message": "Lead status updated", "lead": _lead_dict(db, lead)}


@app.get("/internal/leads", include_in_schema=False)
def internal_leads(request: Request, x_internal_token: str = Header(default=""),
                   db: Session = Depends(get_db)):
    """Lignes brutes de leads (par agence) — pour les agrégats du service analytics."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    aid = request.query_params.get("agency_id")
    q = db.query(Lead)
    if aid:
        q = q.filter(Lead.agency_id == int(aid))
    # Dict COMPLET (parité Lead.to_dict via _lead_dict) + champs analytics (charge_amount).
    return {"leads": [{**_lead_dict(db, l),
                       "charge_amount": float(l.charge_amount) if l.charge_amount is not None else None}
                      for l in q.all()]}


@app.get("/internal/client/{client_id}", include_in_schema=False)
def internal_client(client_id: int, x_internal_token: str = Header(default=""),
                    db: Session = Depends(get_db)):
    """Email/nom d'un client — pour la résolution des destinataires (service notification)."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    c = db.get(Client, client_id)
    if c is None:
        return {"client": None}
    return {"client": {"id": c.id, "email": c.email,
                       "name": f"{c.first_name or ''} {c.last_name or ''}".strip(),
                       "phone": c.phone, "agency_id": c.agency_id}}


@app.get("/internal/clients", include_in_schema=False)
def internal_clients(request: Request, x_internal_token: str = Header(default=""),
                     db: Session = Depends(get_db)):
    """Lignes brutes de clients (par agence) — pour les stats du service analytics."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    aid = request.query_params.get("agency_id")
    q = db.query(Client)
    if aid:
        q = q.filter(Client.agency_id == int(aid))
    return {"clients": [{
        "id": c.id, "agency_id": c.agency_id, "assigned_to_id": c.assigned_to_id,
        "full_name": f"{c.first_name or ''} {c.last_name or ''}".strip(), "email": c.email,
        "phone": c.phone, "client_type": c.client_type, "status": c.status, "source": c.source,
        "city": c.city, "created_at": _iso(c.created_at),
    } for c in q.all()]}


@app.get("/internal/visits", include_in_schema=False)
def internal_visits(request: Request, x_internal_token: str = Header(default=""),
                    db: Session = Depends(get_db)):
    """Lignes brutes de visites (par agence) — pour les stats du service analytics."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    aid = request.query_params.get("agency_id")
    q = db.query(Visit)
    if aid:
        q = q.filter(Visit.agency_id == int(aid))
    # Dict COMPLET (parité Visit.to_dict via _visit_dict) + champs analytics (agency_id/completed_at).
    return {"visits": [{**_visit_dict(db, v), "agency_id": v.agency_id,
                        "completed_at": _iso(v.completed_at)}
                       for v in q.all()]}


@app.get("/internal/visits/due-reminders", include_in_schema=False)
def internal_due_reminders(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Visites à venir dans les 24 h, non annulées, dont le rappel n'a pas encore été envoyé —
    pour l'ordonnanceur (rappel J-1). Idempotent via `reminder_sent_at`."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    from datetime import timedelta
    now = datetime.utcnow()
    rows = (db.query(Visit)
            .filter(Visit.reminder_sent_at.is_(None), Visit.cancelled_at.is_(None),
                    Visit.scheduled_at > now, Visit.scheduled_at <= now + timedelta(hours=24))
            .all())
    return {"visits": [_visit_dict(db, v) for v in rows]}


@app.post("/internal/visits/{visit_id}/reminder-sent", include_in_schema=False)
def internal_mark_reminder(visit_id: int, x_internal_token: str = Header(default=""),
                           db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    v = db.get(Visit, visit_id)
    if v is not None:
        v.reminder_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


@app.get("/internal/visits/due-follow-ups", include_in_schema=False)
def internal_due_follow_ups(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Visites ayant eu lieu il y a ~1 jour (fenêtre 20–48 h), non annulées, sans avis encore
    demandé — pour l'ordonnanceur (avis post-visite J+1). Fenêtre bornée = pas de rattrapage des
    vieilles visites ; idempotent via `follow_up_sent_at`."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    from datetime import timedelta
    now = datetime.utcnow()
    rows = (db.query(Visit)
            .filter(Visit.follow_up_sent_at.is_(None), Visit.cancelled_at.is_(None),
                    Visit.scheduled_at < now - timedelta(hours=20),
                    Visit.scheduled_at >= now - timedelta(hours=48))
            .all())
    return {"visits": [_visit_dict(db, v) for v in rows]}


@app.post("/internal/visits/{visit_id}/follow-up-sent", include_in_schema=False)
def internal_mark_follow_up(visit_id: int, x_internal_token: str = Header(default=""),
                            db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    v = db.get(Visit, visit_id)
    if v is not None:
        v.follow_up_sent_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


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
