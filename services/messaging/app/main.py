"""Service messaging — conversations bidirectionnelles entre participants.

Routes : `GET /messaging/conversations`, `GET /messaging/conversations/{id}`,
`POST /messaging/conversations/{id}/messages` (réservées aux participants de la
conversation, tout rôle authentifié). **Erreurs legacy `{'error': msg}`**.
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
from .models import Conversation, Message

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


def _is_participant(conv: Conversation, uid: int) -> bool:
    return uid in (conv.owner_party, conv.requester_party)


@app.get("/messaging/conversations")
def list_conversations(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.sub:
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    q = (db.query(Conversation)
         .filter((Conversation.owner_party == uid) | (Conversation.requester_party == uid))
         .order_by(Conversation.updated_at.desc()))
    return {"conversations": [c.to_dict() for c in q.all()]}


@app.get("/messaging/conversations/{conversation_id}")
def get_conversation(conversation_id: int, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    uid = _uid(principal)
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return _err("Conversation introuvable", 404)
    if not _is_participant(conv, uid):
        return _err("Accès refusé", 403)
    msgs = (db.query(Message).filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at).all())
    for m in msgs:
        if m.sender_party != uid and m.read_at is None:
            m.read_at = datetime.utcnow()
    db.commit()
    return {"conversation": conv.to_dict(), "messages": [m.to_dict() for m in msgs]}


@app.post("/messaging/conversations/{conversation_id}/messages", status_code=201)
async def post_message(conversation_id: int, request: Request,
                       principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return _err("Conversation introuvable", 404)
    if not _is_participant(conv, uid):
        return _err("Accès refusé", 403)
    data = await _json(request)
    body = (data.get("body") or "").strip()
    if not body:
        return _err("Message vide", 400)
    m = Message(conversation_id=conversation_id, sender_party=uid, body=body)
    conv.updated_at = datetime.utcnow()
    db.add(m)
    db.commit()
    return {"message": m.to_dict()}
