"""Service marketplace — panier + commandes (agence). Consomme le catalogue.

Reproduit à l'identique les routes du monolithe : panier `/backoffice/shop/cart*`,
commandes `/backoffice/shop/orders*`, admin `/admin/orders*`. Erreurs legacy `{'error': msg}`.
Le stock est **réservé de façon autoritaire auprès de `catalog`** au paiement.
"""
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal, require_superadmin
from semsar_common import get_settings, setup_logging, setup_tracing

from . import catalog_client
from .db import get_db, init_db
from .models import Cart, CartItem, Order, OrderItem, ProductRO

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_ORDER_STATUSES = {"pending", "paid", "preparing", "shipped", "delivered", "cancelled"}


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


def _uid(principal: Principal) -> int:
    return int(principal.sub) if principal.sub.isdigit() else 0


def _get_or_create_cart(db: Session, user_id: int) -> Cart:
    cart = db.query(Cart).filter(Cart.user_id == user_id).first()
    if cart is None:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.commit()
    return cart


def _cart_payload(db: Session, cart: Cart) -> dict:
    items = db.query(CartItem).filter(CartItem.cart_id == cart.id).all()
    dicts = []
    for it in items:
        p = db.get(ProductRO, it.product_id)
        unit = float(p.price) if p and p.price is not None else 0
        dicts.append({
            "id": it.id, "product_id": it.product_id, "quantity": it.quantity,
            "product": ({"id": p.id, "name": p.name, "price": unit, "image_url": p.image_url,
                         "stock": p.stock, "is_active": p.is_active} if p else None),
            "line_total": round(unit * it.quantity, 2),
        })
    return {"id": cart.id, "items": dicts, "total": round(sum(d["line_total"] for d in dicts), 2)}


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Panier ----
@app.get("/backoffice/shop/cart")
def get_cart(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    return {"cart": _cart_payload(db, _get_or_create_cart(db, _uid(principal)))}


@app.post("/backoffice/shop/cart/items", status_code=201)
async def add_cart_item(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    data = await _json(request)
    prod = db.query(ProductRO).filter(ProductRO.id == data.get("product_id"), ProductRO.is_active.is_(True)).first()
    if prod is None:
        return _err("Produit invalide", 400)
    try:
        qty = max(1, int(data.get("quantity")))
    except (TypeError, ValueError):
        qty = 1
    cart = _get_or_create_cart(db, _uid(principal))
    item = db.query(CartItem).filter(CartItem.cart_id == cart.id, CartItem.product_id == prod.id).first()
    if item is not None:
        item.quantity += qty
    else:
        db.add(CartItem(cart_id=cart.id, product_id=prod.id, quantity=qty))
    db.commit()
    return {"cart": _cart_payload(db, cart)}


@app.put("/backoffice/shop/cart/items/{item_id}")
async def update_cart_item(item_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    cart = _get_or_create_cart(db, _uid(principal))
    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.cart_id == cart.id).first()
    if item is None:
        return _err("Article introuvable", 404)
    data = await _json(request)
    try:
        qty = int(data.get("quantity"))
    except (TypeError, ValueError):
        return _err("Quantité invalide", 400)
    if qty < 1:
        return _err("Quantité invalide", 400)
    item.quantity = qty
    db.commit()
    return {"cart": _cart_payload(db, cart)}


@app.delete("/backoffice/shop/cart/items/{item_id}")
def delete_cart_item(item_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    cart = _get_or_create_cart(db, _uid(principal))
    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.cart_id == cart.id).first()
    if item is None:
        return _err("Article introuvable", 404)
    db.delete(item)
    db.commit()
    return {"cart": _cart_payload(db, cart)}


# ---- Commandes (agence) ----
def _require_agency(principal: Principal):
    if principal.agency_id is None:
        return _err("Un compte agence est requis pour commander.", 403)
    return None


@app.post("/backoffice/shop/orders", status_code=201)
async def checkout(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    err = _require_agency(principal)
    if err:
        return err
    cart = _get_or_create_cart(db, _uid(principal))
    items = db.query(CartItem).filter(CartItem.cart_id == cart.id).all()
    if not items:
        return _err("Votre panier est vide.", 400)
    lines = []
    subtotal = 0.0
    for it in items:
        p = db.get(ProductRO, it.product_id)
        if p is None or not p.is_active:
            return _err("Un produit du panier n'est plus disponible.", 400)
        if (p.stock or 0) < it.quantity:
            return _err(f"Stock insuffisant pour « {p.name} ».", 400)
        line_total = float(p.price) * it.quantity
        subtotal += line_total
        lines.append((p, it.quantity, line_total))

    data = await _json(request)
    # Note : la dérivation de l'adresse depuis un bien (property_id) relève du domaine
    # `listing` (non extrait) — ici on stocke property_id et on prend l'adresse du corps.
    order = Order(
        reference=f"CMD-{secrets.token_hex(3).upper()}", agency_id=principal.agency_id,
        buyer_id=_uid(principal), property_id=data.get("property_id"),
        delivery_address=data.get("delivery_address"), status="pending",
        subtotal=round(subtotal, 2), total=round(subtotal, 2),
    )
    db.add(order)
    db.flush()
    for p, qty, line_total in lines:
        db.add(OrderItem(order_id=order.id, product_id=p.id, product_name=p.name,
                         unit_price=p.price, quantity=qty, line_total=round(line_total, 2)))
    db.query(CartItem).filter(CartItem.cart_id == cart.id).delete()
    db.commit()
    return {"order": order.to_dict(items=db.query(OrderItem).filter(OrderItem.order_id == order.id).all())}


@app.post("/backoffice/shop/orders/{oid}/pay")
def pay_order(oid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    err = _require_agency(principal)
    if err:
        return err
    order = db.query(Order).filter(Order.id == oid, Order.agency_id == principal.agency_id).first()
    if order is None:
        return _err("Commande introuvable", 404)
    if order.status != "pending":
        return _err("Commande déjà réglée ou traitée.", 409)
    order_items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    # Réservation autoritaire du stock auprès de catalog (tout ou rien).
    reserve_items = [{"product_id": it.product_id, "quantity": it.quantity} for it in order_items if it.product_id]
    try:
        resp = catalog_client.reserve(reserve_items)
    except Exception:  # noqa: BLE001
        return _err("Service catalogue indisponible.", 502)
    if resp.status_code == 409:
        body = resp.json() if resp.content else {}
        return _err(body.get("error", "Stock insuffisant."), 409)
    if resp.status_code != 200:
        return _err("Service catalogue indisponible.", 502)
    order.status = "paid"
    order.paid_at = datetime.now(timezone.utc)
    order.payment_reference = f"PAY-{secrets.token_hex(4).upper()}"
    db.commit()
    return {"order": order.to_dict(items=order_items)}


@app.get("/backoffice/shop/orders")
def list_orders(status: str | None = None, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    q = db.query(Order).filter(Order.agency_id == principal.agency_id)
    if status:
        q = q.filter(Order.status == status)
    return {"orders": [o.to_dict() for o in q.order_by(Order.created_at.desc()).all()]}


@app.get("/backoffice/shop/orders/{oid}")
def get_order(oid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == oid, Order.agency_id == principal.agency_id).first()
    if order is None:
        return _err("Commande introuvable", 404)
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    return {"order": order.to_dict(items=items)}


# ---- Admin (super-admin) ----
@app.get("/admin/orders")
def admin_list_orders(status: str | None = None, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)) -> dict:
    q = db.query(Order)
    if status:
        q = q.filter(Order.status == status)
    return {"orders": [o.to_dict() for o in q.order_by(Order.created_at.desc()).all()]}


@app.get("/admin/orders/{oid}")
def admin_get_order(oid: int, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    order = db.get(Order, oid)
    if order is None:
        return _err("Commande introuvable", 404)
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    return {"order": order.to_dict(items=items)}


@app.put("/admin/orders/{oid}")
async def admin_update_order(oid: int, request: Request, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    order = db.get(Order, oid)
    if order is None:
        return _err("Commande introuvable", 404)
    data = await _json(request)
    status = data.get("status")
    if status not in _ORDER_STATUSES:
        return _err("Statut invalide", 400)
    order.status = status
    db.commit()
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    return {"order": order.to_dict(items=items)}
