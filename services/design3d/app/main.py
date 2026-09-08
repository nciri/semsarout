"""Service design3d — conception intérieure : plans 2D (brique 1), scènes 3D et rendus (briques 2-3).

Routes `/design3d/*` gatées par l'entitlement `design3d` (patron directory/`require_feature`).
Cloisonnement : agence → même agency_id ; sans agence → owner_id (patron listing/_bo_access).
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, require_feature
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import EMPTY_GEOMETRY, DesignLevel, DesignLevelShelf, DesignProject, _now, _uuid
from .schemas import LevelCreateIn, LevelUpdateIn, ProjectCreateIn, ProjectUpdateIn, validate_geometry

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)
_design3d = require_feature("design3d")


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


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and str(principal.sub).isdigit() else None


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


def _access(p: DesignProject, principal: Principal):
    if principal.agency_id:
        if p.agency_id != principal.agency_id:
            return _err("Access denied", 403)
    elif p.owner_id != _uid(principal):
        return _err("Access denied", 403)
    return None


def _levels(db: Session, project_id: str) -> list[DesignLevel]:
    return db.query(DesignLevel).filter(DesignLevel.project_id == project_id).order_by(DesignLevel.position, DesignLevel.created_at).all()


def _load(db: Session, project_id: str, principal: Principal):
    p = db.get(DesignProject, project_id)
    if p is None:
        return None, _err("Not found", 404)
    denied = _access(p, principal)
    return (None, denied) if denied else (p, None)


@app.post("/design3d/projects", status_code=201)
def create_project(body: ProjectCreateIn, request: Request, principal: Principal = Depends(_design3d),
                   db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    existing = db.get(DesignProject, body.id) if body.id else None
    if existing is not None:
        if existing.owner_id != uid:
            return _err("Identifiant déjà utilisé", 409)
        return JSONResponse(existing.to_dict(_levels(db, existing.id)), status_code=201)  # idempotent (rejeu outbox)
    p = DesignProject(id=body.id or _uuid(), tenant=request.headers.get("x-semsar-tenant") or "semsar",
                      agency_id=principal.agency_id, owner_id=uid, target_type=body.target_type,
                      target_id=body.target_id, title=body.title)
    db.add(p)
    db.flush()
    db.add(DesignLevel(project_id=p.id, name="RDC", position=0, geometry=dict(EMPTY_GEOMETRY), revision_author_id=uid))
    enqueue(db, "design_project", p.id, events.PROJECT_CREATED, {"id": p.id, "target_type": p.target_type, "target_id": p.target_id})
    db.commit()
    return JSONResponse(p.to_dict(_levels(db, p.id)), status_code=201)


@app.get("/design3d/projects")
def list_projects(target_type: str | None = None, target_id: int | None = None,
                  principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    q = db.query(DesignProject)
    q = q.filter(DesignProject.agency_id == principal.agency_id) if principal.agency_id else q.filter(DesignProject.owner_id == _uid(principal))
    if target_type:
        q = q.filter(DesignProject.target_type == target_type)
    if target_id is not None:
        q = q.filter(DesignProject.target_id == target_id)
    return {"projects": [p.to_dict() for p in q.order_by(DesignProject.updated_at.desc()).all()]}


@app.get("/design3d/projects/{project_id}")
def get_project(project_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    return err or p.to_dict(_levels(db, p.id))


@app.put("/design3d/projects/{project_id}")
def update_project(project_id: str, body: ProjectUpdateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    if body.title is not None:
        p.title = body.title
    if body.status is not None and body.status != p.status:
        p.status = body.status
        if body.status == "ready":
            enqueue(db, "design_project", p.id, events.PROJECT_READY, {"id": p.id, "target_type": p.target_type, "target_id": p.target_id})
    db.commit()
    return p.to_dict(_levels(db, p.id))


@app.delete("/design3d/projects/{project_id}", status_code=204)
def delete_project(project_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    enqueue(db, "design_project", p.id, events.PROJECT_DELETED, {"id": p.id})
    db.delete(p)
    db.commit()
    return Response(status_code=204)


@app.post("/design3d/projects/{project_id}/levels", status_code=201)
def create_level(project_id: str, body: LevelCreateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    existing = db.get(DesignLevel, body.id) if body.id else None
    if existing is not None:
        if existing.project_id != p.id:
            return _err("Identifiant déjà utilisé", 409)
        return JSONResponse(existing.to_dict(), status_code=201)  # idempotent (rejeu outbox)
    position = body.position or len(_levels(db, p.id))
    lv = DesignLevel(id=body.id or _uuid(), project_id=p.id, name=body.name, position=position,
                     geometry=dict(EMPTY_GEOMETRY), revision_author_id=_uid(principal))
    db.add(lv)
    db.commit()
    return JSONResponse(lv.to_dict(), status_code=201)


def _load_level(db: Session, level_id: str, principal: Principal):
    lv = db.get(DesignLevel, level_id)
    if lv is None:
        return None, None, _err("Not found", 404)
    p, err = _load(db, lv.project_id, principal)
    return (None, None, err) if err else (lv, p, None)


@app.delete("/design3d/levels/{level_id}", status_code=204)
def delete_level(level_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    if len(_levels(db, p.id)) <= 1:
        return _err("Un projet doit garder au moins un niveau", 400)
    db.delete(lv)
    db.commit()
    return Response(status_code=204)


def _shelve(db: Session, lv: DesignLevel, author_id: int, geometry, calibration, wall_height_m, base_revision: int) -> None:
    """Une seule entrée non revue par (niveau, auteur) : la précédente est remplacée."""
    prev = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.author_id == author_id,
                                              DesignLevelShelf.reviewed_at.is_(None)).first()
    if prev is not None:
        db.delete(prev)
    db.add(DesignLevelShelf(level_id=lv.id, author_id=author_id, geometry=geometry, calibration=calibration,
                            wall_height_m=wall_height_m, base_revision=base_revision))


@app.put("/design3d/levels/{level_id}")
def update_level(level_id: str, body: LevelUpdateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    uid = _uid(principal)
    is_owner = uid == p.owner_id
    height = body.wall_height_m if body.wall_height_m is not None else float(lv.wall_height_m)
    if body.geometry is not None:
        problems = validate_geometry(body.geometry, height)
        if problems:
            return JSONResponse({"error": "Géométrie invalide", "details": problems}, status_code=422)
    shelved = False
    if body.base_revision < lv.revision:
        if not is_owner:
            _shelve(db, lv, uid, body.geometry if body.geometry is not None else lv.geometry,
                    body.calibration.model_dump() if body.calibration else lv.calibration, height, body.base_revision)
            db.commit()
            return JSONResponse({"error": "Version obsolète : le propriétaire a modifié ce niveau",
                                 "level": lv.to_dict()}, status_code=409)
        if lv.revision_author_id not in (None, p.owner_id):
            _shelve(db, lv, lv.revision_author_id, lv.geometry, lv.calibration, float(lv.wall_height_m), lv.revision)
            shelved = True
    for field in ("name", "position", "show_background_public"):
        v = getattr(body, field)
        if v is not None:
            setattr(lv, field, v)
    if body.wall_height_m is not None:
        lv.wall_height_m = body.wall_height_m
    if body.calibration is not None:
        lv.calibration = body.calibration.model_dump()
    if body.geometry is not None:
        lv.geometry = body.geometry
    lv.revision += 1
    lv.revision_author_id = uid
    enqueue(db, "design_level", lv.id, events.LEVEL_UPDATED, {"id": lv.id, "project_id": p.id, "revision": lv.revision})
    db.commit()
    return {**lv.to_dict(), "shelved": shelved}


def _owner_only(p: DesignProject, principal: Principal):
    return None if _uid(principal) == p.owner_id else _err("Réservé au propriétaire du projet", 403)


@app.get("/design3d/levels/{level_id}/shelf")
def list_shelf(level_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    if (d := _owner_only(p, principal)) is not None:
        return d
    rows = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.reviewed_at.is_(None)).all()
    return {"items": [s.to_dict() for s in rows]}


@app.post("/design3d/levels/{level_id}/shelf/{shelf_id}/dismiss")
def dismiss_shelf(level_id: str, shelf_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    if (d := _owner_only(p, principal)) is not None:
        return d
    s = db.get(DesignLevelShelf, shelf_id)
    if s is None or s.level_id != lv.id:
        return _err("Not found", 404)
    s.reviewed_at = _now()
    db.commit()
    return s.to_dict()


@app.get("/design3d/sync")
def sync_summary(principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    q = db.query(DesignProject)
    q = q.filter(DesignProject.agency_id == principal.agency_id) if principal.agency_id else q.filter(DesignProject.owner_id == _uid(principal))
    out = []
    for p in q.all():
        levels = []
        for lv in _levels(db, p.id):
            shelved = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.reviewed_at.is_(None)).count()
            levels.append({"id": lv.id, "revision": lv.revision, "updated_at": lv.to_dict()["updated_at"], "shelved_count": shelved})
        out.append({"id": p.id, "status": p.status, "updated_at": p.to_dict()["updated_at"], "levels": levels})
    return {"projects": out}
