"""Service messaging — messages acheteur ↔ vendeur/agence.

Reproduit à l'identique les routes du monolithe : `GET/POST /buyer/messages`,
`GET /buyer/messages/{id}` (réservé au rôle acheteur). **Erreurs legacy `{'error': msg}`**.
Valide l'existence du bien via une projection locale `listing_ro` (événements `listing.*`).
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
from .models import BuyerMessage, ListingRO

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


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


async def _json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/buyer/messages")
def list_messages(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if "buyer" not in principal.roles:
        return _err("Cette fonctionnalité est réservée aux acheteurs/chercheurs", 403)
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    q = db.query(BuyerMessage).filter(BuyerMessage.buyer_id == _uid(principal))
    total = q.count()
    items = (q.order_by(BuyerMessage.created_at.desc())
             .offset((page - 1) * per_page).limit(per_page).all())
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {"messages": [m.to_dict() for m in items], "total": total,
            "pages": pages, "current_page": page}


@app.post("/buyer/messages", status_code=201)
async def send_message(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if "buyer" not in principal.roles:
        return _err("Cette fonctionnalité est réservée aux acheteurs/chercheurs", 403)
    data = await _json(request)
    property_id = data.get("property_id")
    if not property_id:
        return _err("property_id requis", 400)
    if db.get(ListingRO, property_id) is None:
        return _err("Propriété non trouvée", 404)
    msg = BuyerMessage(
        buyer_id=_uid(principal), property_id=property_id,
        subject=data.get("subject", "Demande d'information"),
        message=data.get("message"),
        buyer_email=data.get("email", ""), buyer_phone=data.get("phone", ""),
    )
    db.add(msg)
    db.commit()
    return {"message": msg.to_dict(), "status": "Message envoyé avec succès"}


@app.get("/buyer/messages/{message_id}")
def get_message(message_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if "buyer" not in principal.roles:
        return _err("Cette fonctionnalité est réservée aux acheteurs/chercheurs", 403)
    msg = db.query(BuyerMessage).filter(
        BuyerMessage.id == message_id, BuyerMessage.buyer_id == _uid(principal)).first()
    if msg is None:
        return _err("Message non trouvé", 404)
    if msg.status == "new":
        msg.status = "read"
        msg.read_at = datetime.utcnow()
        db.commit()
    return {"message": msg.to_dict()}
