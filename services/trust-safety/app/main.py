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
from datetime import datetime, timedelta

import httpx
from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import audit, events
from .db import get_db, init_db
from .models import (LEVEL_ORDER, REPORT_STATUSES, REVIEW_BLIND_DAYS, REVIEW_CRITERIA,
                     AdminAction, ModerationStatus, Report, Review, TrustLevel, UserBlock)
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


def upsert_trust_level(db: Session, entity_type: str, entity_id: int, *,
                       min_level: str | None = None, force_level: str | None = None,
                       increment_deals: bool = False) -> TrustLevel:
    """Palier binaire par critère : `min_level` ne fait jamais redescendre, `force_level`
    (suspension/fraude confirmée) est prioritaire et immédiat. `increment_deals` promeut
    `verified` → `verified_experience` sans jamais faire monter un compte encore `none`."""
    row = db.get(TrustLevel, {"entity_type": entity_type, "entity_id": entity_id})
    if row is None:
        row = TrustLevel(entity_type=entity_type, entity_id=entity_id, level="none", deal_count=0)
        db.add(row)
        db.flush()
    if increment_deals:
        row.deal_count += 1
        if row.level == "verified":
            row.level = "verified_experience"
    if min_level is not None and LEVEL_ORDER[min_level] > LEVEL_ORDER[row.level]:
        row.level = min_level
    if force_level is not None:
        row.level = force_level
    return row


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
        if hidden:
            upsert_trust_level(db, entity_type, entity_id, force_level="none")
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
    audit.emit(db, actor_id=_me(principal), action="report_resolved", entity_type="report",
               entity_id=report.id, extra_data={"reason": report.reason})
    if report.reason == "fraud" and report.target_type in ("agency", "profile", "user") \
            and report.target_id.isdigit():
        entity_type = "agency" if report.target_type == "agency" else "user"
        upsert_trust_level(db, entity_type, int(report.target_id), force_level="none")
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
    audit.emit(db, actor_id=_me(principal), action="report_dismissed", entity_type="report",
               entity_id=report.id, extra_data={"reason": report.reason})
    db.commit()
    db.refresh(report)
    return report.to_dict()


# ---- Score de confiance (trust_level) : lecture publique + batch interne ----
@app.get("/trust/{entity_type}/{entity_id}")
def get_trust(entity_type: str, entity_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.get(TrustLevel, {"entity_type": entity_type, "entity_id": entity_id})
    return row.to_dict() if row is not None else {"level": "none", "deal_count": 0}


@app.get("/internal/trust/batch", include_in_schema=False)
def internal_trust_batch(entity_type: str, ids: str, x_internal_token: str = Header(default=""),
                         db: Session = Depends(get_db)) -> dict:
    """Lecture batchée (évite le N+1) — consommée par `agency` pour enrichir ses listes."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
    rows = db.query(TrustLevel).filter(
        TrustLevel.entity_type == entity_type, TrustLevel.entity_id.in_(id_list)).all()
    by_id = {r.entity_id: r.to_dict() for r in rows}
    return {"items": {str(i): by_id.get(i, {"level": "none", "deal_count": 0}) for i in id_list}}


# ---- Blocages entre utilisateurs ----
# Portés ici parce que la modération est déjà le domaine de ce service, et que `messaging`
# doit pouvoir les consulter avant d'ouvrir une conversation.
def _me(principal: Principal):
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


@app.get("/blocks")
def list_blocks(request: Request, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    me = _me(principal)
    if me is None:
        return _err("Authentification requise", 401)
    rows = (db.query(UserBlock)
            .filter(UserBlock.tenant == _tenant(request), UserBlock.blocker_id == me)
            .order_by(UserBlock.created_at.desc()).all())
    return {"blocks": [b.to_dict() for b in rows]}


@app.post("/blocks", status_code=201)
async def create_block(request: Request, response: Response,
                       principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    me = _me(principal)
    if me is None:
        return _err("Authentification requise", 401)
    body = await request.json()
    try:
        blocked_id = int(body.get("blocked_id"))
    except (TypeError, ValueError):
        return _err("blocked_id invalide", 400)
    if blocked_id == me:
        return _err("On ne peut pas se bloquer soi-même", 400)

    tenant = _tenant(request)
    existing = db.query(UserBlock).filter(
        UserBlock.tenant == tenant, UserBlock.blocker_id == me,
        UserBlock.blocked_id == blocked_id).first()
    if existing is not None:      # rejouable : bloquer deux fois n'est pas une erreur
        response.status_code = 200
        return existing.to_dict()

    block = UserBlock(tenant=tenant, blocker_id=me, blocked_id=blocked_id)
    db.add(block)
    db.commit()
    db.refresh(block)
    return block.to_dict()


@app.delete("/blocks/{blocked_id}")
def delete_block(blocked_id: int, request: Request,
                 principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    me = _me(principal)
    if me is None:
        return _err("Authentification requise", 401)
    db.query(UserBlock).filter(
        UserBlock.tenant == _tenant(request), UserBlock.blocker_id == me,
        UserBlock.blocked_id == blocked_id).delete()
    db.commit()
    return {"blocked_id": blocked_id, "blocked": False}


@app.get("/internal/blocks", include_in_schema=False)
def internal_blocks(a: int, b: int, x_internal_token: str = Header(default=""),
                    tenant: str | None = None, db: Session = Depends(get_db)) -> dict:
    """Y a-t-il un blocage entre ces deux comptes, dans un sens ou dans l'autre ? Consommé par
    `messaging` avant d'ouvrir une conversation — sans quoi « bloquer » n'aurait aucun effet."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    q = db.query(UserBlock).filter(
        ((UserBlock.blocker_id == a) & (UserBlock.blocked_id == b))
        | ((UserBlock.blocker_id == b) & (UserBlock.blocked_id == a)))
    if tenant:
        q = q.filter(UserBlock.tenant == tenant)
    return {"blocked": q.first() is not None}


# ---- Avis après séjour ----
def _clean_criteria(raw):
    """Chaque critère attendu, noté de 1 à 5. Renvoie (critères, message d'erreur)."""
    if not isinstance(raw, dict):
        return None, "Notes attendues"
    out = {}
    for key in REVIEW_CRITERIA:
        value = raw.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 5:
            return None, f"Note invalide pour « {key} » (1 à 5)"
        out[key] = value
    return out, None


def _visible(review: Review, counterpart: Review | None, now: datetime) -> bool:
    """Double aveugle : visible quand l'autre partie a rendu son avis, ou passé le délai."""
    if counterpart is not None:
        return True
    return review.created_at is not None and \
        review.created_at + timedelta(days=REVIEW_BLIND_DAYS) <= now


@app.post("/reviews", status_code=201)
async def create_review(request: Request, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    me = _me(principal)
    if me is None:
        return _err("Authentification requise", 401)
    body = await request.json()
    lease_id = str(body.get("lease_id") or "").strip()
    try:
        subject_id = int(body.get("subject_id"))
    except (TypeError, ValueError):
        return _err("subject_id invalide", 400)
    if not lease_id:
        return _err("lease_id requis", 400)
    if subject_id == me:
        return _err("On ne s'évalue pas soi-même", 400)
    criteria, msg = _clean_criteria(body.get("criteria"))
    if msg:
        return _err(msg, 400)

    tenant = _tenant(request)
    if db.query(Review).filter(Review.tenant == tenant, Review.lease_id == lease_id,
                               Review.author_id == me).first() is not None:
        return _err("Avis déjà déposé pour ce séjour", 409)

    review = Review(tenant=tenant, lease_id=lease_id, author_id=me, subject_id=subject_id,
                    criteria=criteria, comment=(body.get("comment") or None))
    db.add(review)
    db.commit()
    db.refresh(review)
    return review.to_dict()


@app.get("/reviews/received")
def list_received_reviews(request: Request, principal: Principal = Depends(get_principal),
                          db: Session = Depends(get_db)):
    me = _me(principal)
    if me is None:
        return _err("Authentification requise", 401)
    tenant = _tenant(request)
    now = datetime.utcnow()
    mine = db.query(Review).filter(Review.tenant == tenant, Review.subject_id == me).all()
    written = {r.lease_id for r in db.query(Review).filter(
        Review.tenant == tenant, Review.author_id == me).all()}
    visible = [r for r in mine if _visible(r, r if r.lease_id in written else None, now)]
    visible.sort(key=lambda r: r.created_at or now, reverse=True)
    return {"reviews": [r.to_dict() for r in visible]}


@app.get("/reviews/written")
def list_written_reviews(request: Request, principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    """Séjours que l'utilisateur a déjà évalués — le front en déduit ceux qu'il lui reste."""
    me = _me(principal)
    if me is None:
        return _err("Authentification requise", 401)
    rows = db.query(Review).filter(Review.tenant == _tenant(request),
                                   Review.author_id == me).all()
    return {"lease_ids": [r.lease_id for r in rows]}
