"""Service agency — domaine agence (lecture). Reroute les routes existantes du monolithe :
`GET /agencies`, `GET /agencies/{slug}`, `GET /my-agency`. Erreurs legacy `{'error': msg}`.
`properties_count` vient d'une projection locale `listing_ro` (événements `listing.*`).
Les écritures (create/update/regenerate-api-key) restent au monolithe pour l'instant.
"""
import secrets
from contextlib import asynccontextmanager
from datetime import datetime

from slugify import slugify
from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import (
    get_settings,
    install_legacy_error_handlers,
    sanitize_rich_field,
    setup_logging,
    setup_tracing,
)
from semsar_events import enqueue

from . import events, integrations, listing_client, members_client, trust_client
from .db import get_db, init_db
from .models import Agency, IntegrationConnection, ListingRO

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


def _iso(value) -> str | None:
    return value.isoformat() if value else None


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


def _gen_slug(db: Session, name: str) -> str:
    base = slugify(name); slug = base; c = 1
    while db.query(Agency).filter(Agency.slug == slug).first():
        slug = f"{base}-{c}"; c += 1
    return slug


def _gen_api_key() -> str:
    return f"sk_{secrets.token_urlsafe(32)}"


_AGENCY_WRITABLE = ["name", "description", "email", "phone", "website", "address", "city",
                    "postal_code", "license_number", "rc_number", "ice_number"]
# Champ saisi en WYSIWYG : il est affiché sur la fiche publique de l'agence, donc un XSS
# stocké pour n'importe quel visiteur tant qu'il n'est pas assaini. Les autres entrées de la
# liste restent du texte brut — les assainir échapperait « < » et « & » d'un nom ou d'une
# adresse et ferait apparaître des entités à l'écran.
_RICH = ("description",)


def _rich(field: str, value):
    return sanitize_rich_field(value) if field in _RICH else value


def _counts(db: Session, agency_ids: list[int]) -> dict[int, int]:
    if not agency_ids:
        return {}
    rows = (db.query(ListingRO.agency_id, func.count())
            .filter(ListingRO.agency_id.in_(agency_ids))
            .group_by(ListingRO.agency_id).all())
    return dict(rows)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/internal/agency/{agency_id}/phone", include_in_schema=False)
def internal_agency_phone(agency_id: int, request: Request, db: Session = Depends(get_db)):
    """Téléphone d'une agence — pour reveal-phone côté listing (v2-native, remplace le monolithe)."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    a = db.get(Agency, agency_id)
    return {"phone": a.phone if a else None}


# ---- Modération de compte agence (super-admin) — déléguée par trust-safety (jeton interne) ----
# agency possède l'entité agence (modèle complet + `to_dict`). identity consomme les événements
# `agency.*` pour resynchroniser `agency_ro` (blocage login). Parité EXACTE des réponses du
# monolithe (`/admin/accounts/agencies/*`) : mêmes messages, mêmes codes, `Agency.to_dict()`.
def _agency_msg(db: Session, message: str, a: Agency, code: int = 200) -> JSONResponse:
    cnt = _counts(db, [a.id]).get(a.id, 0)
    return JSONResponse({"message": message, "agency": a.to_dict(properties_count=cnt)}, status_code=code)


def _emit_agency(db: Session, a: Agency, event_type: str) -> None:
    enqueue(db, "agency", a.id, event_type, {
        "id": a.id, "name": a.name,
        "is_suspended": bool(a.is_suspended), "is_deleted": a.deleted_at is not None,
        "suspended_reason": a.suspended_reason,
    })


def _mod_resolve(agency_id: int, token: str, db: Session):
    if token != settings.internal_token:
        return None, _err("Forbidden", 403)
    a = db.get(Agency, agency_id)
    if a is None:
        return None, _err("Agency not found", 404)
    return a, None


@app.post("/internal/accounts/agencies/{agency_id}/suspend", include_in_schema=False)
def mod_suspend(agency_id: int, reason: str | None = None, actor_id: int | None = None,
                x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    a.is_suspended = True
    a.suspended_at = datetime.utcnow()
    a.suspended_reason = reason
    _emit_agency(db, a, events.AGENCY_SUSPENDED)
    db.commit()
    return _agency_msg(db, "Agence suspendue", a)


@app.post("/internal/accounts/agencies/{agency_id}/unsuspend", include_in_schema=False)
def mod_unsuspend(agency_id: int, reason: str | None = None, actor_id: int | None = None,
                  x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    a.is_suspended = False
    a.suspended_at = None
    a.suspended_reason = None
    _emit_agency(db, a, events.AGENCY_UNSUSPENDED)
    db.commit()
    return _agency_msg(db, "Agence réactivée", a)


@app.post("/internal/accounts/agencies/{agency_id}/delete", include_in_schema=False)
def mod_delete(agency_id: int, reason: str | None = None, actor_id: int | None = None,
               x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    a.deleted_at = datetime.utcnow()
    a.is_suspended = True
    _emit_agency(db, a, events.AGENCY_DELETED)
    db.commit()
    return _agency_msg(db, "Agence supprimée", a)


@app.post("/internal/accounts/agencies/{agency_id}/restore", include_in_schema=False)
def mod_restore(agency_id: int, reason: str | None = None, actor_id: int | None = None,
                x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    a.deleted_at = None
    a.is_suspended = False
    a.suspended_at = None
    a.suspended_reason = None
    _emit_agency(db, a, events.AGENCY_RESTORED)
    db.commit()
    return _agency_msg(db, "Agence restaurée", a)


@app.post("/internal/accounts/agencies/{agency_id}/anonymize", include_in_schema=False)
def mod_anonymize(agency_id: int, reason: str | None = None, actor_id: int | None = None,
                  x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    a, err = _mod_resolve(agency_id, x_internal_token, db)
    if err:
        return err
    if a.anonymized_at is not None:
        return _agency_msg(db, "Agence déjà anonymisée", a)
    a.name = "Agence supprimée"
    a.slug = f"agence-supprimee-{a.id}"
    a.description = None
    a.email = f"deleted+agency{a.id}@semsar.invalid"
    a.phone = None
    a.website = None
    a.address = None
    a.postal_code = None
    a.logo_url = None
    a.cover_image_url = None
    a.license_number = None
    a.rc_number = None
    a.ice_number = None
    a.api_key = None
    if a.deleted_at is None:
        a.deleted_at = datetime.utcnow()
    a.is_suspended = True
    a.anonymized_at = datetime.utcnow()
    _emit_agency(db, a, events.AGENCY_ANONYMIZED)
    db.commit()
    return _agency_msg(db, "Agence anonymisée", a)


def _mod_state(a: Agency) -> str:
    return "deleted" if a.deleted_at else ("suspended" if a.is_suspended else "active")


@app.get("/internal/agencies", include_in_schema=False)
def internal_agencies(request: Request, owner_id: int | None = None, db: Session = Depends(get_db)):
    """Dump léger de toutes les agences (super-admin `/admin/accounts`) — agrégé par analytics.
    `owner_id` filtre sur les agences possédées par cet utilisateur (consommé par
    trust-safety/app/worker.py pour propager le KYC owner → agences)."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    q = db.query(Agency)
    if owner_id is not None:
        q = q.filter(Agency.owner_id == owner_id)
    rows = q.all()
    return {"agencies": [{"id": a.id, "name": a.name, "email": a.email,
                          "status": _mod_state(a), "owner_id": a.owner_id} for a in rows]}


@app.get("/internal/agency/{agency_id}", include_in_schema=False)
def internal_agency_detail(agency_id: int, request: Request, db: Session = Depends(get_db)):
    """Détail d'une agence (`to_dict` complet) — pour `/admin/accounts/agencies/{id}`."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    a = db.get(Agency, agency_id)
    if a is None:
        return {"agency": None}
    cnt = _counts(db, [a.id]).get(a.id, 0)
    return {"agency": a.to_dict(properties_count=cnt)}


@app.get("/internal/agencies/stats", include_in_schema=False)
def internal_agencies_stats(request: Request, db: Session = Depends(get_db)):
    """Compteurs agences plateforme (super-admin overview) — agrégés par analytics."""
    if request.headers.get("x-internal-token") != settings.internal_token:
        return _err("Forbidden", 403)
    return {
        "total_agencies": db.query(Agency).filter(Agency.deleted_at.is_(None)).count(),
        "suspended_agencies": db.query(Agency).filter(Agency.is_suspended.is_(True)).count(),
        "deleted_pending_agencies": db.query(Agency).filter(
            Agency.deleted_at.isnot(None), Agency.anonymized_at.is_(None)).count(),
    }


# ---- Paramètres backoffice de l'agence (nouveau : jamais servi par le monolithe) ----
# Blob de config par agence (commission, notifications, SMTP…). Les champs `agency_*` sont
# pré-remplis depuis le profil de l'agence. `smtp_password` est **write-only** (jamais renvoyé).
_SETTINGS_DEFAULTS = {
    # Deux barèmes, deux natures : la vente est au FORFAIT (l'argument de la plateforme —
    # l'agence annonce un tarif, pas un pourcentage du prix) ; la location reste un
    # pourcentage du loyer MENSUEL. 0 = tarif non encore fixé par l'agence.
    "default_sale_commission_fee": 0, "default_rental_commission_rate": 50,
    "currency": "MAD", "timezone": "Africa/Casablanca",
    "email_notifications": True, "sms_notifications": False, "lead_auto_assign": False,
    "visit_reminder_hours": 24, "smtp_host": "", "smtp_port": "", "smtp_user": "",
}


# Le profil de l'agence appartient aux colonnes de la table, pas au blob de réglages :
# il s'édite sur « Mon agence » et s'affiche publiquement. Un double stockage faisait
# diverger les deux écrans — le blob masquait le nom réel de l'agence.
_PROFILE_KEYS = ("agency_name", "agency_email", "agency_phone", "agency_address",
                 "agency_city", "agency_website", "agency_description")


def _settings_view(a: Agency) -> dict:
    """Vue fusionnée : défauts + blob stocké, puis le profil agence, qui a toujours raison."""
    view = dict(_SETTINGS_DEFAULTS)
    stored = dict(a.settings or {})
    stored.pop("smtp_password", None)  # ne jamais renvoyer le secret
    view.update(stored)
    view.update({
        "agency_name": a.name, "agency_email": a.email, "agency_phone": a.phone,
        "agency_address": a.address, "agency_city": a.city, "agency_website": a.website,
        "agency_description": a.description,
    })
    return view


@app.get("/backoffice/settings")
def get_settings(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if principal.agency_id is None:
        return {}
    a = db.get(Agency, principal.agency_id)
    return _settings_view(a) if a is not None else {}


@app.put("/backoffice/settings")
async def put_settings(request: Request, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    if principal.agency_id is None:
        return _err("You do not belong to an agency", 404)
    a = db.get(Agency, principal.agency_id)
    if a is None:
        return _err("You do not belong to an agency", 404)
    data = await _json(request)
    stored = dict(a.settings or {})
    # smtp_password write-only : ne remplacer que si une nouvelle valeur non vide est fournie.
    new_pw = data.pop("smtp_password", None)
    for key in _PROFILE_KEYS:          # le profil se modifie par PUT /agencies/{slug}
        data.pop(key, None)
        stored.pop(key, None)          # purge des valeurs écrites par l'ancien écran
    stored.update(data)
    if new_pw:
        stored["smtp_password"] = new_pw
    a.settings = stored
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(a, "settings")  # JSON muté en place → forcer le UPDATE
    db.commit()
    return _settings_view(a)


# ---- Connecteurs ERP/CRM de l'agence ---------------------------------------------------

def _connection_view(provider: str, conn: IntegrationConnection | None) -> dict:
    spec = integrations.PROVIDERS[provider]
    view = {"provider": provider, "kind": spec["kind"], "fields": list(spec["fields"]),
            "secret_fields": list(spec["secret_fields"]),
            "supports_contact_sync": spec["push"] is not None,
            "status": "not_connected", "account_label": None, "last_error": None,
            "last_test_at": None, "last_sync_at": None, "synced_count": 0}
    if conn is not None:
        view.update({"status": conn.status, "account_label": conn.account_label,
                     "last_error": conn.last_error, "last_test_at": _iso(conn.last_test_at),
                     "last_sync_at": _iso(conn.last_sync_at),
                     "synced_count": conn.synced_count or 0})
    return view


def _agency_connections(db: Session, agency_id: int) -> dict:
    rows = db.query(IntegrationConnection).filter(
        IntegrationConnection.agency_id == agency_id).all()
    return {c.provider: c for c in rows}


@app.get("/backoffice/integrations")
def list_integrations(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """État des connecteurs de l'agence. Les identifiants ne sortent jamais de ce service."""
    if principal.agency_id is None:
        return _err("You do not belong to an agency", 404)
    found = _agency_connections(db, principal.agency_id)
    return {"integrations": [_connection_view(p, found.get(p)) for p in integrations.PROVIDERS]}


@app.put("/backoffice/integrations/{provider}")
async def connect_integration(provider: str, request: Request,
                              principal: Principal = Depends(get_principal),
                              db: Session = Depends(get_db)):
    """Enregistre une connexion — après un appel réussi chez le fournisseur, jamais avant."""
    if principal.agency_id is None:
        return _err("You do not belong to an agency", 404)
    if provider not in integrations.PROVIDERS:
        return _err("Unknown provider", 404)
    data = await _json(request)
    try:
        credentials = integrations.credentials_from(provider, data)
        account = integrations.check(provider, credentials)
    except integrations.IntegrationError as exc:
        return _err(str(exc), 400)

    conn = _agency_connections(db, principal.agency_id).get(provider)
    if conn is None:
        conn = IntegrationConnection(agency_id=principal.agency_id, provider=provider)
        db.add(conn)
    conn.credentials = credentials
    conn.account_label = account
    conn.status = "connected"
    conn.last_error = None
    conn.last_test_at = datetime.utcnow()
    db.commit()
    return _connection_view(provider, conn)


@app.post("/backoffice/integrations/{provider}/test")
def test_integration(provider: str, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    """Rejoue l'appel de vérification : un jeton expiré se voit ici, pas au prochain envoi."""
    if principal.agency_id is None:
        return _err("You do not belong to an agency", 404)
    conn = _agency_connections(db, principal.agency_id).get(provider)
    if conn is None or provider not in integrations.PROVIDERS:
        return _err("Connection not found", 404)
    try:
        conn.account_label = integrations.check(provider, dict(conn.credentials or {}))
        conn.status, conn.last_error = "connected", None
    except integrations.IntegrationError as exc:
        conn.status, conn.last_error = "error", str(exc)
    conn.last_test_at = datetime.utcnow()
    db.commit()
    return _connection_view(provider, conn)


@app.delete("/backoffice/integrations/{provider}")
def disconnect_integration(provider: str, principal: Principal = Depends(get_principal),
                           db: Session = Depends(get_db)):
    if principal.agency_id is None:
        return _err("You do not belong to an agency", 404)
    conn = _agency_connections(db, principal.agency_id).get(provider)
    if conn is not None:
        db.delete(conn)      # les identifiants partent avec la connexion
        db.commit()
    return {"message": "Integration disconnected"}


@app.get("/internal/agency/{agency_id}/settings", include_in_schema=False)
def internal_agency_settings(agency_id: int, x_internal_token: str = Header(default=""),
                             db: Session = Depends(get_db)):
    """Réglages d'exploitation d'une agence, pour les services qui les appliquent :
    rappel de visite (crm), affectation automatique des leads (crm), SMTP (notification).

    Contrairement à la vue du back-office, celle-ci inclut `smtp_password` : elle n'est
    joignable qu'avec le jeton interne, jamais depuis un navigateur.
    """
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    a = db.get(Agency, agency_id)
    if a is None:
        return {"settings": None}
    view = _settings_view(a)
    view["smtp_password"] = (a.settings or {}).get("smtp_password")
    return {"settings": view}


@app.get("/agencies")
def list_agencies(request: Request, db: Session = Depends(get_db)) -> dict:
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 20)
    q = db.query(Agency).filter(
        Agency.is_active.is_(True), Agency.is_verified.is_(True),
        Agency.is_suspended.is_(False), Agency.deleted_at.is_(None))
    if qp.get("city"):
        q = q.filter(Agency.city.ilike(f"%{qp.get('city')}%"))
    if qp.get("q"):
        q = q.filter(Agency.name.ilike(f"%{qp.get('q')}%"))
    q = q.order_by(Agency.name.asc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    counts = _counts(db, [a.id for a in items])
    trust = trust_client.batch([a.id for a in items])
    return {
        "agencies": [a.to_dict(properties_count=counts.get(a.id, 0), trust=trust.get(a.id))
                     for a in items],
        "total": total, "pages": pages, "current_page": page,
    }


@app.get("/my-agency")
def my_agency(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Agence de l'utilisateur courant, avec ses membres (parité `include_members=True`).
    Les membres viennent d'identity (propriétaire des comptes) — dicts complets `User.to_dict`."""
    if principal.agency_id is None:
        return _err("You do not belong to an agency", 404)
    agency = db.get(Agency, principal.agency_id)
    if agency is None:
        return _err("You do not belong to an agency", 404)
    cnt = _counts(db, [agency.id]).get(agency.id, 0)
    trust = trust_client.batch([agency.id]).get(agency.id)
    data = agency.to_dict(properties_count=cnt, trust=trust)
    data["members"] = members_client.members_of(agency.id)
    return {"agency": data}


@app.get("/agencies/{slug}/properties")
def agency_properties(slug: str, request: Request, db: Session = Depends(get_db)):
    """Biens actifs d'une agence — dicts COMPLETS (parité) via le service listing (propriétaire
    du bien), masquage modération inclus. agency résout le slug → agency_id (son domaine)."""
    agency = db.query(Agency).filter(Agency.slug == slug).first()
    if agency is None or agency.is_suspended or agency.deleted_at is not None:
        return _err("Not found", 404)
    qp = request.query_params
    return listing_client.by_agency(agency.id, "active",
                                    int(qp.get("page") or 1), int(qp.get("per_page") or 20))


@app.get("/agencies/{slug}")
def get_agency(slug: str, db: Session = Depends(get_db)):
    agency = db.query(Agency).filter(Agency.slug == slug).first()
    if agency is None:
        return _err("Not found", 404)
    cnt = _counts(db, [agency.id]).get(agency.id, 0)
    trust = trust_client.batch([agency.id]).get(agency.id)
    return {"agency": agency.to_dict(properties_count=cnt, trust=trust)}


# ---- Écritures agence (self-service pro) — parité `agencies.py` create/update/regenerate ----
@app.post("/agencies", status_code=201)
async def create_agency(request: Request, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    uid = int(principal.sub) if principal.sub and str(principal.sub).isdigit() else None
    if uid is None:
        return _err("User not found", 404)
    if principal.agency_id:
        return _err("You already belong to an agency", 400)
    data = await _json(request)
    for f in ("name", "email"):
        if not data.get(f):
            return _err(f"{f} is required", 400)
    a = Agency(name=data["name"], slug=_gen_slug(db, data["name"]), email=data["email"],
               api_key=_gen_api_key(), owner_id=uid,
               **{k: _rich(k, data.get(k)) for k in _AGENCY_WRITABLE
                  if k not in ("name", "email")})
    db.add(a)
    db.flush()
    # identity consomme agency.created → crée agency_ro + associe l'utilisateur (agency_id + pro).
    enqueue(db, "agency", a.id, events.AGENCY_CREATED, {"id": a.id, "name": a.name, "owner_id": uid})
    db.commit()
    return JSONResponse({"message": "Agency created successfully",
                         "agency": a.to_dict(properties_count=0)}, status_code=201)


@app.put("/agencies/{slug}")
async def update_agency(slug: str, request: Request, principal: Principal = Depends(get_principal),
                        db: Session = Depends(get_db)):
    a = db.query(Agency).filter(Agency.slug == slug).first()
    if a is None:
        return _err("Not found", 404)
    if principal.agency_id != a.id:
        return _err("Unauthorized", 403)
    data = await _json(request)
    old_name = a.name
    for field in _AGENCY_WRITABLE:
        if field in data:
            setattr(a, field, _rich(field, data[field]))
    if "name" in data and old_name != data["name"]:  # slug regénéré si le nom change
        a.slug = _gen_slug(db, data["name"])
    _emit_agency(db, a, events.AGENCY_UPDATED)
    db.commit()
    cnt = _counts(db, [a.id]).get(a.id, 0)
    return {"message": "Agency updated successfully", "agency": a.to_dict(properties_count=cnt)}


@app.post("/agencies/{slug}/regenerate-api-key")
def regenerate_api_key(slug: str, principal: Principal = Depends(get_principal),
                       db: Session = Depends(get_db)):
    a = db.query(Agency).filter(Agency.slug == slug).first()
    if a is None:
        return _err("Not found", 404)
    if principal.agency_id != a.id:
        return _err("Unauthorized", 403)
    a.api_key = _gen_api_key()
    db.commit()
    return {"message": "API key regenerated", "api_key": a.api_key}
