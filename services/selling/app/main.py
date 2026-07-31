"""Service selling — flux vente médiée (demande d'achat → offre → compromis e-signé)."""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, listing_client
from .db import get_db, init_db  # noqa: F401
from .models import Compromis, Offer, ProcessedMessage, PurchaseInquiry, SignatureRequest  # noqa: F401
from .util import err, iso, json_body  # noqa: F401

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


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


@app.post("/vente/purchase-inquiries", status_code=201)
async def create_inquiry(request: Request, principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if not principal.sub:
        return err("Authentification requise.", 401)
    data = await json_body(request)
    pid = data.get("property_id")
    if not pid:
        return err("property_id requis.", 400)
    seller = listing_client.owner_of(pid)
    inq = PurchaseInquiry(property_id=pid, seller_party=seller, buyer_party=_uid(principal),
                          status="open")
    db.add(inq)
    db.flush()
    enqueue(db, "purchase_inquiry", inq.id, events.INQUIRY_CREATED, {
        "id": inq.id, "property_id": pid, "seller_party": seller, "buyer_party": inq.buyer_party})
    db.commit()
    return {"inquiry": {"id": inq.id, "property_id": pid, "status": inq.status}}


@app.post("/vente/purchase-inquiries/{inquiry_id}/offers", status_code=201)
async def make_offer(inquiry_id: int, request: Request, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    inq = db.get(PurchaseInquiry, inquiry_id)
    if inq is None or inq.buyer_party != _uid(principal):
        return err("Demande introuvable.", 404)
    data = await json_body(request)
    try:
        amount = float(data["amount"])
    except (KeyError, TypeError, ValueError):
        return err("amount requis.", 400)
    o = Offer(inquiry_id=inquiry_id, amount=amount, status="pending")
    inq.status = "offer_pending"
    db.add(o)
    db.flush()
    enqueue(db, "offer", o.id, events.OFFER_MADE,
            {"id": o.id, "inquiry_id": inquiry_id, "amount": amount})
    db.commit()
    return {"offer": {"id": o.id, "amount": amount, "status": o.status}}


@app.post("/vente/purchase-inquiries/{inquiry_id}/offers/{offer_id}/accept")
def accept_offer(inquiry_id: int, offer_id: int, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    inq = db.get(PurchaseInquiry, inquiry_id)
    if inq is None or inq.seller_party != _uid(principal):
        return err("Demande introuvable.", 404)
    o = db.get(Offer, offer_id)
    if o is None or o.inquiry_id != inquiry_id:
        return err("Offre introuvable.", 404)
    from datetime import datetime
    o.status = "accepted"
    o.decided_at = datetime.utcnow()
    inq.status = "accepted"
    enqueue(db, "offer", o.id, events.OFFER_ACCEPTED,
            {"id": o.id, "inquiry_id": inquiry_id, "amount": float(o.amount)})
    db.commit()
    return {"offer": {"id": o.id, "status": o.status}}
