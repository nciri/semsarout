"""Service selling — flux vente médiée (demande d'achat → offre → compromis e-signé)."""
import json
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

import semsar_signing as signing
from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import commission_client, compromis_pdf, events, listing_client, storage
from .db import get_db, init_db  # noqa: F401
from .models import Compromis, Offer, ProcessedMessage, PurchaseInquiry, SignatureRequest  # noqa: F401
from .util import err, iso, json_body  # noqa: F401

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


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and principal.sub.isdigit() else None


@app.post("/vente/purchase-inquiries", status_code=201)
async def create_inquiry(request: Request, principal: Principal = Depends(get_principal),
                         db: Session = Depends(get_db)):
    if not principal.sub:
        return err("Authentification requise.", 401)
    data = await json_body(request)
    pid = data.get("property_id")
    if not pid:
        return err("property_id requis.", 400)
    seller = listing_client.owner_of(pid)
    inq = PurchaseInquiry(property_id=pid, seller_party=seller, buyer_party=_uid(principal),
                          status="open")
    db.add(inq)
    db.flush()
    enqueue(db, "purchase_inquiry", inq.id, events.INQUIRY_CREATED, {
        "id": inq.id, "property_id": pid, "seller_party": seller, "buyer_party": inq.buyer_party})
    db.commit()
    return {"inquiry": {"id": inq.id, "property_id": pid, "status": inq.status}}


@app.post("/vente/purchase-inquiries/{inquiry_id}/offers", status_code=201)
async def make_offer(inquiry_id: int, request: Request, principal: Principal = Depends(get_principal),
                     db: Session = Depends(get_db)):
    inq = db.get(PurchaseInquiry, inquiry_id)
    if inq is None or inq.buyer_party != _uid(principal):
        return err("Demande introuvable.", 404)
    data = await json_body(request)
    try:
        amount = float(data["amount"])
    except (KeyError, TypeError, ValueError):
        return err("amount requis.", 400)
    o = Offer(inquiry_id=inquiry_id, amount=amount, status="pending")
    inq.status = "offer_pending"
    db.add(o)
    db.flush()
    enqueue(db, "offer", o.id, events.OFFER_MADE,
            {"id": o.id, "inquiry_id": inquiry_id, "amount": amount})
    db.commit()
    return {"offer": {"id": o.id, "amount": amount, "status": o.status}}


@app.post("/vente/purchase-inquiries/{inquiry_id}/offers/{offer_id}/accept")
def accept_offer(inquiry_id: int, offer_id: int, principal: Principal = Depends(get_principal),
                 db: Session = Depends(get_db)):
    inq = db.get(PurchaseInquiry, inquiry_id)
    if inq is None or inq.seller_party != _uid(principal):
        return err("Demande introuvable.", 404)
    o = db.get(Offer, offer_id)
    if o is None or o.inquiry_id != inquiry_id:
        return err("Offre introuvable.", 404)
    from datetime import datetime
    o.status = "accepted"
    o.decided_at = datetime.utcnow()
    inq.status = "accepted"
    enqueue(db, "offer", o.id, events.OFFER_ACCEPTED,
            {"id": o.id, "inquiry_id": inquiry_id, "amount": float(o.amount)})
    db.commit()
    return {"offer": {"id": o.id, "status": o.status}}


@app.post("/vente/purchase-inquiries/{inquiry_id}/compromis")
async def prepare_compromis(inquiry_id: int, request: Request,
                            principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    inq = db.get(PurchaseInquiry, inquiry_id)
    if inq is None or inq.seller_party != _uid(principal):
        return err("Demande introuvable.", 404)
    if inq.status != "accepted":
        return err("Une offre doit être acceptée avant le compromis.", 400)
    # Vérifier signing_enabled (cheap local check) AVANT le gate commission, qui a des
    # effets de bord (crée une Conclusion, peut émettre une facture).
    if not signing.signing_enabled():
        return err("Signature électronique non configurée.", 400)
    offer = (db.query(Offer).filter(Offer.inquiry_id == inquiry_id, Offer.status == "accepted").first())
    data = await json_body(request)
    c = db.query(Compromis).filter(Compromis.inquiry_id == inquiry_id).first()
    if c is None:
        c = Compromis(inquiry_id=inquiry_id, accepted_offer_id=offer.id if offer else None,
                      status="draft", payload=json.dumps(data))
        db.add(c)
        db.flush()
    # Gate commission (fail-closed)
    try:
        decision = commission_client.gate(account_id=inq.seller_party, deal_type="sale", source_ref=c.id)
    except commission_client.CommissionUnavailable:
        db.commit()
        return err("Vérification de facturation indisponible, réessayez.", 503)
    if decision.get("state") == "BLOCKED":
        db.commit()
        return JSONResponse({"error": "Commission due avant signature.",
                             "pay_url": decision.get("pay_url")}, status_code=402)
    # OPEN → PDF + e-signature
    vendeur_email = (data.get("vendeur_email") or "").strip()
    acheteur_email = (data.get("acheteur_email") or "").strip()
    if not vendeur_email or not acheteur_email:
        return err("Emails vendeur et acheteur requis.", 400)
    # Guard: prevent duplicate active signature requests
    existing_sig = (db.query(SignatureRequest)
                    .filter(SignatureRequest.doc_type == "compromis",
                            SignatureRequest.doc_ref_id == c.id).first())
    if existing_sig is not None and existing_sig.status not in ("declined", "voided", "expired"):
        return err("Signature déjà demandée pour ce compromis.", 400)
    try:
        pdf = compromis_pdf.render(data)
        env = signing.create_envelope(f"Compromis {c.id}", f"sale:compromis:{c.id}")
        docid, pages = signing.add_document(env, f"compromis-{c.id}.pdf", pdf)
        r1 = signing.add_recipient(env, vendeur_email, "Vendeur", 1)
        r2 = signing.add_recipient(env, acheteur_email, "Acheteur", 2)
        signing.place_signature_field(env, docid, r1, pages, 72, 72)
        signing.place_signature_field(env, docid, r2, pages, 340, 72)
        signing.send_envelope(env)
    except signing.SigningError as e:
        return err(f"Échec de l'envoi en signature : {e}", 502)
    sig = SignatureRequest(doc_type="compromis", doc_ref_id=c.id, envelope_id=env,
                           document_id=docid, status="sent",
                           signers=json.dumps([{"name": "Vendeur", "email": vendeur_email, "order": 1},
                                               {"name": "Acheteur", "email": acheteur_email, "order": 2}]))
    c.status = "sent"
    inq.status = "compromis_pending"
    db.add(sig)
    db.commit()
    return {"compromis": {"id": c.id, "status": c.status}, "signature": {"status": sig.status}}


@app.post("/internal/signatures/poll", include_in_schema=False)
def poll_signatures(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Interroge 3a9dSign pour les compromis en cours ; sur complétion, stocke le PDF signé,
    marque le compromis/la demande conclue et émet `sale.compromis.signed` ; sur refus/annulation,
    libère la commission associée (appelé par l'ordonnanceur, toutes les ~60 s)."""
    if x_internal_token != settings.internal_token:
        return err("Forbidden", 403)
    if not signing.signing_enabled():
        return {"checked": 0}
    pending = db.query(SignatureRequest).filter(SignatureRequest.status.in_(("sent", "in_progress"))).all()
    updated = 0
    for sig in pending:
        try:
            st = signing.get_status(sig.envelope_id)
        except signing.SigningError:
            continue
        if st == sig.status:
            continue
        if st == "completed":
            c = db.get(Compromis, sig.doc_ref_id)
            inq = db.get(PurchaseInquiry, c.inquiry_id) if c else None
            signed_key = None
            try:
                data = signing.fetch_signed_pdf(sig.envelope_id, sig.document_id)
                signed_key = f"selling/compromis/{c.id}/signed.pdf"
                storage.docs_storage().put(signed_key, data, "pdf")
            except Exception:  # noqa: BLE001
                signed_key = None
            sig.signed_pdf_key, sig.status = signed_key, "completed"
            if c is not None:
                c.status, c.signed_at, c.signed_pdf_key = "signed", datetime.utcnow(), signed_key
            if inq is not None:
                inq.status = "concluded"
                enqueue(db, "compromis", c.id, events.COMPROMIS_SIGNED, {
                    "id": c.id, "account_id": inq.seller_party, "inquiry_id": inq.id,
                    "property_id": inq.property_id})
            updated += 1
        elif st in ("in_progress", "declined", "voided", "expired"):
            if st in ("declined", "voided", "expired"):
                commission_client.void("sale", sig.doc_ref_id)
            sig.status = st
            updated += 1
    db.commit()
    return {"checked": len(pending), "updated": updated}
