"""Service messaging — conversations bidirectionnelles entre participants + notifications
in-app (m3a-l3achrane).

Routes conversations : `GET/POST /messaging/conversations`, `GET /messaging/conversations/{id}`,
`POST /messaging/conversations/{id}/messages`, `POST /messaging/conversations/{id}/read`
(réservées aux participants de la conversation, tout rôle authentifié, tenant forcé serveur).

Routes notifications : `GET /messaging/notifications`, `GET /messaging/notifications/unread-count`,
`POST /messaging/notifications/{id}/read`, `POST /messaging/notifications/read-all` (mes
notifications uniquement). `POST /internal/notifications` (jeton interne) pour la génération
service→service (cf. `app.worker` pour les événements bail/paiement consommés en async).

**Erreurs legacy `{'error': msg}`**.
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
from .models import DEFAULT_TENANT, Conversation, Message, Notification

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


def _tenant(request: Request) -> str:
    """Tenant FORCÉ serveur : jamais lu depuis le corps/la query d'un client, uniquement
    depuis l'en-tête posé par le BFF (identité vérifiée), défaut m3a-l3achrane pour les
    fils legacy sans tenant explicite."""
    return request.headers.get("x-semsar-tenant") or DEFAULT_TENANT


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


def _is_participant(conv: Conversation, uid: int) -> bool:
    return bool(uid) and uid in (conv.owner_party, conv.requester_party)


def _other_party(conv: Conversation, uid: int) -> int | None:
    return conv.owner_party if uid == conv.requester_party else conv.requester_party


def _message_dict(m: Message, uid: int) -> dict:
    """Le front n'a pas accès à son propre user_id (jeton httpOnly) : `mine` le lui évite."""
    return {**m.to_dict(), "mine": m.sender_party == uid}


@app.get("/messaging/conversations")
def list_conversations(request: Request, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if not principal.sub:
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    tenant = _tenant(request)
    q = (db.query(Conversation)
         .filter(Conversation.tenant == tenant)
         .filter((Conversation.owner_party == uid) | (Conversation.requester_party == uid))
         .order_by(Conversation.updated_at.desc()))
    items = []
    for c in q.all():
        d = c.to_dict()
        d["other_user_id"] = _other_party(c, uid)
        d["is_requester"] = uid == c.requester_party
        items.append(d)
    return {"conversations": items}


@app.post("/messaging/conversations", status_code=201)
async def create_conversation(request: Request, principal: Principal = Depends(get_principal),
                              db: Session = Depends(get_db)):
    """Ouvre (ou récupère) une conversation avec `other_user_id` sur le contexte donné —
    dédupe par (tenant, context_type, context_ref_id/listing, les deux participants, quel
    que soit l'ordre). Idéal pour l'entrée « Contacter » (candidature/annonce/bail)."""
    if not principal.sub or not principal.sub.isdigit():
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    data = await _json(request)
    other = data.get("other_user_id")
    context_type = str(data.get("context_type") or "listing")
    context_ref_id = data.get("context_ref_id")
    listing_id = data.get("listing_id") if data.get("listing_id") is not None else context_ref_id
    if not isinstance(other, int) or other == uid or listing_id is None:
        return _err("Requête invalide (other_user_id, listing_id/context_ref_id requis)", 400)
    tenant = _tenant(request)
    existing = (
        db.query(Conversation)
        .filter(Conversation.tenant == tenant, Conversation.property_id == listing_id,
                Conversation.context_type == context_type)
        .filter(
            ((Conversation.owner_party == uid) & (Conversation.requester_party == other))
            | ((Conversation.owner_party == other) & (Conversation.requester_party == uid))
        )
        .first()
    )
    if existing is not None:
        return {"conversation": existing.to_dict(), "created": False}
    conv = Conversation(tenant=tenant, property_id=listing_id, owner_party=other,
                        requester_party=uid, context_type=context_type,
                        context_ref_id=context_ref_id, status="open")
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {"conversation": conv.to_dict(), "created": True}


@app.get("/messaging/conversations/{conversation_id}")
def get_conversation(conversation_id: int, request: Request,
                     principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.sub:
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return _err("Conversation introuvable", 404)
    if conv.tenant != _tenant(request) or not _is_participant(conv, uid):
        return _err("Accès refusé", 403)
    msgs = (db.query(Message).filter(Message.conversation_id == conversation_id)
            .order_by(Message.created_at).all())
    for m in msgs:
        if m.sender_party != uid and m.read_at is None:
            m.read_at = datetime.utcnow()
    db.commit()
    return {"conversation": conv.to_dict(), "messages": [_message_dict(m, uid) for m in msgs]}


@app.post("/messaging/conversations/{conversation_id}/messages", status_code=201)
async def post_message(conversation_id: int, request: Request,
                       principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.sub:
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return _err("Conversation introuvable", 404)
    if conv.tenant != _tenant(request) or not _is_participant(conv, uid):
        return _err("Accès refusé", 403)
    data = await _json(request)
    body = (data.get("body") or "").strip()
    if not body:
        return _err("Message vide", 400)
    m = Message(conversation_id=conversation_id, sender_party=uid, body=body)
    conv.updated_at = datetime.utcnow()
    db.add(m)
    other = _other_party(conv, uid)
    if other is not None:
        db.add(Notification(
            tenant=conv.tenant, user_id=other, type="message.new",
            payload={"conversation_id": conv.id}, link=f"/messagerie/{conv.id}",
        ))
    db.commit()
    return {"message": _message_dict(m, uid)}


@app.post("/messaging/conversations/{conversation_id}/read")
def mark_conversation_read(conversation_id: int, request: Request,
                           principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.sub:
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return _err("Conversation introuvable", 404)
    if conv.tenant != _tenant(request) or not _is_participant(conv, uid):
        return _err("Accès refusé", 403)
    now = datetime.utcnow()
    unread = (db.query(Message)
              .filter(Message.conversation_id == conversation_id, Message.sender_party != uid,
                      Message.read_at.is_(None)).all())
    for m in unread:
        m.read_at = now
    db.commit()
    return {"marked": len(unread)}


# ---- Notifications in-app (m3a-l3achrane) ----

@app.get("/messaging/notifications")
def list_notifications(request: Request, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    """Mes notifications, non lues d'abord (puis plus récentes d'abord dans chaque groupe)."""
    if not principal.sub or not principal.sub.isdigit():
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    tenant = _tenant(request)
    rows = (db.query(Notification)
            .filter(Notification.tenant == tenant, Notification.user_id == uid)
            .order_by(Notification.created_at.desc()).all())
    rows.sort(key=lambda n: n.read_at is not None)  # tri stable : non lues avant, ordre conservé
    return {"notifications": [n.to_dict() for n in rows]}


@app.get("/messaging/notifications/unread-count")
def notifications_unread_count(request: Request, principal: Principal = Depends(get_principal),
                               db: Session = Depends(get_db)):
    if not principal.sub or not principal.sub.isdigit():
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    tenant = _tenant(request)
    count = (db.query(Notification)
             .filter(Notification.tenant == tenant, Notification.user_id == uid,
                     Notification.read_at.is_(None)).count())
    return {"unread_count": count}


@app.post("/messaging/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, request: Request,
                           principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.sub or not principal.sub.isdigit():
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    n = db.get(Notification, notification_id)
    if n is None:
        return _err("Notification introuvable", 404)
    if n.tenant != _tenant(request) or n.user_id != uid:
        return _err("Accès refusé", 403)
    if n.read_at is None:
        n.read_at = datetime.utcnow()
        db.commit()
        db.refresh(n)
    return n.to_dict()


@app.post("/messaging/notifications/read-all")
def mark_all_notifications_read(request: Request, principal: Principal = Depends(get_principal),
                                db: Session = Depends(get_db)):
    if not principal.sub or not principal.sub.isdigit():
        return _err("Authentification requise", 401)
    uid = _uid(principal)
    tenant = _tenant(request)
    now = datetime.utcnow()
    unread = (db.query(Notification)
              .filter(Notification.tenant == tenant, Notification.user_id == uid,
                      Notification.read_at.is_(None)).all())
    for n in unread:
        n.read_at = now
    db.commit()
    return {"marked": len(unread)}


@app.post("/internal/notifications", status_code=201, include_in_schema=False)
async def internal_create_notification(request: Request, db: Session = Depends(get_db)):
    """Création interne (jeton exigé) — appelée service→service (ex. évolution future
    synchrone) ; la génération bail/paiement actuelle passe par `app.worker` (événements)."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    data = await _json(request)
    user_id = data.get("user_id")
    ntype = data.get("type")
    if not isinstance(user_id, int) or not ntype:
        return _err("Requête invalide (user_id, type requis)", 400)
    n = Notification(
        tenant=data.get("tenant") or DEFAULT_TENANT, user_id=user_id, type=ntype,
        payload=data.get("payload") or {}, link=data.get("link"),
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n.to_dict()
