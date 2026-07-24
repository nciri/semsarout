"""Service catalog — produits (source de vérité plateforme).

Reproduit à l'identique les routes du monolithe consommées par le front :
lecture agence (`/backoffice/shop/products*`, `/categories`) et CRUD super-admin
(`/admin/products*`). **Erreurs au format legacy `{'error': msg}`** (fidélité de contrat).
Émet `product.created/updated/deleted` (consommés par search + marketplace).
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal, require_superadmin
from semsar_common import get_settings, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .categories import PRODUCT_CATEGORIES, group_of, is_valid_category
from .db import get_db, init_db
from .models import Product

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_FIELDS = ["name", "description", "price", "stock", "image_url", "is_active"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


# Pas de handlers RFC 9457 ici : on reproduit les erreurs {'error': msg} du monolithe.
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


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Vitrine agence (lecture) ----
@app.get("/backoffice/shop/categories")
def categories(_p: Principal = Depends(get_principal)) -> dict:
    return {"categories": PRODUCT_CATEGORIES}


@app.get("/backoffice/shop/products")
def list_products(
    group: str | None = None, category: str | None = None, q: str | None = None,
    _p: Principal = Depends(get_principal), db: Session = Depends(get_db),
) -> dict:
    query = db.query(Product).filter(Product.is_active.is_(True))
    if group:
        query = query.filter(Product.group == group)
    if category:
        query = query.filter(Product.category == category)
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))
    return {"products": [p.to_dict() for p in query.order_by(Product.name).all()]}


@app.get("/backoffice/shop/products/{pid}")
def get_product(pid: int, _p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == pid, Product.is_active.is_(True)).first()
    if not p:
        return _err("Produit introuvable", 404)
    return {"product": p.to_dict()}


# ---- CRUD catalogue (super-admin) ----
@app.get("/admin/products")
def admin_list_products(
    group: str | None = None, q: str | None = None,
    _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db),
) -> dict:
    query = db.query(Product)
    if group:
        query = query.filter(Product.group == group)
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))
    return {"products": [p.to_dict() for p in query.order_by(Product.name).all()]}


@app.post("/admin/products", status_code=201)
async def admin_create_product(request: Request, principal: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    data = await _json(request)
    if not data.get("name"):
        return _err("Le nom est requis", 400)
    if not is_valid_category(data.get("category")):
        return _err("Catégorie invalide", 400)
    p = Product(
        category=data["category"], group=group_of(data["category"]),
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
        **{k: data[k] for k in _FIELDS if k in data},
    )
    db.add(p)
    db.flush()
    enqueue(db, "product", p.id, events.PRODUCT_CREATED, p.to_dict())
    db.commit()
    return {"product": p.to_dict()}


@app.put("/admin/products/{pid}")
async def admin_update_product(pid: int, request: Request, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    p = db.get(Product, pid)
    if not p:
        return _err("Produit introuvable", 404)
    data = await _json(request)
    if "category" in data:
        if not is_valid_category(data["category"]):
            return _err("Catégorie invalide", 400)
        p.category = data["category"]
        p.group = group_of(data["category"])
    for k in _FIELDS:
        if k in data:
            setattr(p, k, data[k])
    enqueue(db, "product", p.id, events.PRODUCT_UPDATED, p.to_dict())
    db.commit()
    return {"product": p.to_dict()}


@app.delete("/admin/products/{pid}")
def admin_delete_product(pid: int, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    p = db.get(Product, pid)
    if not p:
        return _err("Produit introuvable", 404)
    enqueue(db, "product", p.id, events.PRODUCT_DELETED, {"id": p.id})
    db.delete(p)
    db.commit()
    # marketplace consomme product.deleted pour nettoyer paniers/commandes (snapshots conservés).
    return {"message": "Produit supprimé"}
