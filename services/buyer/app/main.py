"""Service buyer — recherches sauvegardées, favoris, estimations (par utilisateur).

Reproduit à l'identique `/buyer/saved-searches*`, `/buyer/favorites*`, `/buyer/estimates*`
(cf. `backend/app/api/v1/buyer.py`). `/buyer/messages*` reste au service messaging. Cloisonné par
`user_id` (JWT). Gate `require_buyer` (rôle `buyer`) pour saved-searches + estimates (pas favoris).
Le bien imbriqué dans les favoris vient de la projection locale `property_ro` (réduite).
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .db import get_db, init_db
from .models import Favorite, PropertyEstimate, PropertyRO, SavedSearch
from .util import err, iso, json_body

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


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


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def _require_buyer(principal: Principal):
    if "buyer" not in principal.roles:
        return err("Cette fonctionnalité est réservée aux acheteurs/chercheurs", 403)
    return None


def _page(request: Request) -> tuple[int, int]:
    qp = request.query_params
    return int(qp.get("page") or 1), int(qp.get("per_page") or 20)


def _num(v):
    return float(v) if v is not None else None


def _search_dict(s: SavedSearch) -> dict:
    return {"id": s.id, "user_id": s.user_id, "name": s.name, "description": s.description,
            "criteria": s.criteria, "notify_new_matches": s.notify_new_matches,
            "last_notified_at": iso(s.last_notified_at), "created_at": iso(s.created_at),
            "updated_at": iso(s.updated_at)}


def _fav_dict(f: Favorite) -> dict:
    return {"id": f.id, "user_id": f.user_id, "property_id": f.property_id,
            "notes": f.notes, "rating": f.rating, "created_at": iso(f.created_at)}


def _prop_dict(p: PropertyRO | None) -> dict | None:
    if p is None:
        return None
    return {"id": p.id, "reference": p.reference, "title": p.title, "price": _num(p.price),
            "city": p.city, "property_type": p.property_type, "transaction_type": p.transaction_type,
            "surface": _num(p.surface), "rooms": p.rooms, "bedrooms": p.bedrooms, "status": p.status}


def _est_dict(e: PropertyEstimate) -> dict:
    return {"id": e.id, "user_id": e.user_id, "property_id": e.property_id,
            "estimated_price": _num(e.estimated_price), "estimated_reason": e.estimated_reason,
            "market_analysis": e.market_analysis, "comparison_properties": e.comparison_properties,
            "created_at": iso(e.created_at), "updated_at": iso(e.updated_at)}


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Recherches sauvegardées (require_buyer) ----
@app.get("/buyer/saved-searches")
def list_saved_searches(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _require_buyer(principal)):
        return g
    page, per_page = _page(request)
    q = db.query(SavedSearch).filter(SavedSearch.user_id == _uid(principal)).order_by(SavedSearch.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 0
    return {"searches": [_search_dict(s) for s in items], "total": total, "pages": pages, "current_page": page}


@app.post("/buyer/saved-searches", status_code=201)
async def create_saved_search(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _require_buyer(principal)):
        return g
    data = await json_body(request)
    if not data.get("name"):
        return err("Le nom de la recherche est requis", 400)
    s = SavedSearch(user_id=_uid(principal), name=data["name"], description=data.get("description"),
                    criteria=data.get("criteria", {}), notify_new_matches=data.get("notify_new_matches", True))
    db.add(s)
    db.commit()
    return JSONResponse({"search": _search_dict(s), "message": "Recherche sauvegardée"}, status_code=201)


@app.put("/buyer/saved-searches/{search_id}")
async def update_saved_search(search_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _require_buyer(principal)):
        return g
    s = db.query(SavedSearch).filter(SavedSearch.id == search_id, SavedSearch.user_id == _uid(principal)).first()
    if not s:
        return err("Recherche non trouvée", 404)
    data = await json_body(request)
    for k in ("name", "description", "criteria", "notify_new_matches"):
        if k in data:
            setattr(s, k, data[k])
    s.updated_at = datetime.utcnow()
    db.commit()
    return {"search": _search_dict(s)}


@app.delete("/buyer/saved-searches/{search_id}")
def delete_saved_search(search_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _require_buyer(principal)):
        return g
    s = db.query(SavedSearch).filter(SavedSearch.id == search_id, SavedSearch.user_id == _uid(principal)).first()
    if not s:
        return err("Recherche non trouvée", 404)
    db.delete(s)
    db.commit()
    return {"message": "Recherche supprimée"}


# ---- Favoris (jwt, PAS de require_buyer) ----
@app.get("/buyer/favorites")
def list_favorites(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    page, per_page = _page(request)
    q = db.query(Favorite).filter(Favorite.user_id == _uid(principal)).order_by(Favorite.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 0
    favs = [{**_fav_dict(f), "property": _prop_dict(db.get(PropertyRO, f.property_id))} for f in items]
    return {"favorites": favs, "total": total, "pages": pages, "current_page": page}


@app.post("/buyer/favorites", status_code=201)
async def add_favorite(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await json_body(request)
    property_id = data.get("property_id")
    if not property_id:
        return err("property_id requis", 400)
    if db.get(PropertyRO, property_id) is None:
        return err("Propriété non trouvée", 404)
    uid = _uid(principal)
    if db.query(Favorite).filter(Favorite.user_id == uid, Favorite.property_id == property_id).first():
        return err("Propriété déjà en favoris", 400)
    f = Favorite(user_id=uid, property_id=property_id, notes=data.get("notes"), rating=data.get("rating"))
    db.add(f)
    db.commit()
    return JSONResponse({"favorite": _fav_dict(f), "message": "Ajouté aux favoris"}, status_code=201)


@app.put("/buyer/favorites/{favorite_id}")
async def update_favorite(favorite_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    f = db.query(Favorite).filter(Favorite.id == favorite_id, Favorite.user_id == _uid(principal)).first()
    if not f:
        return err("Favori non trouvé", 404)
    data = await json_body(request)
    if "notes" in data:
        f.notes = data["notes"]
    if "rating" in data:
        f.rating = data["rating"]
    db.commit()
    return {"favorite": _fav_dict(f)}


@app.delete("/buyer/favorites/{favorite_id}")
def remove_favorite(favorite_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    f = db.query(Favorite).filter(Favorite.id == favorite_id, Favorite.user_id == _uid(principal)).first()
    if not f:
        return err("Favori non trouvé", 404)
    db.delete(f)
    db.commit()
    return {"message": "Supprimé des favoris"}


# ---- Estimations (require_buyer) ----
@app.get("/buyer/estimates")
def list_estimates(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _require_buyer(principal)):
        return g
    page, per_page = _page(request)
    q = db.query(PropertyEstimate).filter(PropertyEstimate.user_id == _uid(principal)).order_by(PropertyEstimate.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 0
    return {"estimates": [_est_dict(e) for e in items], "total": total, "pages": pages, "current_page": page}


@app.post("/buyer/estimates", status_code=201)
async def create_estimate(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _require_buyer(principal)):
        return g
    data = await json_body(request)
    property_id = data.get("property_id")
    estimated_price = data.get("estimated_price")
    if not property_id or not estimated_price:
        return err("property_id et estimated_price requis", 400)
    if db.get(PropertyRO, property_id) is None:
        return err("Propriété non trouvée", 404)
    e = PropertyEstimate(user_id=_uid(principal), property_id=property_id, estimated_price=estimated_price,
                         estimated_reason=data.get("estimated_reason"), market_analysis=data.get("market_analysis"),
                         comparison_properties=data.get("comparison_properties"))
    db.add(e)
    db.commit()
    return JSONResponse({"estimate": _est_dict(e), "message": "Estimation créée"}, status_code=201)


@app.put("/buyer/estimates/{estimate_id}")
async def update_estimate(estimate_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _require_buyer(principal)):
        return g
    e = db.query(PropertyEstimate).filter(PropertyEstimate.id == estimate_id, PropertyEstimate.user_id == _uid(principal)).first()
    if not e:
        return err("Estimation non trouvée", 404)
    data = await json_body(request)
    for k in ("estimated_price", "estimated_reason", "market_analysis", "comparison_properties"):
        if k in data:
            setattr(e, k, data[k])
    e.updated_at = datetime.utcnow()
    db.commit()
    return {"estimate": _est_dict(e)}


@app.delete("/buyer/estimates/{estimate_id}")
def delete_estimate(estimate_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _require_buyer(principal)):
        return g
    e = db.query(PropertyEstimate).filter(PropertyEstimate.id == estimate_id, PropertyEstimate.user_id == _uid(principal)).first()
    if not e:
        return err("Estimation non trouvée", 404)
    db.delete(e)
    db.commit()
    return {"message": "Estimation supprimée"}
