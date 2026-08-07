"""Service coloc-profile — profils chercheurs M3a-L3achrane.

Port du service profile du dépôt initial, conventions mesh. Le profil est créé
par le consumer user.* (worker) à l'inscription ; GET /me/profile le crée aussi
à la volée (ensure) pour les comptes antérieurs au consumer. Les deux PUT
émettent coloc.profile_updated (projection matching) — événement créé au port,
l'original n'émettait rien. PII jamais dans les événements.
"""
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_common.coloc_referential import IMPORTANCE_LEVELS, LIFESTYLE_QUESTIONS
from semsar_events import enqueue

from .db import get_db, init_db
from .models import GENDERS, Favorite, LifestyleAnswer, Profile
from .schemas import FavoriteIn, LifestyleAnswersIn, ProfileIn

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

TENANT = "m3a-l3achrane"
PROFILE_UPDATED = "coloc.profile_updated"


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


class _TenantForbidden(Exception):
    pass


def _require_tenant(request: Request) -> None:
    if request.headers.get("x-semsar-tenant", "semsar") != TENANT:
        raise _TenantForbidden()


@app.exception_handler(_TenantForbidden)
async def _tenant_handler(request: Request, exc: _TenantForbidden) -> JSONResponse:
    return _err("Tenant interdit", 403)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/internal/stats", include_in_schema=False)
def internal_stats(tenant: str | None = None, x_internal_token: str = Header(default=""),
                   db: Session = Depends(get_db)) -> dict:
    """Compteurs profils (super-admin overview m3a) — agrégés par le BFF. coloc-profile
    n'a PAS de colonne tenant (service mono-tenant m3a-l3achrane) : `tenant` n'est accepté
    que pour uniformité de contrat avec identity et est ignoré s'il diffère de m3a-l3achrane
    (dans ce cas, compteurs à zéro plutôt qu'un mélange trompeur)."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    if tenant and tenant != TENANT:
        return {"total_profiles": 0, "verified_profiles": 0, "profiles_with_lifestyle": 0}
    with_lifestyle = (
        db.query(Profile.id).join(LifestyleAnswer, LifestyleAnswer.profile_id == Profile.id)
        .distinct().count()
    )
    return {
        "total_profiles": db.query(Profile).count(),
        "verified_profiles": db.query(Profile).filter(Profile.is_verified.is_(True)).count(),
        "profiles_with_lifestyle": with_lifestyle,
    }


router = APIRouter(dependencies=[Depends(_require_tenant)])


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


def ensure_profile(db: Session, user_id: int) -> Profile:
    """Crée le profil vide s'il n'existe pas (idempotent) — utilisé par les routes et le worker."""
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if profile is None:
        profile = Profile(user_id=user_id)
        db.add(profile)
        db.flush()
    return profile


def _profile_event_doc(profile: Profile) -> dict:
    """Payload coloc.profile_updated — critères de compatibilité SEULEMENT (pas de PII)."""
    lifestyle = {a.question_code: a.value for a in profile.lifestyle_answers}
    importance = {a.question_code: a.importance for a in profile.lifestyle_answers}
    complete = bool(profile.gender and profile.budget_max is not None and profile.city)
    return {
        "user_id": profile.user_id, "gender": profile.gender,
        "budget_min": float(profile.budget_min) if profile.budget_min is not None else None,
        "budget_max": float(profile.budget_max) if profile.budget_max is not None else None,
        "city": profile.city, "lifestyle": lifestyle, "importance": importance,
        "complete": complete,
    }


def _emit_updated(db: Session, profile: Profile) -> None:
    enqueue(db, "coloc_profile", profile.user_id, PROFILE_UPDATED, _profile_event_doc(profile))


@router.get("/me/profile")
def get_profile(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    profile = ensure_profile(db, uid)
    db.commit()
    return profile.to_dict()


@router.put("/me/profile")
def put_profile(body: ProfileIn, principal: Principal = Depends(get_principal),
                db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    data = body.model_dump(exclude_unset=True)
    if "gender" in data and data["gender"] is not None and data["gender"] not in GENDERS:
        return _err(f"Genre invalide : {data['gender']}", 400)
    profile = ensure_profile(db, uid)
    merged_min = data.get("budget_min", profile.budget_min)
    merged_max = data.get("budget_max", profile.budget_max)
    if merged_min is not None and merged_max is not None and merged_min > merged_max:
        return _err("budget_min supérieur à budget_max", 400)
    for field, value in data.items():
        setattr(profile, field, value)
    _emit_updated(db, profile)
    db.commit()
    db.refresh(profile)
    return profile.to_dict()


@router.put("/me/lifestyle")
def put_lifestyle(body: LifestyleAnswersIn, principal: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    for a in body.answers:
        allowed = LIFESTYLE_QUESTIONS.get(a.question_code)
        if allowed is None or a.value not in allowed:
            return _err(f"Réponse hors référentiel : {a.question_code}={a.value}", 400)
        if a.importance not in IMPORTANCE_LEVELS:
            return _err(f"Importance invalide : {a.importance}", 400)
    profile = ensure_profile(db, uid)
    db.query(LifestyleAnswer).filter(LifestyleAnswer.profile_id == profile.id).delete()
    db.flush()
    for a in body.answers:
        db.add(LifestyleAnswer(profile_id=profile.id, question_code=a.question_code,
                               value=a.value, importance=a.importance))
    db.flush()
    db.refresh(profile)
    _emit_updated(db, profile)
    db.commit()
    db.refresh(profile)
    return profile.to_dict()["lifestyle"]


@router.get("/me/favorites")
def list_favorites(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    rows = db.query(Favorite).filter(Favorite.user_id == uid).order_by(
        Favorite.created_at.desc()).all()
    return [{"listing_id": f.listing_id, "created_at": f.created_at.isoformat()} for f in rows]


@router.post("/me/favorites", status_code=204)
def add_favorite(body: FavoriteIn, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    exists = db.query(Favorite).filter(Favorite.user_id == uid,
                                       Favorite.listing_id == body.listing_id).first()
    if exists is None:  # idempotent
        db.add(Favorite(user_id=uid, listing_id=body.listing_id))
        db.commit()
    return Response(status_code=204)


@router.delete("/me/favorites/{listing_id}", status_code=204)
def remove_favorite(listing_id: str, principal: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    db.query(Favorite).filter(Favorite.user_id == uid,
                              Favorite.listing_id == listing_id).delete()
    db.commit()
    return Response(status_code=204)


app.include_router(router)
