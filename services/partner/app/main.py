"""Service partner — portail partenaires/affiliés M3a-L3achrane.

Conventions du mesh : erreurs legacy {'error': msg}, identité via x-semsar-*
(BFF), outbox transactionnel. Toutes les routes métier exigent le tenant
m3a-l3achrane (défense en profondeur — le BFF route déjà par host/tenant).
"""
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_auth import get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .auth import PartnerCtx, PartnerForbidden, _uid, partner_ctx
from .db import get_db, init_db
from .models import Affilie, Grant, Invoice, Partner, Reservation, Verification, _now
from .schemas import (
    AFFILIE_STATUSES,
    GRANT_STATUSES,
    INVOICE_STATUSES,
    VERIFICATION_DOC_TYPES,
    AffilieCreateIn,
    AffilieUpdateIn,
    GrantCreateIn,
    GrantUpdateIn,
    InvoiceCreateIn,
    InvoiceUpdateIn,
    ReservationCreateIn,
    VerificationCreateIn,
)

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

TENANT = "m3a-l3achrane"


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


@app.exception_handler(PartnerForbidden)
async def _partner_forbidden_handler(request: Request, exc: PartnerForbidden) -> JSONResponse:
    return _err("Accès partenaire refusé", 403)


router = APIRouter(dependencies=[Depends(_require_tenant)])


@router.get("/partner/me")
async def get_partner_me(ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)) -> dict:
    partner = db.query(Partner).filter(Partner.id == ctx.partner_id).first()
    return partner.to_dict()


def _scoped(db, model, obj_id, ctx: PartnerCtx):
    """Renvoie l'objet seulement s'il appartient au partenaire du contexte
    courant, sinon None (→ 404). Patron réutilisé par toutes les ressources
    cloisonnées par partner_id."""
    obj = db.get(model, obj_id)
    return obj if obj is not None and obj.partner_id == ctx.partner_id else None


@router.get("/partner/affilies")
async def list_affilies(ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)) -> list:
    affilies = (
        db.query(Affilie)
        .filter(Affilie.partner_id == ctx.partner_id)
        .order_by(Affilie.created_at.desc())
        .all()
    )
    return [a.to_dict() for a in affilies]


@router.post("/partner/affilies", status_code=201)
async def create_affilie(body: AffilieCreateIn, ctx: PartnerCtx = Depends(partner_ctx),
                          db=Depends(get_db)) -> dict:
    affilie = Affilie(partner_id=ctx.partner_id, full_name=body.full_name,
                       email=body.email, external_ref=body.external_ref)
    db.add(affilie)
    db.flush()
    enqueue(db, "partner", affilie.id, events.AFFILIE_CREATED,
            {"affilie_id": affilie.id, "partner_id": ctx.partner_id,
             "full_name": affilie.full_name, "email": affilie.email})
    db.commit()
    db.refresh(affilie)
    return affilie.to_dict()


@router.patch("/partner/affilies/{affilie_id}")
async def update_affilie(affilie_id: str, body: AffilieUpdateIn,
                          ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)):
    affilie = _scoped(db, Affilie, affilie_id, ctx)
    if affilie is None:
        return _err("Affilié introuvable", 404)
    if body.status is not None:
        if body.status not in AFFILIE_STATUSES:
            return _err("Statut invalide", 422)
        affilie.status = body.status
    if body.full_name is not None:
        affilie.full_name = body.full_name
    db.commit()
    db.refresh(affilie)
    return affilie.to_dict()


@router.get("/partner/verifications")
async def list_verifications(ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)) -> list:
    verifications = (
        db.query(Verification)
        .filter(Verification.partner_id == ctx.partner_id)
        .order_by(Verification.submitted_at.desc())
        .all()
    )
    return [v.to_dict() for v in verifications]


@router.post("/partner/verifications", status_code=201)
async def create_verification(body: VerificationCreateIn, ctx: PartnerCtx = Depends(partner_ctx),
                                db=Depends(get_db)):
    if body.doc_type not in VERIFICATION_DOC_TYPES:
        return _err("Type de document invalide", 422)
    affilie = _scoped(db, Affilie, body.affilie_id, ctx)
    if affilie is None:
        return _err("Affilié introuvable", 404)
    verification = Verification(partner_id=ctx.partner_id, affilie_id=body.affilie_id,
                                 doc_type=body.doc_type, note=body.note)
    db.add(verification)
    db.commit()
    db.refresh(verification)
    return verification.to_dict()


def _decide_verification(verification: Verification, status: str, request: Request, db) -> Verification:
    principal = get_principal(request)
    verification.status = status
    verification.decided_at = _now()
    verification.decided_by = _uid(principal)
    db.commit()
    db.refresh(verification)
    return verification


@router.post("/partner/verifications/{verification_id}/approve")
async def approve_verification(verification_id: str, request: Request,
                                 ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)):
    verification = _scoped(db, Verification, verification_id, ctx)
    if verification is None:
        return _err("Vérification introuvable", 404)
    verification = _decide_verification(verification, "APPROVED", request, db)
    enqueue(db, "partner", verification.id, events.VERIFICATION_DECIDED,
            {"verification_id": verification.id, "partner_id": ctx.partner_id,
             "status": verification.status})
    db.commit()
    return verification.to_dict()


@router.post("/partner/verifications/{verification_id}/reject")
async def reject_verification(verification_id: str, request: Request,
                                ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)):
    verification = _scoped(db, Verification, verification_id, ctx)
    if verification is None:
        return _err("Vérification introuvable", 404)
    verification = _decide_verification(verification, "REJECTED", request, db)
    enqueue(db, "partner", verification.id, events.VERIFICATION_DECIDED,
            {"verification_id": verification.id, "partner_id": ctx.partner_id,
             "status": verification.status})
    db.commit()
    return verification.to_dict()


@router.get("/partner/reservations")
async def list_reservations(ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)) -> list:
    reservations = (
        db.query(Reservation)
        .filter(Reservation.partner_id == ctx.partner_id)
        .order_by(Reservation.start_date.desc())
        .all()
    )
    return [r.to_dict() for r in reservations]


@router.post("/partner/reservations", status_code=201)
async def create_reservation(body: ReservationCreateIn, ctx: PartnerCtx = Depends(partner_ctx),
                               db=Depends(get_db)):
    if body.affilie_id is not None and _scoped(db, Affilie, body.affilie_id, ctx) is None:
        return _err("Affilié introuvable", 404)
    reservation = Reservation(partner_id=ctx.partner_id, listing_id=body.listing_id,
                               affilie_id=body.affilie_id, label=body.label,
                               start_date=body.start_date, end_date=body.end_date)
    db.add(reservation)
    db.flush()
    enqueue(db, "partner", reservation.id, events.RESERVATION_CREATED,
            {"reservation_id": reservation.id, "partner_id": ctx.partner_id,
             "listing_id": reservation.listing_id})
    db.commit()
    db.refresh(reservation)
    return reservation.to_dict()


@router.post("/partner/reservations/{reservation_id}/release")
async def release_reservation(reservation_id: str, ctx: PartnerCtx = Depends(partner_ctx),
                                db=Depends(get_db)):
    reservation = _scoped(db, Reservation, reservation_id, ctx)
    if reservation is None:
        return _err("Réservation introuvable", 404)
    reservation.status = "RELEASED"
    enqueue(db, "partner", reservation.id, events.RESERVATION_RELEASED,
            {"reservation_id": reservation.id, "partner_id": ctx.partner_id})
    db.commit()
    db.refresh(reservation)
    return reservation.to_dict()


@router.get("/partner/grants")
async def list_grants(ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)) -> list:
    grants = (
        db.query(Grant)
        .filter(Grant.partner_id == ctx.partner_id)
        .order_by(Grant.id)
        .all()
    )
    return [g.to_dict() for g in grants]


@router.post("/partner/grants", status_code=201)
async def create_grant(body: GrantCreateIn, ctx: PartnerCtx = Depends(partner_ctx),
                        db=Depends(get_db)):
    if body.affilie_id is not None and _scoped(db, Affilie, body.affilie_id, ctx) is None:
        return _err("Affilié introuvable", 404)
    grant = Grant(partner_id=ctx.partner_id, program=body.program, affilie_id=body.affilie_id,
                  amount=body.amount, currency=body.currency)
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return grant.to_dict()


@router.patch("/partner/grants/{grant_id}")
async def update_grant(grant_id: str, body: GrantUpdateIn, ctx: PartnerCtx = Depends(partner_ctx),
                        db=Depends(get_db)):
    grant = _scoped(db, Grant, grant_id, ctx)
    if grant is None:
        return _err("Subvention introuvable", 404)
    if body.status not in GRANT_STATUSES:
        return _err("Statut invalide", 422)
    grant.status = body.status
    if grant.status == "PAID":
        enqueue(db, "partner", grant.id, events.GRANT_PAID,
                {"grant_id": grant.id, "partner_id": ctx.partner_id, "amount": float(grant.amount)})
    db.commit()
    db.refresh(grant)
    return grant.to_dict()


@router.get("/partner/invoices")
async def list_invoices(ctx: PartnerCtx = Depends(partner_ctx), db=Depends(get_db)) -> list:
    invoices = (
        db.query(Invoice)
        .filter(Invoice.partner_id == ctx.partner_id)
        .order_by(Invoice.id)
        .all()
    )
    return [i.to_dict() for i in invoices]


@router.post("/partner/invoices", status_code=201)
async def create_invoice(body: InvoiceCreateIn, ctx: PartnerCtx = Depends(partner_ctx),
                          db=Depends(get_db)):
    invoice = Invoice(partner_id=ctx.partner_id, number=body.number, period=body.period,
                       amount=body.amount, currency=body.currency)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice.to_dict()


@router.patch("/partner/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: InvoiceUpdateIn, ctx: PartnerCtx = Depends(partner_ctx),
                          db=Depends(get_db)):
    invoice = _scoped(db, Invoice, invoice_id, ctx)
    if invoice is None:
        return _err("Facture introuvable", 404)
    if body.status not in INVOICE_STATUSES:
        return _err("Statut invalide", 422)
    invoice.status = body.status
    if invoice.status == "SENT":
        invoice.issued_at = _now()
        enqueue(db, "partner", invoice.id, events.INVOICE_SENT,
                {"invoice_id": invoice.id, "partner_id": ctx.partner_id, "number": invoice.number})
    db.commit()
    db.refresh(invoice)
    return invoice.to_dict()


app.include_router(router)
