"""Router crm — sous-domaine visites + calendrier."""
import re
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_events import enqueue

from . import users_client
from .db import get_db
from .models import AgentAvailability, CalendarEvent, Client, PropertyRO, Visit
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
        "visitor_name": v.visitor_name, "visitor_phone": v.visitor_phone,
        "visitor_email": v.visitor_email or (client.email if client else None),
        "agent_id": v.agent_id, "agent_name": users_client.name_of(v.agency_id, v.agent_id),
        "scheduled_at": iso(v.scheduled_at), "duration_minutes": v.duration_minutes,
        "status": v.status, "visit_type": v.visit_type, "notes": v.notes, "report": v.report,
        "client_feedback": v.client_feedback, "client_comments": v.client_comments,
        "confirmed_at": iso(v.confirmed_at), "completed_at": iso(v.completed_at),
        "cancelled_at": iso(v.cancelled_at), "created_at": iso(v.created_at),
    }


def _event_dict(e: CalendarEvent) -> dict:
    return {
        "id": e.id, "title": e.title, "description": e.description, "event_type": e.event_type,
        "start_at": iso(e.start_at), "end_at": iso(e.end_at), "all_day": e.all_day,
        "location": e.location, "attendees": e.attendees or [], "client_id": e.client_id,
        "property_id": e.property_id, "user_id": e.user_id, "status": e.status, "color": e.color,
        "created_at": iso(e.created_at),
    }


def _touch_client(db: Session, v: Visit) -> None:
    """Une visite honorée compte comme un échange avec le client (champ « dernier échange »)."""
    client = db.get(Client, v.client_id) if v.client_id else None
    when = min(v.scheduled_at or datetime.utcnow(), datetime.utcnow())
    if client and (client.last_contact_at is None or client.last_contact_at < when):
        client.last_contact_at = when


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


_OPEN = ("scheduled", "confirmed")
RECENT_DAYS = 90
OVERDUE_LIMIT = 50


def summarize(visits, now: datetime, days: int = RECENT_DAYS) -> dict:
    """Synthèse de l'agenda. Une visite passée encore planifiée ou confirmée n'a pas été
    requalifiée : elle ne compte ni dans « à venir » ni dans le taux de présence."""
    start = now - timedelta(days=days)
    upcoming = sorted((v for v in visits if v.status in _OPEN and v.scheduled_at >= now), key=lambda v: v.scheduled_at)
    overdue = sorted((v for v in visits if v.status in _OPEN and v.scheduled_at < now), key=lambda v: v.scheduled_at)
    recent = {"days": days, "completed": 0, "cancelled": 0, "no_show": 0, "unresolved": 0, "total": 0}
    for v in visits:
        if start <= v.scheduled_at < now:
            recent["total"] += 1
            recent[v.status if v.status in ("completed", "cancelled", "no_show") else "unresolved"] += 1
    return {
        "upcoming": len(upcoming),
        "to_confirm": sum(1 for v in upcoming if v.status == "scheduled"),
        "next": upcoming[0] if upcoming else None,
        "overdue": overdue,
        "recent": recent,
    }


# Déclarée avant /{visit_id} : sinon « summary » est pris pour un identifiant (422).
@router.get("/backoffice/visits/summary")
def visits_summary(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    now = datetime.utcnow()
    query = db.query(Visit).filter(Visit.scheduled_at.isnot(None), or_(
        Visit.status.in_(_OPEN), Visit.scheduled_at >= now - timedelta(days=RECENT_DAYS)))
    if principal.agency_id:
        query = query.filter(Visit.agency_id == principal.agency_id)
    out = summarize(query.all(), now)
    out["overdue_total"] = len(out["overdue"])
    out["overdue"] = [_visit_dict(db, v) for v in out["overdue"][:OVERDUE_LIMIT]]
    out["next"] = _visit_dict(db, out["next"]) if out["next"] else None
    return out


# Disponibilités de l'agent connecté. Déclarées AVANT /{visit_id}, sinon « availability »
# serait lu comme un identifiant de visite (422).
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
SLOT_MIN, SLOT_MAX = 15, 240
MAX_SLOTS = 50


def _slot_dict(a: AgentAvailability) -> dict:
    return {"weekday": a.weekday, "start_time": a.start_time, "end_time": a.end_time,
            "slot_minutes": a.slot_minutes}


def _clean_slots(raw):
    """Valide la liste envoyée par le client. Renvoie (créneaux, message d'erreur)."""
    if not isinstance(raw, list):
        return None, "Liste de créneaux attendue."
    if len(raw) > MAX_SLOTS:
        return None, f"Pas plus de {MAX_SLOTS} créneaux."
    out = []
    for s in raw:
        if not isinstance(s, dict):
            return None, "Créneau invalide."
        try:
            weekday = int(s.get("weekday"))
            slot_minutes = int(s.get("slot_minutes") or 30)
        except (TypeError, ValueError):
            return None, "Jour ou durée invalide."
        start, end = s.get("start_time"), s.get("end_time")
        if not 0 <= weekday <= 6:
            return None, "Jour hors semaine."
        if not (isinstance(start, str) and isinstance(end, str)
                and _HHMM.match(start) and _HHMM.match(end)):
            return None, "Heure attendue au format HH:MM."
        if start >= end:
            return None, "L'heure de fin doit suivre l'heure de début."
        if not SLOT_MIN <= slot_minutes <= SLOT_MAX:
            return None, f"Durée de créneau entre {SLOT_MIN} et {SLOT_MAX} minutes."
        out.append({"weekday": weekday, "start_time": start, "end_time": end,
                    "slot_minutes": slot_minutes})
    return out, None


def _agent_id(principal: Principal):
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


@router.get("/backoffice/visits/availability")
def get_availability(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _agent_id(principal)
    if uid is None:
        return err("Agent inconnu.", 400)
    rows = (db.query(AgentAvailability).filter(AgentAvailability.agent_id == uid)
            .order_by(AgentAvailability.weekday, AgentAvailability.start_time).all())
    return {"slots": [_slot_dict(a) for a in rows]}


@router.put("/backoffice/visits/availability")
async def put_availability(request: Request, principal: Principal = Depends(get_principal),
                           db: Session = Depends(get_db)):
    uid = _agent_id(principal)
    if uid is None:
        return err("Agent inconnu.", 400)
    data = await json_body(request)
    slots, msg = _clean_slots(data.get("slots"))
    if msg:
        return err(msg, 400)
    db.query(AgentAvailability).filter(AgentAvailability.agent_id == uid).delete()
    for s in slots:
        db.add(AgentAvailability(agent_id=uid, agency_id=principal.agency_id, **s))
    db.commit()
    return {"slots": slots}


# ---- Prise de rendez-vous publique (widget d'une annonce) -------------------------------
# Les créneaux proposés viennent des disponibilités des agents de l'agence qui publie le bien,
# moins ceux déjà pris. Sans disponibilité déclarée, aucune proposition : on n'invente rien.

def _times(start: str, end: str, step: int):
    """Heures « HH:MM » de start à end, par pas de `step` minutes, fin exclue."""
    cur = int(start[:2]) * 60 + int(start[3:])
    last = int(end[:2]) * 60 + int(end[3:])
    while cur + step <= last:
        yield f"{cur // 60:02d}:{cur % 60:02d}"
        cur += step


def _free_agents_by_time(db: Session, prop: PropertyRO, day: date) -> dict:
    """{ "09:00": [id d'agent, …] } pour ce bien et ce jour, créneaux déjà pris retirés."""
    rows = db.query(AgentAvailability).filter(
        AgentAvailability.weekday == day.weekday(),
        AgentAvailability.agency_id == prop.agency_id).all()
    # Le propriétaire de l'annonce prime : s'il a déclaré des créneaux, lui seul est proposé.
    own = [a for a in rows if a.agent_id == prop.owner_id]
    rows = own or rows

    start, end = datetime.combine(day, time.min), datetime.combine(day, time.max)
    taken = db.query(Visit).filter(Visit.scheduled_at >= start, Visit.scheduled_at <= end,
                                   Visit.status.in_(_OPEN)).all()
    busy = {(v.agent_id, v.scheduled_at.strftime("%H:%M")) for v in taken}

    out: dict[str, list] = {}
    for a in rows:
        for hhmm in _times(a.start_time, a.end_time, a.slot_minutes or 30):
            if (a.agent_id, hhmm) not in busy:
                out.setdefault(hhmm, []).append(a.agent_id)
    return out


def _day_of(value):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


@router.get("/properties/{property_id}/available-slots")
def available_slots(property_id: int, request: Request, db: Session = Depends(get_db)):
    day = _day_of(request.query_params.get("date"))
    if day is None:
        return err("Date attendue au format AAAA-MM-JJ.", 400)
    if day < datetime.utcnow().date():
        return {"slots": []}
    prop = db.get(PropertyRO, property_id)
    if prop is None or prop.agency_id is None:
        return {"slots": []}
    return {"slots": sorted(_free_agents_by_time(db, prop, day))}


@router.post("/properties/{property_id}/book-visit", status_code=201)
async def book_visit(property_id: int, request: Request, db: Session = Depends(get_db),
                     principal: Principal = Depends(get_principal)):
    data = await json_body(request)
    day = _day_of(data.get("date"))
    slot = data.get("time")
    if day is None or not isinstance(slot, str) or not _HHMM.match(slot):
        return err("Date ou heure invalide.", 400)
    prop = db.get(PropertyRO, property_id)
    if prop is None or prop.agency_id is None:
        return err("Bien introuvable.", 404)

    agents_free = _free_agents_by_time(db, prop, day).get(slot)
    if not agents_free:
        return err("Ce créneau vient d'être pris.", 409)

    scheduled = datetime.combine(day, time(int(slot[:2]), int(slot[3:])))
    if scheduled < datetime.utcnow():
        return err("Ce créneau est passé.", 400)

    v = Visit(property_id=property_id, agency_id=prop.agency_id, agent_id=agents_free[0],
              scheduled_at=scheduled, status="scheduled", visit_type="in_person",
              visitor_name=data.get("visitor_name"), visitor_email=data.get("visitor_email"),
              visitor_phone=data.get("visitor_phone"))
    db.add(v)
    db.commit()
    db.refresh(v)
    enqueue(db, "visit", v.id, "visit.created", _visit_dict(db, v))
    db.commit()
    return {"visit": _visit_dict(db, v)}


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
    now = datetime.utcnow()
    # Requalification depuis l'agenda : l'horodatage suit le statut, comme /complete.
    if data.get("status") == "completed" and not v.completed_at:
        v.completed_at = now
    if data.get("status") == "cancelled" and not v.cancelled_at:
        v.cancelled_at = now
    # Une visite honorée est un contact avec le client : sa fiche doit le refléter.
    if v.status == "completed":
        _touch_client(db, v)
    v.updated_at = now
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
    _touch_client(db, v)
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
