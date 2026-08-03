"""Projection locale du catalogue + nettoyage sur suppression (consumer `product.#`)."""
from .db import SessionLocal
from .models import CartItem, OrderItem, ProcessedMessage, ProductRO


def handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return  # idempotence
        pid = payload.get("id")
        if routing_key == "product.deleted":
            # Fidèle au monolithe : on préserve les snapshots des commandes, on vide les paniers.
            db.query(OrderItem).filter(OrderItem.product_id == pid).update({OrderItem.product_id: None})
            db.query(CartItem).filter(CartItem.product_id == pid).delete()
            ro = db.get(ProductRO, pid)
            if ro is not None:
                db.delete(ro)
        else:  # product.created | product.updated
            ro = db.get(ProductRO, pid)
            if ro is None:
                ro = ProductRO(id=pid)
                db.add(ro)
            ro.name = payload.get("name")
            ro.price = payload.get("price")
            ro.stock = payload.get("stock")
            ro.image_url = payload.get("image_url")
            ro.is_active = payload.get("is_active")
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
