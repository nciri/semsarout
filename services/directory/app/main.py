"""Service directory — artisans (partagés + privés) + bons de travaux.

Reproduit à l'identique les routes du monolithe (`/backoffice/artisans*`,
`/backoffice/work-orders*`, `/backoffice/artisan-trades`, `/admin/shared-artisans*`).
Gate d'abonnement via `require_feature('artisans')` (entitlements injectés par le BFF).
Erreurs legacy `{'error': msg}`.
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, require_feature, require_superadmin
from semsar_common import get_settings, setup_logging, setup_tracing

from .db import get_db, init_db
from .models import Artisan, WorkOrder
from .trades import ARTISAN_TRADES, is_valid_trade

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_FIELDS = ["trade", "name", "company", "city", "phone", "email", "notes"]
_artisans = require_feature("artisans")  # gate d'abonnement des routes back-office


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


def _parse_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _artisan_dict(a: Artisan) -> dict:
    return {
        "id": a.id, "agency_id": a.agency_id, "is_shared": a.agency_id is None,
        "trade": a.trade, "name": a.name, "company": a.company, "city": a.city,
        "phone": a.phone, "email": a.email, "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _wo_dict(db: Session, w: WorkOrder) -> dict:
    artisan = db.get(Artisan, w.artisan_id) if w.artisan_id else None
    return {
        "id": w.id, "agency_id": w.agency_id, "artisan_id": w.artisan_id,
        "artisan": ({"id": artisan.id, "name": artisan.name, "trade": artisan.trade} if artisan else None),
        "property_id": w.property_id, "title": w.title, "trade": w.trade, "status": w.status,
        "cost_estimate": float(w.cost_estimate) if w.cost_estimate is not None else None,
        "cost_final": float(w.cost_final) if w.cost_final is not None else None,
        "scheduled_date": w.scheduled_date.isoformat() if w.scheduled_date else None,
        "completed_at": w.completed_at.isoformat() if w.completed_at else None,
        "notes": w.notes, "created_at": w.created_at.isoformat() if w.created_at else None,
    }


def _accessible_artisan(db: Session, aid, agency_id: int) -> Artisan | None:
    if not aid:
        return None
    return (
        db.query(Artisan)
        .filter(Artisan.id == aid, (Artisan.agency_id.is_(None)) | (Artisan.agency_id == agency_id))
        .first()
    )


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Métiers + annuaire (gated) ----
@app.get("/backoffice/artisan-trades")
def list_trades(_p: Principal = Depends(_artisans)) -> dict:
    return {"trades": ARTISAN_TRADES}


@app.get("/backoffice/artisans")
def list_artisans(
    trade: str | None = None, city: str | None = None, q: str | None = None,
    principal: Principal = Depends(_artisans), db: Session = Depends(get_db),
) -> dict:
    query = db.query(Artisan).filter(
        (Artisan.agency_id.is_(None)) | (Artisan.agency_id == principal.agency_id)
    )
    if trade:
        query = query.filter(Artisan.trade == trade)
    if city:
        query = query.filter(Artisan.city.ilike(f"%{city}%"))
    if q:
        term = f"%{q}%"
        query = query.filter((Artisan.name.ilike(term)) | (Artisan.company.ilike(term)))
    return {"artisans": [_artisan_dict(a) for a in query.order_by(Artisan.name).all()]}


@app.post("/backoffice/artisans", status_code=201)
async def create_artisan(request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    data = await _json(request)
    if not data.get("name"):
        return _err("Le nom est requis", 400)
    if not is_valid_trade(data.get("trade")):
        return _err("Métier invalide", 400)
    a = Artisan(
        agency_id=principal.agency_id,
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
        **{k: data.get(k) for k in _FIELDS},
    )
    db.add(a)
    db.commit()
    return {"artisan": _artisan_dict(a)}


@app.put("/backoffice/artisans/{aid}")
async def update_artisan(aid: int, request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    a = db.query(Artisan).filter(Artisan.id == aid, Artisan.agency_id == principal.agency_id).first()
    if a is None:
        return _err("Artisan introuvable", 404)
    data = await _json(request)
    if "trade" in data and not is_valid_trade(data["trade"]):
        return _err("Métier invalide", 400)
    for k in _FIELDS:
        if k in data:
            setattr(a, k, data[k])
    db.commit()
    return {"artisan": _artisan_dict(a)}


@app.delete("/backoffice/artisans/{aid}")
def delete_artisan(aid: int, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    a = db.query(Artisan).filter(Artisan.id == aid, Artisan.agency_id == principal.agency_id).first()
    if a is None:
        return _err("Artisan introuvable", 404)
    db.delete(a)
    db.commit()
    return {"message": "Artisan supprimé"}


# ---- Bons de travaux (gated) ----
def _validate_links(db: Session, data: dict, agency_id: int):
    if data.get("artisan_id") and not _accessible_artisan(db, data["artisan_id"], agency_id):
        return _err("Artisan inaccessible", 400)
    # property_id : la validation d'appartenance relève de `listing` (non extrait) — stocké tel quel.
    return None


@app.get("/backoffice/work-orders")
def list_work_orders(
    status: str | None = None, property_id: int | None = None,
    principal: Principal = Depends(_artisans), db: Session = Depends(get_db),
) -> dict:
    query = db.query(WorkOrder).filter(WorkOrder.agency_id == principal.agency_id)
    if status:
        query = query.filter(WorkOrder.status == status)
    if property_id:
        query = query.filter(WorkOrder.property_id == property_id)
    return {"work_orders": [_wo_dict(db, w) for w in query.order_by(WorkOrder.created_at.desc()).all()]}


@app.post("/backoffice/work-orders", status_code=201)
async def create_work_order(request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    data = await _json(request)
    if not data.get("title"):
        return _err("Le titre est requis", 400)
    if not is_valid_trade(data.get("trade")):
        return _err("Métier invalide", 400)
    err = _validate_links(db, data, principal.agency_id)
    if err:
        return err
    wo = WorkOrder(
        agency_id=principal.agency_id, title=data["title"], trade=data["trade"], status="requested",
        artisan_id=data.get("artisan_id"), property_id=data.get("property_id"),
        cost_estimate=data.get("cost_estimate"), notes=data.get("notes"),
        scheduled_date=_parse_dt(data.get("scheduled_date")),
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
    )
    db.add(wo)
    db.commit()
    return {"work_order": _wo_dict(db, wo)}


@app.get("/backoffice/work-orders/{wid}")
def get_work_order(wid: int, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wid, WorkOrder.agency_id == principal.agency_id).first()
    if wo is None:
        return _err("Bon de travaux introuvable", 404)
    return {"work_order": _wo_dict(db, wo)}


@app.put("/backoffice/work-orders/{wid}")
async def update_work_order(wid: int, request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wid, WorkOrder.agency_id == principal.agency_id).first()
    if wo is None:
        return _err("Bon de travaux introuvable", 404)
    data = await _json(request)
    if "trade" in data and not is_valid_trade(data["trade"]):
        return _err("Métier invalide", 400)
    err = _validate_links(db, data, principal.agency_id)
    if err:
        return err
    for k in ("title", "notes", "cost_estimate", "cost_final"):
        if k in data:
            setattr(wo, k, data[k])
    if "trade" in data:
        wo.trade = data["trade"]
    if "artisan_id" in data:
        wo.artisan_id = data["artisan_id"]
    if "property_id" in data:
        wo.property_id = data["property_id"]
    if "scheduled_date" in data:
        wo.scheduled_date = _parse_dt(data["scheduled_date"])
    if "status" in data:
        wo.status = data["status"]
        wo.completed_at = datetime.utcnow() if data["status"] == "done" else None
    db.commit()
    return {"work_order": _wo_dict(db, wo)}


@app.delete("/backoffice/work-orders/{wid}")
def delete_work_order(wid: int, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wid, WorkOrder.agency_id == principal.agency_id).first()
    if wo is None:
        return _err("Bon de travaux introuvable", 404)
    db.delete(wo)
    db.commit()
    return {"message": "Bon de travaux supprimé"}


# ---- Catalogue partagé (super-admin) ----
@app.get("/admin/shared-artisans")
def admin_list_shared(trade: str | None = None, q: str | None = None, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)) -> dict:
    query = db.query(Artisan).filter(Artisan.agency_id.is_(None))
    if trade:
        query = query.filter(Artisan.trade == trade)
    if q:
        query = query.filter(Artisan.name.ilike(f"%{q}%"))
    return {"artisans": [_artisan_dict(a) for a in query.order_by(Artisan.name).all()]}


@app.post("/admin/shared-artisans", status_code=201)
async def admin_create_shared(request: Request, principal: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    data = await _json(request)
    if not data.get("name"):
        return _err("Le nom est requis", 400)
    if not is_valid_trade(data.get("trade")):
        return _err("Métier invalide", 400)
    a = Artisan(
        agency_id=None,
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
        **{k: data.get(k) for k in _FIELDS},
    )
    db.add(a)
    db.commit()
    return {"artisan": _artisan_dict(a)}


@app.put("/admin/shared-artisans/{aid}")
async def admin_update_shared(aid: int, request: Request, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    a = db.query(Artisan).filter(Artisan.id == aid, Artisan.agency_id.is_(None)).first()
    if a is None:
        return _err("Artisan partagé introuvable", 404)
    data = await _json(request)
    if "trade" in data and not is_valid_trade(data["trade"]):
        return _err("Métier invalide", 400)
    for k in _FIELDS:
        if k in data:
            setattr(a, k, data[k])
    db.commit()
    return {"artisan": _artisan_dict(a)}


@app.delete("/admin/shared-artisans/{aid}")
def admin_delete_shared(aid: int, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    a = db.query(Artisan).filter(Artisan.id == aid, Artisan.agency_id.is_(None)).first()
    if a is None:
        return _err("Artisan partagé introuvable", 404)
    db.delete(a)
    db.commit()
    return {"message": "Artisan supprimé"}
