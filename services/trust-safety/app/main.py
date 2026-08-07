"""Service trust-safety — modération des comptes (suspension), audit et **masquage** (§6).

Façade super-admin des routes `/admin/accounts/{users|agencies}/{id}/{suspend|unsuspend}`,
`DELETE`, `/restore`, `/anonymize`. La mutation du compte est **déléguée au service
propriétaire** de l'entité (users→identity, agencies→agency) via jeton interne — plus le
monolithe. trust-safety **possède** :
  - le journal d'audit (`admin_action`),
  - le statut de modération (`moderation_status`) → source du masquage (§6),
  - l'émission des événements `account.suspended/unsuspended`.
Le service propriétaire porte les gardes métier (auto-action, dernier super-admin, déjà-fait)
et renvoie la réponse legacy (`user`/`agency` `to_dict`), relayée telle quelle. Erreurs `{'error': msg}`.
"""
import os
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import REPORT_STATUSES, AdminAction, ModerationStatus, Report
from .schemas import ReportCreateIn

DEFAULT_TENANT = "m3a-l3achrane"

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)
# Les comptes appartiennent désormais à v2 : la mutation (users→identity, agencies→agency) est
# déléguée au service **propriétaire** de l'entité (plus au monolithe). trust-safety reste la
# façade super-admin : gardes, audit, masquage (§6) et événements `account.*`.
IDENTITY_URL = os.environ.get("IDENTITY_URL", "http://localhost:8501")
AGENCY_URL = os.environ.get("AGENCY_URL", "http://localhost:8512")

# Effet de chaque action sur le masquage (§6) : compte caché si suspendu OU supprimé.
_MASK = {
    "suspend": {"is_suspended": True},
    "unsuspend": {"is_suspended": False},
    "delete": {"is_suspended": True, "is_deleted": True},
    "restore": {"is_suspended": False, "is_deleted": False},
    "anonymize": {"is_suspended": True, "is_deleted": True},
}


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


def _apply_moderation(db: Session, entity_type: str, entity_id: int, mask: dict, reason=None) -> None:
    row = db.get(ModerationStatus, {"entity_type": entity_type, "entity_id": entity_id})
    if row is None:
        row = ModerationStatus(entity_type=entity_type, entity_id=entity_id)
        db.add(row)
    if "is_suspended" in mask:
        row.is_suspended = mask["is_suspended"]
    if "is_deleted" in mask:
        row.is_deleted = mask["is_deleted"]
    if reason is not None:
        row.reason = reason


async def _moderate(entity_type: str, entity_id: int, action: str, request: Request,
                    principal: Principal, db: Session) -> JSONResponse:
    """Délègue la mutation au service propriétaire (identity/agency), puis audit + statut de
    masquage + événement sur succès. La façade fait toujours la garde super-admin locale."""
    if not principal.is_superadmin:
        return _err("Super-admin access required", 403)
    reason = (await _safe_json(await request.body())).get("reason")
    actor = int(principal.sub) if principal.sub and principal.sub.isdigit() else None
    plural = "users" if entity_type == "user" else "agencies"
    base = IDENTITY_URL if entity_type == "user" else AGENCY_URL
    url = f"{base}/internal/accounts/{plural}/{entity_id}/{action}"
    params = {"actor_id": actor} if actor is not None else {}
    if reason is not None:
        params["reason"] = reason
    try:
        resp = httpx.post(url, params=params,
                          headers={"x-internal-token": settings.internal_token}, timeout=10.0)
    except httpx.HTTPError:
        return _err("Service de modération indisponible", 502)

    if 200 <= resp.status_code < 300:
        mask = _MASK[action]
        _apply_moderation(db, entity_type, entity_id, mask, reason=reason)
        db.add(AdminAction(actor_id=actor, action=action, entity_type=entity_type,
                           entity_id=entity_id, details={"reason": reason}))
        hidden = mask.get("is_suspended") or mask.get("is_deleted")
        evt = events.ACCOUNT_SUSPENDED if hidden else events.ACCOUNT_UNSUSPENDED
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


@app.delete("/admin/accounts/users/{user_id}")
async def delete_user(user_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("user", user_id, "delete", request, principal, db)


@app.post("/admin/accounts/users/{user_id}/restore")
async def restore_user(user_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("user", user_id, "restore", request, principal, db)


@app.post("/admin/accounts/users/{user_id}/anonymize")
async def anonymize_user(user_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("user", user_id, "anonymize", request, principal, db)


@app.delete("/admin/accounts/agencies/{agency_id}")
async def delete_agency(agency_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("agency", agency_id, "delete", request, principal, db)


@app.post("/admin/accounts/agencies/{agency_id}/restore")
async def restore_agency(agency_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("agency", agency_id, "restore", request, principal, db)


@app.post("/admin/accounts/agencies/{agency_id}/anonymize")
async def anonymize_agency(agency_id: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return await _moderate("agency", agency_id, "anonymize", request, principal, db)


# ---- Masquage (§6) : source des comptes cachés, pour listing/search/geo/crm ----
def _hidden(db: Session) -> dict:
    rows = db.query(ModerationStatus).filter(
        (ModerationStatus.is_suspended.is_(True)) | (ModerationStatus.is_deleted.is_(True))).all()
    return {
        "user_ids": [r.entity_id for r in rows if r.entity_type == "user"],
        "agency_ids": [r.entity_id for r in rows if r.entity_type == "agency"],
    }


@app.get("/internal/moderation/hidden")
def internal_moderation_hidden(request: Request, db: Session = Depends(get_db)):
    """Comptes masqués (source du masquage §6). Drop-in du endpoint interne du monolithe :
    les services (listing/search/geo/crm) repointent leur masquage ici. **Jeton interne exigé**
    — la liste des comptes suspendus/supprimés est une donnée sensible, jamais publique."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    return _hidden(db)


# ---- Signalements (reports) : file de modération m3a-l3achrane ----
def _tenant(request: Request) -> str:
    return request.headers.get("x-semsar-tenant") or DEFAULT_TENANT


@app.post("/reports", status_code=201)
def create_report(body: ReportCreateIn, request: Request,
                  principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Créer un signalement (tout utilisateur authentifié) — `reporter_id` + `tenant` injectés
    depuis l'identité BFF, jamais fournis par le client."""
    if not principal.sub or not principal.sub.isdigit():
        return _err("Authentification requise", 401)
    report = Report(
        tenant=_tenant(request), reporter_id=int(principal.sub),
        target_type=body.target_type, target_id=body.target_id,
        reason=body.reason, description=body.description,
    )
    db.add(report)
    db.flush()
    enqueue(db, "report", report.id, events.REPORT_CREATED, report.to_dict())
    db.commit()
    db.refresh(report)
    return report.to_dict()


@app.get("/internal/reports", include_in_schema=False)
def internal_reports(tenant: str | None = None, status: str | None = None,
                     x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Liste des signalements pour la file back-office (super-admin, via BFF) — parité
    `/internal/listings/queue`, `/internal/kyc/queue`."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    query = db.query(Report)
    if tenant:
        query = query.filter(Report.tenant == tenant)
    if status:
        if status not in REPORT_STATUSES:
            return _err("Statut inconnu", 400)
        query = query.filter(Report.status == status)
    rows = query.order_by(Report.created_at.desc()).all()
    return {"items": [r.to_dict() for r in rows]}


def _close_report(db: Session, report_id: int, principal: Principal, status: str):
    if not principal.is_superadmin:
        return None, _err("Super-admin access required", 403)
    report = db.get(Report, report_id)
    if report is None:
        return None, _err("Signalement introuvable", 404)
    if report.status != "open":
        return None, _err("Signalement déjà traité", 409)
    report.status = status
    report.resolved_at = datetime.utcnow()
    report.resolver_id = int(principal.sub) if principal.sub and principal.sub.isdigit() else None
    return report, None


@app.post("/admin/reports/{report_id}/resolve")
def resolve_report(report_id: int, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    report, err = _close_report(db, report_id, principal, "resolved")
    if err is not None:
        return err
    enqueue(db, "report", report.id, events.REPORT_RESOLVED, report.to_dict())
    db.commit()
    db.refresh(report)
    return report.to_dict()


@app.post("/admin/reports/{report_id}/dismiss")
def dismiss_report(report_id: int, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)):
    report, err = _close_report(db, report_id, principal, "dismissed")
    if err is not None:
        return err
    enqueue(db, "report", report.id, events.REPORT_DISMISSED, report.to_dict())
    db.commit()
    db.refresh(report)
    return report.to_dict()
