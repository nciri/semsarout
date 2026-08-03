"""Router crm — sous-domaine visites + calendrier."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_events import enqueue

from . import users_client
from .db import get_db
from .models import CalendarEvent, Client, PropertyRO, Visit
from .util import err, iso, json_body

router = APIRouter()

_COLORS = {"scheduled": "#6B7280", "confirmed": "#3B82F6", "completed": "#10B981",
           "cancelled": "#EF4444", "no_show": "#F59E0B"}
_V_UPDATABLE = ["property_id", "client_id", "visitor_name", "visitor_email", "visitor_phone",
                "agent_id", "duration_minutes", "visit_type", "notes", "internal_notes",
                "report", "client_feedback", "client_comments", "status"]


def _dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _visit_dict(db: Session, v: Visit) -> dict:
    ro = db.get(PropertyRO, v.property_id) if v.property_id else None
    client = db.get(Client, v.client_id) if v.client_id else None
    contact_name = f"{client.first_name or ''} {client.last_name or ''}".strip() if client else v.visitor_name
    contact_phone = client.phone if client else v.visitor_phone
    return {
        "id": v.id, "property_id": v.property_id,
        "property_title": ro.title if ro else None,
        "property_address": f"{ro.address}, {ro.city}" if ro else None,
        "client_id": v.client_id, "contact_name": contact_name, "contact_phone": contact_phone,
        "visitor_email": v.visitor_email or (client.email if client else None),
        "agent_id": v.agent_id, "agent_name": users_client.name_of(v.agency_id, v.agent_id),
        "scheduled_at": iso(v.scheduled_at), "duration_minutes": v.duration_minutes,
        "status": v.status, "visit_type": v.visit_type, "notes": v.notes, "report": v.report,
        "client_feedback": v.client_feedback, "client_comments": v.client_comments,
        "confirmed_at": iso(v.confirmed_at), "created_at": iso(v.created_at),
    }


def _event_dict(e: CalendarEvent) -> dict:
    return {
        "id": e.id, "title": e.title, "description": e.description, "event_type": e.event_type,
        "start_at": iso(e.start_at), "end_at": iso(e.end_at), "all_day": e.all_day,
        "location": e.location, "attendees": e.attendees or [], "client_id": e.client_id,
        "property_id": e.property_id, "user_id": e.user_id, "status": e.status, "color": e.color,
        "created_at": iso(e.created_at),
    }


def _owned(db: Session, visit_id: int, principal: Principal):
    v = db.get(Visit, visit_id)
    if v is None:
        return None, err("Visit not found", 404)
    if principal.agency_id and v.agency_id != principal.agency_id:
        return None, err("Access denied", 403)
    return v, None


@router.get("/backoffice/visits")
def get_visits(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    query = db.query(Visit)
    if principal.agency_id:
        query = query.filter(Visit.agency_id == principal.agency_id)
    if qp.get("status"):
        query = query.filter(Visit.status == qp.get("status"))
    if qp.get("agent_id"):
        query = query.filter(Visit.agent_id == int(qp.get("agent_id")))
    if qp.get("property_id"):
        query = query.filter(Visit.property_id == int(qp.get("property_id")))
    if qp.get("client_id"):
        query = query.filter(Visit.client_id == int(qp.get("client_id")))
    if qp.get("date_from") and _dt(qp.get("date_from")):
        query = query.filter(Visit.scheduled_at >= _dt(qp.get("date_from")))
    if qp.get("date_to") and _dt(qp.get("date_to")):
        query = query.filter(Visit.scheduled_at <= _dt(qp.get("date_to")))
    total = query.count()
    items = query.order_by(Visit.scheduled_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"visits": [_visit_dict(db, v) for v in items], "total": total, "pages": pages, "current_page": page}


@router.get("/backoffice/visits/calendar")
def calendar(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    now = datetime.utcnow()
    start = _dt(qp.get("start")) or now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = _dt(qp.get("end")) or (start.replace(year=start.year + 1, month=1) if start.month == 12
                                 else start.replace(month=start.month + 1))
    agent_id = int(qp.get("agent_id")) if qp.get("agent_id") else None

    vq = db.query(Visit).filter(Visit.scheduled_at >= start, Visit.scheduled_at < end)
    eq = db.query(CalendarEvent).filter(CalendarEvent.start_at >= start, CalendarEvent.start_at < end)
    if principal.agency_id:
        vq = vq.filter(Visit.agency_id == principal.agency_id)
        eq = eq.filter(CalendarEvent.agency_id == principal.agency_id)
    if agent_id:
        vq = vq.filter(Visit.agent_id == agent_id)
        eq = eq.filter(CalendarEvent.user_id == agent_id)

    items = []
    for v in vq.all():
        ro = db.get(PropertyRO, v.property_id) if v.property_id else None
        title = f"Visite: {ro.title[:30]}..." if ro and ro.title else "Visite"
        items.append({
            "id": f"visit-{v.id}", "type": "visit", "title": title,
            "start": iso(v.scheduled_at),
            "end": iso(v.scheduled_at + timedelta(minutes=v.duration_minutes or 30)) if v.scheduled_at else None,
            "color": _COLORS.get(v.status, "#6B7280"), "data": _visit_dict(db, v),
        })
    for e in eq.all():
        items.append({
            "id": f"event-{e.id}", "type": "event", "title": e.title,
            "start": iso(e.start_at), "end": iso(e.end_at), "allDay": e.all_day,
            "color": e.color, "data": _event_dict(e),
        })
    return {"items": items}


@router.get("/backoffice/visits/{visit_id}")
def get_visit(visit_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    v, e = _owned(db, visit_id, principal)
    if e:
        return e
    return _visit_dict(db, v)


@router.post("/backoffice/visits", status_code=201)
async def create_visit(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await json_body(request)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    v = Visit(
        property_id=data.get("property_id"), client_id=data.get("client_id"),
        visitor_name=data.get("visitor_name"), visitor_email=data.get("visitor_email"),
        visitor_phone=data.get("visitor_phone"), agent_id=data.get("agent_id") or uid,
        scheduled_at=_dt(data.get("scheduled_at")), duration_minutes=data.get("duration_minutes", 30),
        visit_type=data.get("visit_type", "in_person"), notes=data.get("notes"),
        status="scheduled", agency_id=principal.agency_id,
    )
    db.add(v)
    db.flush()
    # notification consomme visit.created → email de confirmation au visiteur.
    enqueue(db, "visit", v.id, "visit.created", _visit_dict(db, v))
    db.commit()
    return _visit_dict(db, v)


@router.put("/backoffice/visits/{visit_id}")
async def update_visit(visit_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    v, e = _owned(db, visit_id, principal)
    if e:
        return e
    data = await json_body(request)
    for f in _V_UPDATABLE:
        if f in data:
            setattr(v, f, data[f])
    if "scheduled_at" in data:
        v.scheduled_at = _dt(data["scheduled_at"])
    v.updated_at = datetime.utcnow()
    db.commit()
    return _visit_dict(db, v)


@router.delete("/backoffice/visits/{visit_id}")
def delete_visit(visit_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    v, e = _owned(db, visit_id, principal)
    if e:
        return e
    db.delete(v)
    db.commit()
    return {"message": "Visit deleted"}


@router.post("/backoffice/visits/{visit_id}/confirm")
def confirm_visit(visit_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    v, e = _owned(db, visit_id, principal)
    if e:
        return e
    v.status = "confirmed"
    v.confirmed_at = datetime.utcnow()
    db.commit()
    return _visit_dict(db, v)


@router.post("/backoffice/visits/{visit_id}/complete")
async def complete_visit(visit_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    v, e = _owned(db, visit_id, principal)
    if e:
        return e
    data = await json_body(request)
    v.status = "completed"
    v.completed_at = datetime.utcnow()
    for f in ("report", "client_feedback", "client_comments"):
        if f in data:
            setattr(v, f, data[f])
    db.commit()
    return _visit_dict(db, v)


# ---- Événements de calendrier ----
@router.get("/backoffice/calendar/events")
def list_events(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    query = db.query(CalendarEvent)
    if principal.agency_id:
        query = query.filter(CalendarEvent.agency_id == principal.agency_id)
    if _dt(qp.get("start")):
        query = query.filter(CalendarEvent.start_at >= _dt(qp.get("start")))
    if _dt(qp.get("end")):
        query = query.filter(CalendarEvent.start_at < _dt(qp.get("end")))
    return {"events": [_event_dict(e) for e in query.all()]}


@router.post("/backoffice/calendar/events", status_code=201)
async def create_event(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await json_body(request)
    uid = int(principal.sub) if principal.sub.isdigit() else None
    e = CalendarEvent(
        title=data.get("title"), description=data.get("description"),
        event_type=data.get("event_type", "meeting"), start_at=_dt(data.get("start_at")),
        end_at=_dt(data.get("end_at")), all_day=data.get("all_day", False),
        location=data.get("location"), attendees=data.get("attendees", []),
        client_id=data.get("client_id"), property_id=data.get("property_id"),
        color=data.get("color", "blue"), status=data.get("status", "pending"),
        user_id=uid, agency_id=principal.agency_id,
    )
    db.add(e)
    db.commit()
    return _event_dict(e)


@router.put("/backoffice/calendar/events/{event_id}")
async def update_event(event_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    e = db.get(CalendarEvent, event_id)
    if e is None or (principal.agency_id and e.agency_id != principal.agency_id):
        return err("Event not found", 404)
    data = await json_body(request)
    for f in ("title", "description", "event_type", "all_day", "location", "attendees",
              "client_id", "property_id", "color", "status"):
        if f in data:
            setattr(e, f, data[f])
    if "start_at" in data:
        e.start_at = _dt(data["start_at"])
    if "end_at" in data:
        e.end_at = _dt(data["end_at"])
    db.commit()
    return _event_dict(e)


@router.delete("/backoffice/calendar/events/{event_id}")
def delete_event(event_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    e = db.get(CalendarEvent, event_id)
    if e is None or (principal.agency_id and e.agency_id != principal.agency_id):
        return err("Event not found", 404)
    db.delete(e)
    db.commit()
    return {"message": "Event deleted"}
