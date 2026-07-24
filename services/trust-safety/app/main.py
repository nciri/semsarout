"""Service trust-safety — modération des comptes (suspension), audit et **masquage** (§6).

Reroute les routes super-admin `POST /admin/accounts/{users|agencies}/{id}/{suspend|unsuspend}`.
La mutation du compte relève du domaine identité (monolithe en transition) : trust-safety
la **délègue** au monolithe (parité exacte de la réponse), puis **possède** :
  - le journal d'audit (`admin_action`),
  - le statut de modération (`moderation_status`) → source du masquage,
  - l'émission des événements `account.suspended/unsuspended`.
Erreurs legacy `{'error': msg}`.
"""
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import AdminAction, ModerationStatus

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)
MONOLITH_URL = os.environ.get("MONOLITH_URL", "http://localhost:7000")


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


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


def _apply_moderation(db: Session, entity_type: str, entity_id: int, *, suspended: bool, reason=None) -> None:
    row = db.get(ModerationStatus, {"entity_type": entity_type, "entity_id": entity_id})
    if row is None:
        row = ModerationStatus(entity_type=entity_type, entity_id=entity_id)
        db.add(row)
    row.is_suspended = suspended
    if reason is not None:
        row.reason = reason


async def _moderate(entity_type: str, entity_id: int, action: str, request: Request,
                    principal: Principal, db: Session) -> JSONResponse:
    """Délègue la mutation au monolithe (parité), puis audit + statut + événement sur succès."""
    body = await request.body()
    plural = "users" if entity_type == "user" else "agencies"
    url = f"{MONOLITH_URL}/api/v1/admin/accounts/{plural}/{entity_id}/{action}"
    fwd = {"content-type": "application/json"}
    auth = request.headers.get("authorization")
    if auth:
        fwd["authorization"] = auth
    try:
        resp = httpx.post(url, content=body, headers=fwd, timeout=10.0)
    except httpx.HTTPError:
        return _err("Service de modération indisponible", 502)

    if 200 <= resp.status_code < 300:
        reason = None
        try:
            reason = (await _safe_json(body)).get("reason")
        except Exception:  # noqa: BLE001
            pass
        suspended = action == "suspend"
        _apply_moderation(db, entity_type, entity_id, suspended=suspended, reason=reason)
        actor = int(principal.sub) if principal.sub and principal.sub.isdigit() else None
        db.add(AdminAction(actor_id=actor, action=action, entity_type=entity_type,
                           entity_id=entity_id, details={"reason": reason}))
        evt = events.ACCOUNT_SUSPENDED if suspended else events.ACCOUNT_UNSUSPENDED
        enqueue(db, entity_type, entity_id, evt,
                {"entity_type": entity_type, "entity_id": entity_id, "reason": reason})
        db.commit()

    return JSONResponse(_json_or_text(resp), status_code=resp.status_code)


async def _safe_json(raw: bytes) -> dict:
    import json
    if not raw:
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _json_or_text(resp: httpx.Response):
    try:
        return resp.json()
    except Exception:  # noqa: BLE001
        return {"error": resp.text}


@app.post("/admin/accounts/users/{user_id}/suspend")
async def suspend_user(user_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("user", user_id, "suspend", request, principal, db)


@app.post("/admin/accounts/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("user", user_id, "unsuspend", request, principal, db)


@app.post("/admin/accounts/agencies/{agency_id}/suspend")
async def suspend_agency(agency_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("agency", agency_id, "suspend", request, principal, db)


@app.post("/admin/accounts/agencies/{agency_id}/unsuspend")
async def unsuspend_agency(agency_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("agency", agency_id, "unsuspend", request, principal, db)


# ---- Masquage (§6) : source des comptes cachés, pour listing/search/geo/crm ----
def _hidden(db: Session) -> dict:
    rows = db.query(ModerationStatus).filter(
        (ModerationStatus.is_suspended.is_(True)) | (ModerationStatus.is_deleted.is_(True))).all()
    return {
        "user_ids": [r.entity_id for r in rows if r.entity_type == "user"],
        "agency_ids": [r.entity_id for r in rows if r.entity_type == "agency"],
    }


@app.get("/moderation/hidden")
def moderation_hidden(db: Session = Depends(get_db)) -> dict:
    return _hidden(db)


@app.get("/internal/moderation/hidden")
def internal_moderation_hidden(request: Request, db: Session = Depends(get_db)):
    """Drop-in du endpoint interne du monolithe (même chemin/forme) pour repointer le masquage."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    return _hidden(db)
