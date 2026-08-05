"""Service programs — programmes immobiliers neufs (unités, images, plans, lots interactifs).

Reproduit à l'identique `/programs*` (cf. `backend/app/api/v1/programs.py`). CRUD JSON (les images
sont des URL, pas d'upload). `agency_name`/`agency_phone` via projection AgencyRO. Gate feature
(create) via billing (has_programs/max_programs). Contact/intérêt lot → `program.contacted` (outbox)
→ crm crée un lead (v2-native, comme listing.contacted).
"""
from contextlib import asynccontextmanager
from datetime import datetime
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from slugify import slugify
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import billing_client, events
from .db import get_db, init_db
from .models import (
    AgencyRO, LOT_STATUSES, Program, ProgramImage, ProgramLot, ProgramPlan, ProgramUnit,
    ProgramUnitImage,
)
from .util import err, iso, json_body, num, to_number

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

NUMERIC_UNIT_FIELDS = {
    "surface_min": float, "surface_max": float, "rooms": int, "bedrooms": int, "bathrooms": int,
    "price_from": float, "price_to": float, "total_count": int, "available_count": int,
}
_UNIT_FIELDS = ["name", "unit_type", "surface_min", "surface_max", "rooms", "bedrooms", "bathrooms",
                "price_from", "price_to", "total_count", "available_count", "features", "specs",
                "floor_plan_url"]
_LOT_EDITABLE = ["reference", "title", "lot_type", "surface", "rooms", "bedrooms", "bathrooms",
                 "floor", "price", "status", "zone", "description", "image_url"]


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
    return f"PRG-{uuid.uuid4().hex[:8].upper()}"


def _slug(db: Session, name: str, exclude_id=None) -> str:
    base = slugify(name, max_length=200)
    slug = base
    counter = 1
    while True:
        q = db.query(Program).filter(Program.slug == slug)
        if exclude_id is not None:
            q = q.filter(Program.id != exclude_id)
        if q.first() is None:
            break
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _uid(principal: Principal):
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def _img_dict(i: ProgramImage) -> dict:
    return {"id": i.id, "program_id": i.program_id, "url": i.url, "caption": i.caption,
            "image_type": i.image_type, "position": i.position}


def _unit_img_dict(i: ProgramUnitImage) -> dict:
    return {"id": i.id, "unit_id": i.unit_id, "url": i.url, "caption": i.caption,
            "image_type": i.image_type, "position": i.position, "created_at": iso(i.created_at)}


def _unit_dict(db: Session, u: ProgramUnit, include_images: bool = False) -> dict:
    d = {"id": u.id, "program_id": u.program_id, "name": u.name, "unit_type": u.unit_type,
         "surface_min": u.surface_min, "surface_max": u.surface_max, "rooms": u.rooms,
         "bedrooms": u.bedrooms, "bathrooms": u.bathrooms, "price_from": num(u.price_from),
         "price_to": num(u.price_to), "total_count": u.total_count,
         "available_count": u.available_count, "features": u.features, "specs": u.specs,
         "floor_plan_url": u.floor_plan_url, "created_at": iso(u.created_at),
         "updated_at": iso(u.updated_at)}
    if include_images:
        imgs = (db.query(ProgramUnitImage).filter(ProgramUnitImage.unit_id == u.id)
                .order_by(ProgramUnitImage.position).all())
        d["images"] = [_unit_img_dict(i) for i in imgs]
    return d


def _lot_dict(l: ProgramLot) -> dict:
    return {"id": l.id, "program_id": l.program_id, "plan_id": l.plan_id, "reference": l.reference,
            "title": l.title, "lot_type": l.lot_type, "surface": l.surface, "rooms": l.rooms,
            "bedrooms": l.bedrooms, "bathrooms": l.bathrooms, "floor": l.floor, "price": num(l.price),
            "status": l.status, "zone": l.zone or [], "description": l.description,
            "image_url": l.image_url, "created_at": iso(l.created_at)}


def _plan_dict(db: Session, p: ProgramPlan, include_lots: bool = True) -> dict:
    lots = db.query(ProgramLot).filter(ProgramLot.plan_id == p.id).all()
    counts = {s: 0 for s in LOT_STATUSES}
    for lot in lots:
        if lot.status in counts:
            counts[lot.status] += 1
    d = {"id": p.id, "program_id": p.program_id, "name": p.name, "image_url": p.image_url,
         "position": p.position, "status_counts": counts, "created_at": iso(p.created_at)}
    if include_lots:
        d["lots"] = [_lot_dict(lot) for lot in lots]
    return d


def _prog_dict(db: Session, p: Program, include_units: bool = False, include_images: bool = False) -> dict:
    ag = db.get(AgencyRO, p.agency_id)
    d = {"id": p.id, "reference": p.reference, "name": p.name, "slug": p.slug,
         "description": p.description, "program_type": p.program_type, "address": p.address,
         "city": p.city, "neighborhood": p.neighborhood, "latitude": p.latitude,
         "longitude": p.longitude, "total_units": p.total_units, "available_units": p.available_units,
         "min_price": num(p.min_price), "max_price": num(p.max_price),
         "delivery_date": p.delivery_date.isoformat() if p.delivery_date else None,
         "construction_status": p.construction_status, "amenities": p.amenities, "specs": p.specs,
         "cover_image_url": p.cover_image_url, "brochure_url": p.brochure_url,
         "video_url": p.video_url, "status": p.status, "agency_id": p.agency_id,
         "agency_name": ag.name if ag else None, "agency_phone": ag.phone if ag else None,
         "created_by_id": p.created_by_id, "created_at": iso(p.created_at),
         "updated_at": iso(p.updated_at), "published_at": iso(p.published_at),
         "views_count": p.views_count, "contacts_count": p.contacts_count}
    if include_units:
        units = db.query(ProgramUnit).filter(ProgramUnit.program_id == p.id).all()
        d["units"] = [_unit_dict(db, u) for u in units]
    if include_images:
        imgs = db.query(ProgramImage).filter(ProgramImage.program_id == p.id).all()
        d["images"] = [_img_dict(i) for i in imgs]
    return d


def _agency_required(principal: Principal):
    if principal.agency_id is None:
        return None, err("Agence requise", 403)
    return principal.agency_id, None


def _owned(db: Session, program_id: int, agency_id: int):
    p = db.query(Program).filter(Program.id == program_id, Program.agency_id == agency_id).first()
    if p is None:
        return None, err("Programme non trouvé", 404)
    return p, None


def _emit_contact(db: Session, program: Program, data: dict, extra_msg: str = "") -> None:
    program.contacts_count = (program.contacts_count or 0) + 1
    enqueue(db, "program", program.id, events.PROGRAM_CONTACTED, {
        "name": data.get("name"),
        "email": data.get("email") or "non-renseigne@semsarout.ma",
        "phone": data.get("phone"),
        "message": f"[Programme: {program.name}{extra_msg}] {(data.get('message') or '').strip()}".strip(),
        "source": "contact_form", "agency_id": program.agency_id,
    })


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Public ----
@app.get("/programs")
def list_programs(request: Request, db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 12)
    q = db.query(Program).filter(Program.status == "active")
    if qp.get("city"):
        q = q.filter(Program.city.ilike(f"%{qp.get('city')}%"))
    if qp.get("type"):
        q = q.filter(Program.program_type == qp.get("type"))
    if qp.get("construction_status"):
        q = q.filter(Program.construction_status == qp.get("construction_status"))
    if qp.get("min_price"):
        q = q.filter(Program.min_price >= float(qp.get("min_price")))
    if qp.get("max_price"):
        q = q.filter(Program.max_price <= float(qp.get("max_price")))
    if qp.get("q"):
        term = f"%{qp.get('q')}%"
        q = q.filter(or_(Program.name.ilike(term), Program.city.ilike(term),
                         Program.neighborhood.ilike(term)))
    sort = qp.get("sort") or "created_at"
    order = qp.get("order") or "desc"
    if hasattr(Program, sort):
        col = getattr(Program, sort)
        q = q.order_by(col.desc() if order == "desc" else col.asc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"programs": [_prog_dict(db, p, include_images=True) for p in items],
            "total": total, "pages": pages, "current_page": page}


@app.post("/programs/{program_id}/contact", status_code=201)
async def contact_program(program_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.query(Program).filter(Program.id == program_id, Program.status == "active").first()
    if p is None:
        return err("Programme non trouvé", 404)
    data = await json_body(request)
    if not data.get("name") or not data.get("phone"):
        return err("Nom et téléphone requis", 400)
    _emit_contact(db, p, data)
    db.commit()
    return JSONResponse({"message": "Demande envoyée avec succès"}, status_code=201)


@app.get("/programs/my")
def list_my_programs(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    q = db.query(Program).filter(Program.agency_id == aid)
    if qp.get("status"):
        q = q.filter(Program.status == qp.get("status"))
    if qp.get("q"):
        term = f"%{qp.get('q')}%"
        q = q.filter(or_(Program.name.ilike(term), Program.reference.ilike(term), Program.city.ilike(term)))
    q = q.order_by(Program.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    sub = billing_client.subscription(aid)
    has_programs_feature = bool(sub and sub.get("has_programs"))
    programs_limit = None
    if sub and sub.get("has_programs"):
        mp = sub.get("max_programs")
        programs_limit = mp if mp != -1 else None
    return {"programs": [_prog_dict(db, p, include_units=True, include_images=True) for p in items],
            "total": total, "pages": pages, "current_page": page,
            "has_programs_feature": has_programs_feature, "programs_limit": programs_limit}


@app.get("/programs/{slug}")
def get_program(slug: str, db: Session = Depends(get_db)):
    p = db.query(Program).filter(Program.slug == slug, Program.status == "active").first()
    if p is None:
        return err("Programme non trouvé", 404)
    p.views_count = (p.views_count or 0) + 1
    db.commit()
    return {"program": _prog_dict(db, p, include_units=True, include_images=True)}


# ---- CRUD programme (gate feature à la création) ----
@app.post("/programs", status_code=201)
async def create_program(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    sub = billing_client.subscription(aid)
    if not sub or sub.get("status") != "active" or not sub.get("has_programs"):
        return err("Cette fonctionnalité nécessite le plan Pro ou supérieur", 403, upgrade_required=True)
    mp = sub.get("max_programs")
    if mp is not None and mp != -1:
        count = db.query(Program).filter(Program.agency_id == aid).count()
        if count >= mp:
            return err(f"Limite de programmes atteinte ({mp})", 403, limit_reached=True)
    data = await json_body(request)
    if not data.get("name"):
        return err("Le nom du programme est requis", 400)
    p = Program(
        reference=_reference(), name=data["name"], slug=_slug(db, data["name"]),
        description=data.get("description"), program_type=data.get("program_type", "residential"),
        address=data.get("address"), city=data.get("city"), neighborhood=data.get("neighborhood"),
        latitude=data.get("latitude"), longitude=data.get("longitude"),
        total_units=data.get("total_units", 0), available_units=data.get("available_units", 0),
        min_price=data.get("min_price"), max_price=data.get("max_price"),
        delivery_date=datetime.strptime(data["delivery_date"], "%Y-%m-%d").date() if data.get("delivery_date") else None,
        construction_status=data.get("construction_status", "planning"),
        amenities=data.get("amenities", []), cover_image_url=data.get("cover_image_url"),
        brochure_url=data.get("brochure_url"), video_url=data.get("video_url"),
        specs=data.get("specs"),
        status="draft", agency_id=aid, created_by_id=_uid(principal),
    )
    db.add(p)
    db.commit()
    return JSONResponse({"program": _prog_dict(db, p), "message": "Programme créé avec succès"}, status_code=201)


_PROG_UPDATABLE = ["name", "description", "program_type", "address", "city", "neighborhood",
                   "latitude", "longitude", "total_units", "available_units", "min_price",
                   "max_price", "construction_status", "amenities", "specs", "cover_image_url",
                   "brochure_url", "video_url", "status"]


@app.put("/programs/{program_id}")
async def update_program(program_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    data = await json_body(request)
    for f in _PROG_UPDATABLE:
        if f in data:
            setattr(p, f, data[f])
    if "name" in data:
        p.slug = _slug(db, data["name"], exclude_id=p.id)
    if "delivery_date" in data:
        p.delivery_date = datetime.strptime(data["delivery_date"], "%Y-%m-%d").date() if data["delivery_date"] else None
    db.commit()
    return {"program": _prog_dict(db, p), "message": "Programme mis à jour"}


@app.delete("/programs/{program_id}")
def delete_program(program_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    db.delete(p)
    db.commit()
    return {"message": "Programme supprimé"}


@app.post("/programs/{program_id}/publish")
def publish_program(program_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    p.status = "active"
    if p.published_at is None:
        p.published_at = datetime.utcnow()
    db.commit()
    return {"program": _prog_dict(db, p), "message": "Programme publié"}


@app.post("/programs/{program_id}/unpublish")
def unpublish_program(program_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    p.status = "draft"
    db.commit()
    return {"program": _prog_dict(db, p), "message": "Programme dépublié"}


# ---- Unités ----
@app.post("/programs/{program_id}/units", status_code=201)
async def add_unit(program_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    data = await json_body(request)
    if not data.get("name"):
        return err("Le nom du type de bien est requis", 400)
    u = ProgramUnit(
        program_id=program_id, name=data["name"], unit_type=data.get("unit_type"),
        surface_min=to_number(data.get("surface_min")), surface_max=to_number(data.get("surface_max")),
        rooms=to_number(data.get("rooms"), int), bedrooms=to_number(data.get("bedrooms"), int),
        bathrooms=to_number(data.get("bathrooms"), int), price_from=to_number(data.get("price_from")),
        price_to=to_number(data.get("price_to")),
        total_count=to_number(data.get("total_count"), int) or 0,
        available_count=to_number(data.get("available_count"), int) or 0,
        features=data.get("features", []), floor_plan_url=data.get("floor_plan_url"),
        specs=data.get("specs"),
    )
    db.add(u)
    db.commit()
    return JSONResponse({"unit": _unit_dict(db, u), "message": "Type de bien ajouté"}, status_code=201)


def _owned_unit(db: Session, program_id: int, unit_id: int, aid: int):
    p, e = _owned(db, program_id, aid)
    if e:
        return None, e
    u = db.query(ProgramUnit).filter(ProgramUnit.id == unit_id, ProgramUnit.program_id == program_id).first()
    if u is None:
        return None, err("Type de bien non trouvé", 404)
    return u, None


@app.put("/programs/{program_id}/units/{unit_id}")
async def update_unit(program_id: int, unit_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    u, e = _owned_unit(db, program_id, unit_id, aid)
    if e:
        return e
    data = await json_body(request)
    for f in _UNIT_FIELDS:
        if f in data:
            setattr(u, f, to_number(data[f], NUMERIC_UNIT_FIELDS[f]) if f in NUMERIC_UNIT_FIELDS else data[f])
    db.commit()
    return {"unit": _unit_dict(db, u), "message": "Type de bien mis à jour"}


@app.delete("/programs/{program_id}/units/{unit_id}")
def delete_unit(program_id: int, unit_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    u, e = _owned_unit(db, program_id, unit_id, aid)
    if e:
        return e
    db.delete(u)
    db.commit()
    return {"message": "Type de bien supprimé"}


# ---- Images programme ----
@app.post("/programs/{program_id}/images", status_code=201)
async def add_program_image(program_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    data = await json_body(request)
    if not data.get("url"):
        return err("URL de l'image requise", 400)
    maxpos = db.query(func.max(ProgramImage.position)).filter(ProgramImage.program_id == program_id).scalar()
    i = ProgramImage(program_id=program_id, url=data["url"], caption=data.get("caption"),
                     image_type=data.get("image_type"), position=data.get("position", (maxpos or 0) + 1))
    db.add(i)
    db.commit()
    return JSONResponse({"image": _img_dict(i), "message": "Image ajoutée"}, status_code=201)


@app.delete("/programs/{program_id}/images/{image_id}")
def delete_program_image(program_id: int, image_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    i = db.query(ProgramImage).filter(ProgramImage.id == image_id, ProgramImage.program_id == program_id).first()
    if i is None:
        return err("Image non trouvée", 404)
    db.delete(i)
    db.commit()
    return {"message": "Image supprimée"}


@app.post("/programs/{program_id}/images/reorder")
async def reorder_program_images(program_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    data = await json_body(request)
    for pos, image_id in enumerate(data.get("image_ids", [])):
        i = db.query(ProgramImage).filter(ProgramImage.id == image_id, ProgramImage.program_id == program_id).first()
        if i:
            i.position = pos
    db.commit()
    return {"message": "Images réordonnées"}


# ---- Images d'unité ----
@app.get("/programs/{program_id}/units/{unit_id}/images")
def get_unit_images(program_id: int, unit_id: int, db: Session = Depends(get_db)):
    p = db.query(Program).filter(Program.id == program_id, Program.status == "active").first()
    if p is None:
        return err("Programme non trouvé", 404)
    u = db.query(ProgramUnit).filter(ProgramUnit.id == unit_id, ProgramUnit.program_id == program_id).first()
    if u is None:
        return err("Type de bien non trouvé", 404)
    imgs = (db.query(ProgramUnitImage).filter(ProgramUnitImage.unit_id == unit_id)
            .order_by(ProgramUnitImage.position).all())
    return {"unit": _unit_dict(db, u), "images": [_unit_img_dict(i) for i in imgs], "total": len(imgs)}


@app.post("/programs/{program_id}/units/{unit_id}/images", status_code=201)
async def add_unit_image(program_id: int, unit_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    u, e = _owned_unit(db, program_id, unit_id, aid)
    if e:
        return e
    data = await json_body(request)
    if not data.get("url"):
        return err("URL de l'image requise", 400)
    maxpos = db.query(func.max(ProgramUnitImage.position)).filter(ProgramUnitImage.unit_id == unit_id).scalar()
    i = ProgramUnitImage(unit_id=unit_id, url=data["url"], caption=data.get("caption"),
                         image_type=data.get("image_type"), position=data.get("position", (maxpos or 0) + 1))
    db.add(i)
    db.commit()
    return JSONResponse({"image": _unit_img_dict(i), "message": "Image ajoutée"}, status_code=201)


@app.delete("/programs/{program_id}/units/{unit_id}/images/{image_id}")
def delete_unit_image(program_id: int, unit_id: int, image_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    u, e = _owned_unit(db, program_id, unit_id, aid)
    if e:
        return e
    i = db.query(ProgramUnitImage).filter(ProgramUnitImage.id == image_id, ProgramUnitImage.unit_id == unit_id).first()
    if i is None:
        return err("Image non trouvée", 404)
    db.delete(i)
    db.commit()
    return {"message": "Image supprimée"}


@app.post("/programs/{program_id}/units/{unit_id}/images/reorder")
async def reorder_unit_images(program_id: int, unit_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    u, e = _owned_unit(db, program_id, unit_id, aid)
    if e:
        return e
    data = await json_body(request)
    for pos, image_id in enumerate(data.get("image_ids", [])):
        i = db.query(ProgramUnitImage).filter(ProgramUnitImage.id == image_id, ProgramUnitImage.unit_id == unit_id).first()
        if i:
            i.position = pos
    db.commit()
    return {"message": "Images réordonnées"}


# ---- Plans interactifs ----
@app.get("/programs/{program_id}/plans")
def list_plans(program_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.get(Program, program_id)
    if p is None:
        return err("Not found", 404)
    if p.status != "active":
        agency = request.headers.get("x-semsar-agency-id")
        if not agency or int(agency) != p.agency_id:
            return err("Programme non trouvé", 404)
    plans = db.query(ProgramPlan).filter(ProgramPlan.program_id == program_id).order_by(ProgramPlan.position).all()
    return {"plans": [_plan_dict(db, pl, include_lots=True) for pl in plans]}


@app.post("/programs/{program_id}/plans", status_code=201)
async def create_plan(program_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    data = await json_body(request)
    if not data.get("name"):
        return err("Le nom du plan est requis", 400)
    maxpos = db.query(func.max(ProgramPlan.position)).filter(ProgramPlan.program_id == program_id).scalar()
    pl = ProgramPlan(program_id=program_id, name=data["name"], image_url=data.get("image_url"),
                     position=data.get("position", (maxpos or 0) + 1))
    db.add(pl)
    db.commit()
    return JSONResponse({"plan": _plan_dict(db, pl)}, status_code=201)


def _owned_plan(db: Session, program_id: int, plan_id: int, aid: int):
    p, e = _owned(db, program_id, aid)
    if e:
        return None, e
    pl = db.query(ProgramPlan).filter(ProgramPlan.id == plan_id, ProgramPlan.program_id == program_id).first()
    if pl is None:
        return None, err("Plan non trouvé", 404)
    return pl, None


@app.put("/programs/{program_id}/plans/{plan_id}")
async def update_plan(program_id: int, plan_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    pl, e = _owned_plan(db, program_id, plan_id, aid)
    if e:
        return e
    data = await json_body(request)
    for f in ("name", "image_url", "position"):
        if f in data:
            setattr(pl, f, data[f])
    db.commit()
    return {"plan": _plan_dict(db, pl)}


@app.delete("/programs/{program_id}/plans/{plan_id}")
def delete_plan(program_id: int, plan_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    pl, e = _owned_plan(db, program_id, plan_id, aid)
    if e:
        return e
    db.delete(pl)
    db.commit()
    return {"message": "Plan supprimé"}


# ---- Lots ----
@app.post("/programs/{program_id}/lots", status_code=201)
async def create_lot(program_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    p, e = _owned(db, program_id, aid)
    if e:
        return e
    data = await json_body(request)
    plan = db.query(ProgramPlan).filter(ProgramPlan.id == data.get("plan_id"), ProgramPlan.program_id == program_id).first()
    if plan is None:
        return err("Plan non trouvé", 404)
    status = data.get("status", "available")
    if status not in LOT_STATUSES:
        status = "available"
    lot = ProgramLot(program_id=program_id, plan_id=plan.id, reference=data.get("reference"),
                     title=data.get("title"), lot_type=data.get("lot_type"), surface=data.get("surface"),
                     rooms=data.get("rooms"), bedrooms=data.get("bedrooms"), bathrooms=data.get("bathrooms"),
                     floor=data.get("floor"), price=data.get("price"), status=status,
                     zone=data.get("zone", []), description=data.get("description"),
                     image_url=data.get("image_url"))
    db.add(lot)
    db.commit()
    return JSONResponse({"lot": _lot_dict(lot)}, status_code=201)


def _owned_lot(db: Session, program_id: int, lot_id: int, aid: int):
    p, e = _owned(db, program_id, aid)
    if e:
        return None, e
    lot = db.query(ProgramLot).filter(ProgramLot.id == lot_id, ProgramLot.program_id == program_id).first()
    if lot is None:
        return None, err("Lot non trouvé", 404)
    return lot, None


@app.put("/programs/{program_id}/lots/{lot_id}")
async def update_lot(program_id: int, lot_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    lot, e = _owned_lot(db, program_id, lot_id, aid)
    if e:
        return e
    data = await json_body(request)
    for f in _LOT_EDITABLE:
        if f in data:
            if f == "status" and data[f] not in LOT_STATUSES:
                continue
            setattr(lot, f, data[f])
    db.commit()
    return {"lot": _lot_dict(lot)}


@app.patch("/programs/{program_id}/lots/{lot_id}/status")
async def update_lot_status(program_id: int, lot_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    lot, e = _owned_lot(db, program_id, lot_id, aid)
    if e:
        return e
    status = (await json_body(request)).get("status")
    if status not in LOT_STATUSES:
        return err("Statut invalide", 400)
    lot.status = status
    db.commit()
    return {"lot": _lot_dict(lot)}


@app.delete("/programs/{program_id}/lots/{lot_id}")
def delete_lot(program_id: int, lot_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    aid, e = _agency_required(principal)
    if e:
        return e
    lot, e = _owned_lot(db, program_id, lot_id, aid)
    if e:
        return e
    db.delete(lot)
    db.commit()
    return {"message": "Lot supprimé"}


@app.post("/programs/{program_id}/lots/interest", status_code=201)
async def express_lot_interest(program_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.query(Program).filter(Program.id == program_id, Program.status == "active").first()
    if p is None:
        return err("Programme non trouvé", 404)
    data = await json_body(request)
    lot_ids = data.get("lot_ids", [])
    if not data.get("name") or not data.get("phone"):
        return err("Nom et téléphone requis", 400)
    if not lot_ids:
        return err("Aucun lot sélectionné", 400)
    lots = db.query(ProgramLot).filter(ProgramLot.program_id == program_id, ProgramLot.id.in_(lot_ids)).all()
    lot_refs = ", ".join(l.reference or f"#{l.id}" for l in lots) or "—"
    _emit_contact(db, p, data, extra_msg=f" — Lots: {lot_refs}")
    db.commit()
    return JSONResponse({"message": "Demande envoyée avec succès", "lots": lot_refs}, status_code=201)
