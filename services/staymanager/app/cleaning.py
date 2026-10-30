"""Ménage de rotation : tâches générées par le calendrier, rapports de l'agent.

Reprise de StayManager (`app/routes/cleaning.py`, 672 lignes) ramenée à l'essentiel et
rebranchée sur l'existant SemsarOut :

- **Une tâche naît d'un départ**, pas d'une saisie : chaque séjour confirmé donne un ménage
  au jour de son départ, créé une seule fois (unicité sur le séjour). Un ménage hors séjour
  (après travaux, avant une visite) reste ajoutable à la main.
- **Pas de second annuaire d'intervenants** : la tâche est confiée à un membre de l'équipe
  de l'agence (`identity`). Une intervention technique (plomberie, électricité) reste un
  ordre de travail artisan dans `directory`, et n'a rien à faire ici.
- **Pas de catalogue de produits** : une demande de réassort est un rapport `stock` dont le
  texte dit ce qui manque. Un catalogue par agence s'ajoutera s'il est réclamé.
"""
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from .db import get_db
from .gate import gate
from . import teams as teams_module
from .models import (
    CleaningPhoto, CleaningReport, CleaningTask, PropertyRO, StayManagerReservation,
)
from .util import attachment_headers, err, iso, json_body, safe_filename

router = APIRouter()

ZONES = ("chambres", "salle_de_bain", "cuisine", "sejour", "exterieur", "linge")
STATUSES = ("pending", "in_progress", "done", "cancelled")
KINDS = ("menage", "linge", "accueil", "conciergerie", "controle")
REPORT_KINDS = ("issue", "stock", "note")
# Un rapport est relu dans le navigateur de l'agent : seuls des formats inertes.
ALLOWED_PHOTO_TYPES = ("image/jpeg", "image/png", "image/webp")
MAX_PHOTO_SIZE = 8 * 1024 * 1024
MAX_PHOTOS_PER_REPORT = 5
# Les départs d'hier comptent encore : le ménage se fait parfois le lendemain matin.
BACKFILL_DAYS = 1


async def _bounded_body(request: Request) -> bytes | None:
    """Corps lu par morceaux, coupé dès le dépassement : un en-tête mensonger ne suffit pas.

    `await request.body()` chargerait d'abord tout en mémoire, quelle que soit la taille
    annoncée — un envoi sans `content-length` passerait donc le garde-fou.
    """
    size, chunks = 0, []
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_PHOTO_SIZE:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def _uid(principal: Principal) -> int | None:
    try:
        return int(principal.sub)
    except (TypeError, ValueError):
        return None


def ensure_tasks(db: Session, agency_id: int, today: date | None = None) -> int:
    """Crée le ménage manquant de chaque départ à venir ou de la veille. Renvoie le nombre créé."""
    day = today or datetime.utcnow().date()
    floor = datetime.combine(day - timedelta(days=BACKFILL_DAYS), datetime.min.time())
    stays = (db.query(StayManagerReservation)
             .filter(StayManagerReservation.agency_id == agency_id,
                     StayManagerReservation.status == "confirmed",
                     StayManagerReservation.check_out >= floor).all())
    if not stays:
        return 0
    # Le ménage seul : une tâche d'accueil ou de linge ne dispense pas de la rotation.
    # Une tâche annulée garde sa ligne (donc pas de recréation) ; seule une suppression
    # en base ferait recréer la rotation au passage suivant.
    known = {t.reservation_id for t in db.query(CleaningTask)
             .filter(CleaningTask.agency_id == agency_id,
                     CleaningTask.kind == "menage",
                     CleaningTask.reservation_id.isnot(None)).all()}
    created = 0
    for stay in stays:
        if stay.id in known or not stay.property_id:
            continue
        db.add(CleaningTask(agency_id=agency_id, property_id=stay.property_id,
                            reservation_id=stay.id, scheduled_date=stay.check_out.date(),
                            team_id=teams_module.team_of_property(db, agency_id, stay.property_id)))
        known.add(stay.id)
        created += 1
    if created:
        db.commit()
    return created


def _report_dict(db: Session, r: CleaningReport) -> dict:
    photos = db.query(CleaningPhoto).filter(CleaningPhoto.report_id == r.id).all()
    return {"id": r.id, "task_id": r.task_id, "kind": r.kind, "category": r.category,
            "text_note": r.text_note, "is_urgent": bool(r.is_urgent), "seen_at": iso(r.seen_at),
            "author_user_id": r.author_user_id, "created_at": iso(r.created_at),
            "photos": [{"id": p.id, "filename": p.filename} for p in photos]}


def _task_dict(db: Session, t: CleaningTask, with_reports: bool = False) -> dict:
    ro = db.get(PropertyRO, t.property_id)
    stay = db.get(StayManagerReservation, t.reservation_id) if t.reservation_id else None
    reports = (db.query(CleaningReport).filter(CleaningReport.task_id == t.id)
               .order_by(CleaningReport.created_at).all())
    out = {"id": t.id, "property_id": t.property_id, "property_title": ro.title if ro else None,
           "reservation_id": t.reservation_id, "kind": t.kind,
           "guest_name": stay.guest_name if stay else None,
           "next_check_in": iso(_next_arrival(db, t)) if stay else None,
           "assigned_to_id": t.assigned_to_id, "team_id": t.team_id,
           "scheduled_date": iso(t.scheduled_date),
           "status": t.status, "zones_done": list(t.zones_done or []), "notes": t.notes,
           "started_at": iso(t.started_at), "completed_at": iso(t.completed_at),
           "reports_count": len(reports),
           "urgent_count": sum(1 for r in reports if r.is_urgent and r.seen_at is None)}
    if with_reports:
        out["reports"] = [_report_dict(db, r) for r in reports]
    return out


def _next_arrival(db: Session, task: CleaningTask):
    """Prochaine arrivée sur le bien : ce qui dit si le ménage est urgent ou non."""
    start = datetime.combine(task.scheduled_date, datetime.min.time())
    row = (db.query(StayManagerReservation)
           .filter(StayManagerReservation.agency_id == task.agency_id,
                   StayManagerReservation.property_id == task.property_id,
                   StayManagerReservation.status == "confirmed",
                   StayManagerReservation.check_in >= start)
           .order_by(StayManagerReservation.check_in).first())
    return row.check_in if row else None


def _own_task(db: Session, task_id: int, principal: Principal):
    if (g := gate(principal)) is not None:
        return None, g
    t = db.get(CleaningTask, task_id)
    if t is None or t.agency_id != principal.agency_id:
        return None, err("Ménage introuvable", 404)
    return t, None


@router.get("/backoffice/sejours/menage")
def list_tasks(request: Request, principal: Principal = Depends(get_principal),
               db: Session = Depends(get_db)):
    """Planning du ménage. `status`, `property_id`, `from`/`to` (dates ISO)."""
    if (g := gate(principal)) is not None:
        return g
    ensure_tasks(db, principal.agency_id)
    qp = request.query_params
    q = db.query(CleaningTask).filter(CleaningTask.agency_id == principal.agency_id)
    if qp.get("status"):
        q = q.filter(CleaningTask.status == qp["status"])
    if qp.get("kind"):
        q = q.filter(CleaningTask.kind == qp["kind"])
    if qp.get("property_id", "").isdigit():
        q = q.filter(CleaningTask.property_id == int(qp["property_id"]))
    if qp.get("team_id", "").isdigit():
        q = q.filter(CleaningTask.team_id == int(qp["team_id"]))
    for key, op in (("from", "ge"), ("to", "le")):
        if qp.get(key):
            try:
                day = date.fromisoformat(qp[key])
            except ValueError:
                return err("Date invalide", 400)
            q = q.filter(CleaningTask.scheduled_date >= day if op == "ge"
                         else CleaningTask.scheduled_date <= day)
    rows = q.order_by(CleaningTask.scheduled_date, CleaningTask.id).all()
    return {"tasks": [_task_dict(db, t) for t in rows], "zones": list(ZONES),
            "late": sum(1 for t in rows
                        if t.status in ("pending", "in_progress")
                        and t.scheduled_date < datetime.utcnow().date()),
            "urgent_reports": sum(_task_dict(db, t)["urgent_count"] for t in rows)}


@router.post("/backoffice/sejours/menage", status_code=201)
async def create_task(request: Request, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    """Tâche hors rotation : ménage après travaux, avant une visite, linge, accueil…"""
    if (g := gate(principal)) is not None:
        return g
    data = await json_body(request)
    try:
        property_id = int(data.get("property_id") or 0)
    except (TypeError, ValueError):
        return err("Bien invalide", 400)
    ro = db.get(PropertyRO, property_id) if property_id > 0 else None
    if ro is None or (ro.agency_id and ro.agency_id != principal.agency_id):
        return err("Bien introuvable dans votre portefeuille", 400)
    try:
        day = date.fromisoformat((data.get("scheduled_date") or "").strip())
    except ValueError:
        return err("Date invalide", 400)
    kind = data.get("kind") or "menage"
    if not isinstance(kind, str) or kind.strip() not in KINDS:
        return err("Type de tâche inconnu", 400)
    task = CleaningTask(agency_id=principal.agency_id, property_id=property_id, kind=kind.strip(),
                        scheduled_date=day, notes=(data.get("notes") or "").strip()[:2000] or None)
    db.add(task)
    db.commit()
    return {"task": _task_dict(db, task)}


@router.get("/backoffice/sejours/menage/{task_id}")
def get_task(task_id: int, principal: Principal = Depends(get_principal),
             db: Session = Depends(get_db)):
    t, e = _own_task(db, task_id, principal)
    if e:
        return e
    return {"task": _task_dict(db, t, with_reports=True)}


@router.patch("/backoffice/sejours/menage/{task_id}")
async def update_task(task_id: int, request: Request,
                      principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    """Avancement du ménage : statut, zones faites, personne en charge, note."""
    t, e = _own_task(db, task_id, principal)
    if e:
        return e
    data = await json_body(request)
    if "status" in data:
        status = (data.get("status") or "").strip()
        if status not in STATUSES:
            return err("Statut inconnu", 400)
        t.status = status
        if status == "in_progress" and t.started_at is None:
            t.started_at = datetime.utcnow()
        if status == "done":
            t.completed_at = datetime.utcnow()
    if "zones_done" in data:
        zones = data.get("zones_done") or []
        if not isinstance(zones, list) or any(z not in ZONES for z in zones):
            return err("Zone inconnue", 400)
        t.zones_done = sorted(set(zones), key=ZONES.index)
    if "assigned_to_id" in data:
        raw = data.get("assigned_to_id")
        try:
            t.assigned_to_id = int(raw) if raw not in (None, "", 0) else None
        except (TypeError, ValueError):
            return err("Intervenant invalide", 400)
    if "notes" in data:
        t.notes = (data.get("notes") or "").strip()[:2000] or None
    db.commit()
    return {"task": _task_dict(db, t, with_reports=True)}


@router.post("/backoffice/sejours/menage/{task_id}/rapports", status_code=201)
async def add_report(task_id: int, request: Request,
                     principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    t, e = _own_task(db, task_id, principal)
    if e:
        return e
    data = await json_body(request)
    kind = (data.get("kind") or "").strip()
    if kind not in REPORT_KINDS:
        return err("Type de rapport inconnu", 400)
    note = (data.get("text_note") or "").strip()[:2000]
    if not note:
        return err("Le rapport doit dire ce qui se passe", 400)
    report = CleaningReport(task_id=t.id, author_user_id=_uid(principal), kind=kind,
                            category=(data.get("category") or "").strip()[:40] or None,
                            text_note=note, is_urgent=bool(data.get("is_urgent")))
    db.add(report)
    db.commit()
    return {"report": _report_dict(db, report)}


@router.post("/backoffice/sejours/menage/rapports/{report_id}/photos", status_code=201)
async def add_photo(report_id: int, request: Request,
                    principal: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    """Photo en corps brut, comme les pièces du dossier d'achat : un seul transfert."""
    if (g := gate(principal)) is not None:
        return g
    report = db.get(CleaningReport, report_id)
    task = db.get(CleaningTask, report.task_id) if report else None
    if task is None or task.agency_id != principal.agency_id:
        return err("Rapport introuvable", 404)
    if (db.query(CleaningPhoto).filter(CleaningPhoto.report_id == report.id).count()
            >= MAX_PHOTOS_PER_REPORT):
        return err("Trop de photos sur ce signalement.", 400)
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_PHOTO_SIZE:
        return err("Photo trop volumineuse (max 8 Mo).", 400)
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_PHOTO_TYPES:
        return err("Format accepté : JPEG, PNG ou WebP.", 400)
    body = await _bounded_body(request)
    if body is None:
        return err("Photo trop volumineuse (max 8 Mo).", 400)
    if not body:
        return err("Photo vide.", 400)
    from . import storage
    key = f"menage/{task.id}/{uuid.uuid4().hex}"
    storage.photos_storage().put(key, body, content_type)
    photo = CleaningPhoto(report_id=report.id, file_key=key, content_type=content_type,
                          filename=safe_filename(request.query_params.get("filename"), "photo"))
    db.add(photo)
    db.commit()
    return {"photo": {"id": photo.id, "filename": photo.filename}}


@router.get("/backoffice/sejours/menage/photos/{photo_id}")
def get_photo(photo_id: int, principal: Principal = Depends(get_principal),
              db: Session = Depends(get_db)):
    if (g := gate(principal)) is not None:
        return g
    photo = db.get(CleaningPhoto, photo_id)
    report = db.get(CleaningReport, photo.report_id) if photo else None
    task = db.get(CleaningTask, report.task_id) if report else None
    if task is None or task.agency_id != principal.agency_id:
        return err("Photo introuvable", 404)
    from . import storage
    data = storage.photos_storage().get(photo.file_key)
    return Response(data, media_type=photo.content_type or "application/octet-stream",
                    headers=attachment_headers(photo.filename or "photo"))


@router.post("/backoffice/sejours/menage/rapports/{report_id}/vu")
def mark_report_seen(report_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    if (g := gate(principal)) is not None:
        return g
    report = db.get(CleaningReport, report_id)
    task = db.get(CleaningTask, report.task_id) if report else None
    if task is None or task.agency_id != principal.agency_id:
        return err("Rapport introuvable", 404)
    report.seen_at = report.seen_at or datetime.utcnow()
    db.commit()
    return {"report": _report_dict(db, report)}
