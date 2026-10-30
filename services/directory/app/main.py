"""Service directory — artisans (partagés + privés) + bons de travaux.

Reproduit à l'identique les routes du monolithe (`/backoffice/artisans*`,
`/backoffice/work-orders*`, `/backoffice/artisan-trades`, `/admin/shared-artisans*`).
Gate d'abonnement via `require_feature('artisans')` (entitlements injectés par le BFF).
Erreurs legacy `{'error': msg}`.
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, require_feature, require_superadmin
from semsar_events import enqueue
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .db import get_db, init_db
from .models import Artisan, WorkOrder
from .payeur import CHARGE_MODES, SETTLE_METHODS, refus_de_creation, refus_de_modification, tiers_sans_nom, valeur_inconnue
from .trades import ARTISAN_TRADES, is_valid_trade

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_FIELDS = ["trade", "name", "company", "city", "phone", "email", "notes"]
_artisans = require_feature("artisans")  # gate d'abonnement des routes back-office


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_legacy_error_handlers(app)  # Problem (require_*/get_principal) -> {'error': ...} legacy

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


def _parse_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _artisan_dict(a: Artisan) -> dict:
    return {
        "id": a.id, "agency_id": a.agency_id, "is_shared": a.agency_id is None,
        "trade": a.trade, "name": a.name, "company": a.company, "city": a.city,
        "phone": a.phone, "email": a.email, "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


# Qui peut retirer un bon, et quand. Un bon encore à l'état de demande ou déjà annulé
# n'engage personne : qui peut le créer peut l'effacer. Dès qu'un artisan est mobilisé
# (planifié, en cours), seule l'administration de l'agence tranche. Un bon terminé porte le
# coût final : il reste à l'historique, et c'est la seule règle qu'aucun rôle ne contourne.
_WO_ADMIN_ROLES = {"admin", "agency_admin"}
_WO_STATUSES = ("requested", "scheduled", "in_progress", "done", "cancelled")
_WO_FREELY_DELETABLE = {"requested", "cancelled"}
_WO_ENGAGED = {"scheduled", "in_progress"}
_WO_KEPT_FOREVER = {"done"}


def _is_wo_admin(principal: Principal) -> bool:
    return principal.is_superadmin or bool(_WO_ADMIN_ROLES & set(principal.roles))


def _wo_is_sealed(w: WorkOrder) -> bool:
    """Le bon porte-t-il la trace d'un travail achevé ou chiffré ?"""
    return w.completed_at is not None or w.cost_final is not None


def _can_delete_wo(principal: Principal, w: WorkOrder) -> bool:
    # Un travail achevé laisse des traces que le statut courant ne porte pas : une date de
    # clôture ou un coût final suffisent à interdire le retrait, même si quelqu'un a replacé
    # le bon en « demandé » entre-temps.
    if w.status in _WO_KEPT_FOREVER or _wo_is_sealed(w):
        return False
    if w.status in _WO_FREELY_DELETABLE:
        return True
    return _is_wo_admin(principal)


def _status_change_refusal(principal: Principal, w: WorkOrder, new: str):
    """Le changement d'état obéit à la même règle que le retrait, sinon il la contourne.

    Sans ce garde-fou, replacer un bon terminé en « demandé » rendait n'importe quel rôle
    maître de sa suppression.
    """
    if new not in _WO_STATUSES:
        return _err("Statut inconnu", 400)
    if new == w.status:
        return None
    if w.status in _WO_KEPT_FOREVER:
        return _err("Un bon terminé ne change plus d'état", 403)
    if w.status in _WO_ENGAGED and new in _WO_FREELY_DELETABLE and not _is_wo_admin(principal):
        return _err("Seule l'administration de l'agence rouvre ou annule un bon engagé", 403)
    return None


def _wo_dict(db: Session, w: WorkOrder, principal: Principal | None = None) -> dict:
    artisan = db.get(Artisan, w.artisan_id) if w.artisan_id else None
    return {
        # Le front cache l'action plutôt que de laisser cliquer vers un 403.
        "can_delete": _can_delete_wo(principal, w) if principal is not None else None,
        # Même test que la route de solde : abandonner ou imputer sur la commission est réservé.
        "can_settle_writeoff": _is_wo_admin(principal) if principal is not None else None,
        "id": w.id, "agency_id": w.agency_id, "artisan_id": w.artisan_id,
        "artisan": ({"id": artisan.id, "name": artisan.name, "trade": artisan.trade} if artisan else None),
        "property_id": w.property_id, "title": w.title, "trade": w.trade, "status": w.status,
        "cost_estimate": float(w.cost_estimate) if w.cost_estimate is not None else None,
        "cost_final": float(w.cost_final) if w.cost_final is not None else None,
        "scheduled_date": w.scheduled_date.isoformat() if w.scheduled_date else None,
        "completed_at": w.completed_at.isoformat() if w.completed_at else None,
        "notes": w.notes, "created_at": w.created_at.isoformat() if w.created_at else None,
        "client_id": w.client_id, "lease_id": w.lease_id, "nature": w.nature, "payer": w.payer,
        "charge_mode": w.charge_mode, "third_party_label": w.third_party_label,
        "payer_set_by": w.payer_set_by,
        "payer_set_at": w.payer_set_at.isoformat() if w.payer_set_at else None,
        "charged_at": w.charged_at.isoformat() if w.charged_at else None,
        "charged_ref": w.charged_ref,
        "settled_at": w.settled_at.isoformat() if w.settled_at else None,
        "settled_by": w.settled_by, "settled_method": w.settled_method,
    }


def _accessible_artisan(db: Session, aid, agency_id: int) -> Artisan | None:
    if not aid:
        return None
    return (
        db.query(Artisan)
        .filter(Artisan.id == aid, (Artisan.agency_id.is_(None)) | (Artisan.agency_id == agency_id))
        .first()
    )


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Métiers + annuaire (gated) ----
@app.get("/backoffice/artisan-trades")
def list_trades(_p: Principal = Depends(_artisans)) -> dict:
    return {"trades": ARTISAN_TRADES}


@app.get("/backoffice/artisans")
def list_artisans(
    trade: str | None = None, city: str | None = None, q: str | None = None,
    principal: Principal = Depends(_artisans), db: Session = Depends(get_db),
) -> dict:
    query = db.query(Artisan).filter(
        (Artisan.agency_id.is_(None)) | (Artisan.agency_id == principal.agency_id)
    )
    if trade:
        query = query.filter(Artisan.trade == trade)
    if city:
        query = query.filter(Artisan.city.ilike(f"%{city}%"))
    if q:
        term = f"%{q}%"
        query = query.filter((Artisan.name.ilike(term)) | (Artisan.company.ilike(term)))
    return {"artisans": [_artisan_dict(a) for a in query.order_by(Artisan.name).all()]}


@app.post("/backoffice/artisans", status_code=201)
async def create_artisan(request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    data = await _json(request)
    if not data.get("name"):
        return _err("Le nom est requis", 400)
    if not is_valid_trade(data.get("trade")):
        return _err("Métier invalide", 400)
    a = Artisan(
        agency_id=principal.agency_id,
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
        **{k: data.get(k) for k in _FIELDS},
    )
    db.add(a)
    db.commit()
    return {"artisan": _artisan_dict(a)}


@app.put("/backoffice/artisans/{aid}")
async def update_artisan(aid: int, request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    a = db.query(Artisan).filter(Artisan.id == aid, Artisan.agency_id == principal.agency_id).first()
    if a is None:
        return _err("Artisan introuvable", 404)
    data = await _json(request)
    if "trade" in data and not is_valid_trade(data["trade"]):
        return _err("Métier invalide", 400)
    for k in _FIELDS:
        if k in data:
            setattr(a, k, data[k])
    db.commit()
    return {"artisan": _artisan_dict(a)}


@app.delete("/backoffice/artisans/{aid}")
def delete_artisan(aid: int, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    a = db.query(Artisan).filter(Artisan.id == aid, Artisan.agency_id == principal.agency_id).first()
    if a is None:
        return _err("Artisan introuvable", 404)
    db.delete(a)
    db.commit()
    return {"message": "Artisan supprimé"}


# ---- Bons de travaux (gated) ----
def _validate_links(db: Session, data: dict, agency_id: int):
    if data.get("artisan_id") and not _accessible_artisan(db, data["artisan_id"], agency_id):
        return _err("Artisan inaccessible", 400)
    # property_id : la validation d'appartenance relève de `listing` (non extrait) — stocké tel quel.
    return None


@app.get("/backoffice/work-orders")
def list_work_orders(
    status: str | None = None, property_id: int | None = None, lease_id: int | None = None,
    pending: int = 0,
    principal: Principal = Depends(_artisans), db: Session = Depends(get_db),
) -> dict:
    query = db.query(WorkOrder).filter(WorkOrder.agency_id == principal.agency_id)
    if status:
        query = query.filter(WorkOrder.status == status)
    if property_id:
        query = query.filter(WorkOrder.property_id == property_id)
    if lease_id:
        query = query.filter(WorkOrder.lease_id == lease_id)
    if pending:
        # Une dépense non portée reste visible même sans mandat ni mode choisi : c'est
        # justement l'écran qui rattrape ce que les relevés n'ont pas pris.
        query = query.filter(WorkOrder.status == "done", WorkOrder.cost_final.isnot(None),
                             WorkOrder.charged_at.is_(None), WorkOrder.settled_at.is_(None))
    rows = []
    for w in query.order_by(WorkOrder.created_at.desc()).all():
        row = _wo_dict(db, w, principal)
        if pending:
            row["waiting_days"] = (datetime.utcnow() - (w.completed_at or w.updated_at or w.created_at)).days
        rows.append(row)
    return {"work_orders": rows}


@app.get("/internal/work-orders/chargeable", include_in_schema=False)
def internal_chargeable_work_orders(
    property_ids: str, mode: str, agency_id: int | None = None, lease_id: int | None = None,
    x_internal_token: str = Header(default=""), db: Session = Depends(get_db),
):
    """Dépenses achevées, chiffrées et pas encore portées sur un relevé, pour des biens donnés."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    if agency_id is None:
        return _err("agency_id est requis", 400)
    if mode not in CHARGE_MODES:
        return _err("Mode d'imputation invalide", 400)
    try:
        ids = [int(i) for i in property_ids.split(",") if i.strip()]
    except ValueError:
        return _err("Identifiants de biens invalides", 400)
    if not ids:
        return {"work_orders": []}
    query = db.query(WorkOrder).filter(
        WorkOrder.agency_id == agency_id, WorkOrder.property_id.in_(ids), WorkOrder.status == "done",
        WorkOrder.cost_final.isnot(None), WorkOrder.charged_at.is_(None),
        WorkOrder.charge_mode == mode)
    if lease_id:
        query = query.filter(WorkOrder.lease_id == lease_id)
    out = []
    for w in query.order_by(WorkOrder.id).all():
        artisan = db.get(Artisan, w.artisan_id) if w.artisan_id else None
        out.append({
            "id": w.id, "property_id": w.property_id, "title": w.title, "trade": w.trade,
            "artisan_name": artisan.name if artisan else None,
            "completed_at": w.completed_at.isoformat() if w.completed_at else None,
            "cost_final": float(w.cost_final),
        })
    return {"work_orders": out}


@app.post("/internal/work-orders/charged", include_in_schema=False)
async def internal_stamp_charged(
    request: Request, x_internal_token: str = Header(default=""), db: Session = Depends(get_db),
):
    """Estampille les dépenses portées sur un relevé ; une dépense déjà estampillée est ignorée.

    Idempotent par `ref` : rejouer le même appel rend le même compte sans déplacer la date du
    premier estampillage. Sans cela, l'appelant qui perd son commit juste après un estampillage
    réussi relirait `stamped: 0` à chaque reprise et ne pourrait plus jamais envoyer son relevé.
    Un `ref` *différent* sur une dépense déjà estampillée reste ignoré : c'est ce qui interdit de
    la porter deux fois.
    """
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    data = await _json(request)
    ids, ref, agency_id = data.get("ids"), data.get("ref"), data.get("agency_id")
    if (not isinstance(ids, list) or not all(isinstance(i, int) for i in ids)
            or not isinstance(ref, str) or not ref or not isinstance(agency_id, int)):
        return _err("ids, ref et agency_id sont requis", 400)
    (db.query(WorkOrder)
       .filter(WorkOrder.id.in_(ids), WorkOrder.agency_id == agency_id,
               WorkOrder.charged_at.is_(None))
       .update({"charged_at": datetime.utcnow(), "charged_ref": ref}, synchronize_session=False))
    db.commit()
    stamped = (db.query(WorkOrder)
               .filter(WorkOrder.id.in_(ids), WorkOrder.agency_id == agency_id,
                       WorkOrder.charged_ref == ref).count())
    return {"stamped": stamped}


@app.post("/internal/work-orders/release", include_in_schema=False)
async def internal_release_charged(
    request: Request, x_internal_token: str = Header(default=""), db: Session = Depends(get_db),
):
    """Libère l'estampille posée sous ce `ref` — et seulement celle-là ; `released` compte les libres.

    Le filtre sur `charged_ref` interdit de défaire l'imputation d'un autre relevé : un CRG
    envoyé (`crg:*`) ne peut jamais être annulé par le chemin du décompte de caution.
    """
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    data = await _json(request)
    ids, ref, agency_id = data.get("ids"), data.get("ref"), data.get("agency_id")
    if (not isinstance(ids, list) or not all(isinstance(i, int) for i in ids)
            or not isinstance(ref, str) or not ref or not isinstance(agency_id, int)):
        return _err("ids, ref et agency_id sont requis", 400)
    # Lignes verrouillées puis décomptées dans la même transaction : le nombre rendu décrit
    # l'état que ce commit produit. Une dépense déjà libre compte (rejouer une libération dont
    # l'appelant a perdu le commit doit réussir) ; celle d'un autre `ref` n'est ni touchée ni comptée.
    released = 0
    for wo in (db.query(WorkOrder)
               .filter(WorkOrder.id.in_(ids), WorkOrder.agency_id == agency_id)
               .with_for_update().all()):
        if wo.charged_ref == ref:
            wo.charged_at = wo.charged_ref = None
        if wo.charged_at is None:
            released += 1
    db.commit()
    return {"released": released}


@app.post("/backoffice/work-orders", status_code=201)
async def create_work_order(request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    data = await _json(request)
    if not data.get("title"):
        return _err("Le titre est requis", 400)
    if not is_valid_trade(data.get("trade")):
        return _err("Métier invalide", 400)
    err = _validate_links(db, data, principal.agency_id)
    if err:
        return err
    refus = refus_de_creation(data)
    if refus:
        return _err(refus, 400)
    wo = WorkOrder(
        agency_id=principal.agency_id, title=data["title"], trade=data["trade"], status="requested",
        client_id=data.get("client_id"), lease_id=data.get("lease_id"), nature=data.get("nature"),
        payer=data.get("payer"), charge_mode=data.get("charge_mode"),
        third_party_label=data["third_party_label"].strip() if data.get("payer") == "third_party" else None,
        payer_set_by=int(principal.sub) if data.get("payer") and principal.sub.isdigit() else None,
        payer_set_at=datetime.utcnow() if data.get("payer") else None,
        artisan_id=data.get("artisan_id"), property_id=data.get("property_id"),
        cost_estimate=data.get("cost_estimate"), notes=data.get("notes"),
        scheduled_date=_parse_dt(data.get("scheduled_date")),
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
    )
    db.add(wo)
    db.flush()
    # notification consomme work_order.created → ordre de service par email à l'artisan.
    artisan = db.get(Artisan, wo.artisan_id) if wo.artisan_id else None
    enqueue(db, "work_order", wo.id, "work_order.created", {
        "id": wo.id, "title": wo.title, "trade": wo.trade, "notes": wo.notes,
        "scheduled_date": wo.scheduled_date.isoformat() if wo.scheduled_date else None,
        "artisan_email": artisan.email if artisan else None,
        "artisan_name": artisan.name if artisan else None,
        "cost_estimate": float(wo.cost_estimate) if wo.cost_estimate is not None else None,
    })
    db.commit()
    return {"work_order": _wo_dict(db, wo, principal)}


@app.get("/backoffice/work-orders/{wid}")
def get_work_order(wid: int, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wid, WorkOrder.agency_id == principal.agency_id).first()
    if wo is None:
        return _err("Bon de travaux introuvable", 404)
    return {"work_order": _wo_dict(db, wo, principal)}


@app.put("/backoffice/work-orders/{wid}")
async def update_work_order(wid: int, request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wid, WorkOrder.agency_id == principal.agency_id).first()
    if wo is None:
        return _err("Bon de travaux introuvable", 404)
    data = await _json(request)
    if "trade" in data and not is_valid_trade(data["trade"]):
        return _err("Métier invalide", 400)
    err = _validate_links(db, data, principal.agency_id)
    if err:
        return err
    # Refuser avant d'écrire : un refus laissé après coup abandonnerait des champs déjà posés
    # sur l'objet de session.
    if "status" in data:
        refusal = _status_change_refusal(principal, wo, data["status"])
        if refusal is not None:
            return refusal
    if (inconnue := valeur_inconnue(data)) is not None:
        return _err(inconnue, 400)
    if (sans_nom := tiers_sans_nom(wo, data)) is not None:
        return _err(sans_nom, 400)
    if (refus := refus_de_modification(principal, wo, data)) is not None:
        return _err(refus, 403)
    # Ces traces protègent le bon du retrait : les laisser réécrire rendrait la protection
    # décorative, puisqu'il suffirait d'effacer le coût pour pouvoir supprimer.
    if "cost_final" in data and _wo_is_sealed(wo) and not _is_wo_admin(principal):
        return _err("Le coût final d'un bon clos ne se modifie qu'en administration", 403)
    for k in ("title", "notes", "cost_estimate", "cost_final"):
        if k in data:
            setattr(wo, k, data[k])
    if "trade" in data:
        wo.trade = data["trade"]
    if "artisan_id" in data:
        wo.artisan_id = data["artisan_id"]
    if "property_id" in data:
        wo.property_id = data["property_id"]
    if "scheduled_date" in data:
        wo.scheduled_date = _parse_dt(data["scheduled_date"])
    for k in ("nature", "charge_mode", "client_id", "lease_id"):
        if k in data:
            setattr(wo, k, data[k])
    if "payer" in data and data["payer"] != wo.payer:
        wo.payer = data["payer"]
        wo.payer_set_by = int(principal.sub) if principal.sub.isdigit() else None
        wo.payer_set_at = datetime.utcnow()
    if "payer" in data or "third_party_label" in data:
        label = data.get("third_party_label", wo.third_party_label)
        wo.third_party_label = label.strip() if wo.payer == "third_party" else None
    # `completed_at` ne se pose qu'au passage à « terminé », état dont on ne sort plus : rien
    # ne doit l'effacer, surtout pas un PUT qui renvoie le statut courant à l'identique.
    if data.get("status") not in (None, wo.status):
        wo.status = data["status"]
        if wo.status == "done":
            wo.completed_at = datetime.utcnow()
    db.commit()
    return {"work_order": _wo_dict(db, wo, principal)}


_SETTLE_ADMIN_METHODS = {"abandonne", "impute_commission"}


@app.post("/backoffice/work-orders/{wid}/settle")
async def settle_work_order(wid: int, request: Request, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    """Dit comment une refacturation a été réglée ; pose `settled_at`, qui verrouille la dépense."""
    wo = db.query(WorkOrder).filter(WorkOrder.id == wid, WorkOrder.agency_id == principal.agency_id).first()
    if wo is None:
        return _err("Bon de travaux introuvable", 404)
    method = (await _json(request)).get("method")
    if method not in SETTLE_METHODS:
        return _err("Mode de règlement invalide", 400)
    # Renoncer à une créance ou l'absorber engage l'argent de l'agence ; encaisser ou régulariser
    # enregistre ce qui s'est déjà passé au guichet, geste courant comme le passage à « terminé ».
    if method in _SETTLE_ADMIN_METHODS and not _is_wo_admin(principal):
        return _err("Seule l'administration de l'agence abandonne ou impute une refacturation", 403)
    # Verrou pris après les refus de rôle : un refusé ne bloque pas la ligne en sortant.
    db.refresh(wo, with_for_update=True)
    if wo.charge_mode != "to_rebill":
        return _err("Seule une intervention à refacturer se solde à la main", 400)
    if wo.status != "done":
        return _err("Seule une intervention achevée se solde", 400)
    # Solder verrouille le coût pour tous, administrateurs compris, sans retour possible.
    if wo.cost_final is None:
        return _err("Fixez le coût final avant de solder", 400)
    if wo.settled_at is not None:
        return _err("Cette refacturation est déjà soldée", 409)
    wo.settled_at = datetime.utcnow()
    wo.settled_by = int(principal.sub) if principal.sub.isdigit() else None
    wo.settled_method = method
    db.commit()
    return {"work_order": _wo_dict(db, wo, principal)}


@app.delete("/backoffice/work-orders/{wid}")
def delete_work_order(wid: int, principal: Principal = Depends(_artisans), db: Session = Depends(get_db)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wid, WorkOrder.agency_id == principal.agency_id).first()
    if wo is None:
        return _err("Bon de travaux introuvable", 404)
    if not _can_delete_wo(principal, wo):
        if wo.status in _WO_KEPT_FOREVER:
            return _err("Un bon terminé reste à l'historique de l'agence", 403)
        return _err("Seule l'administration de l'agence retire un bon engagé", 403)
    db.delete(wo)
    db.commit()
    return {"message": "Bon de travaux supprimé"}


# ---- Catalogue partagé (super-admin) ----
@app.get("/admin/shared-artisans")
def admin_list_shared(trade: str | None = None, q: str | None = None, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)) -> dict:
    query = db.query(Artisan).filter(Artisan.agency_id.is_(None))
    if trade:
        query = query.filter(Artisan.trade == trade)
    if q:
        query = query.filter(Artisan.name.ilike(f"%{q}%"))
    return {"artisans": [_artisan_dict(a) for a in query.order_by(Artisan.name).all()]}


@app.post("/admin/shared-artisans", status_code=201)
async def admin_create_shared(request: Request, principal: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    data = await _json(request)
    if not data.get("name"):
        return _err("Le nom est requis", 400)
    if not is_valid_trade(data.get("trade")):
        return _err("Métier invalide", 400)
    a = Artisan(
        agency_id=None,
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
        **{k: data.get(k) for k in _FIELDS},
    )
    db.add(a)
    db.commit()
    return {"artisan": _artisan_dict(a)}


@app.put("/admin/shared-artisans/{aid}")
async def admin_update_shared(aid: int, request: Request, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    a = db.query(Artisan).filter(Artisan.id == aid, Artisan.agency_id.is_(None)).first()
    if a is None:
        return _err("Artisan partagé introuvable", 404)
    data = await _json(request)
    if "trade" in data and not is_valid_trade(data["trade"]):
        return _err("Métier invalide", 400)
    for k in _FIELDS:
        if k in data:
            setattr(a, k, data[k])
    db.commit()
    return {"artisan": _artisan_dict(a)}


@app.delete("/admin/shared-artisans/{aid}")
def admin_delete_shared(aid: int, _p: Principal = Depends(require_superadmin), db: Session = Depends(get_db)):
    a = db.query(Artisan).filter(Artisan.id == aid, Artisan.agency_id.is_(None)).first()
    if a is None:
        return _err("Artisan partagé introuvable", 404)
    db.delete(a)
    db.commit()
    return {"message": "Artisan supprimé"}
