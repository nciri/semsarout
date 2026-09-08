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
from .models import EMPTY_GEOMETRY, DesignLevel, DesignProject, _uuid
from .schemas import LevelCreateIn, ProjectCreateIn, ProjectUpdateIn

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
    if body.id and db.get(DesignProject, body.id) is not None:
        existing = db.get(DesignProject, body.id)
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
    if body.id and db.get(DesignLevel, body.id) is not None:
        return JSONResponse(db.get(DesignLevel, body.id).to_dict(), status_code=201)
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
