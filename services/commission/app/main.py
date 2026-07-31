"""Service commission — moteur de compteur d'affaires + gate de facturation."""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import desc
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, payment_client
from .db import get_db, init_db
from .models import CommissionRule, Conclusion, DealCounter
from .util import err, iso, json_body

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


_DEAL_TYPES = {"rental", "sale"}
_DEFAULT_AMOUNT = 4999


def active_rule(db: Session, deal_type: str) -> CommissionRule:
    rule = (db.query(CommissionRule).filter(CommissionRule.deal_type == deal_type)
            .order_by(desc(CommissionRule.active_from)).first())
    if rule is None:
        rule = CommissionRule(deal_type=deal_type, flat_amount=_DEFAULT_AMOUNT, currency="MAD")
        db.add(rule)
        db.flush()
    return rule


def _rule_dict(r: CommissionRule) -> dict:
    return {"id": r.id, "deal_type": r.deal_type, "flat_amount": float(r.flat_amount),
            "currency": r.currency, "active_from": iso(r.active_from)}


@app.get("/backoffice/commission/rules")
def list_rules(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return err("Réservé à l'administration.", 403)
    rows = db.query(CommissionRule).order_by(desc(CommissionRule.active_from)).all()
    return {"rules": [_rule_dict(r) for r in rows]}


@app.post("/backoffice/commission/rules", status_code=201)
async def create_rule(request: Request, principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        return err("Réservé à l'administration.", 403)
    data = await json_body(request)
    if data.get("deal_type") not in _DEAL_TYPES:
        return err("deal_type invalide.", 400)
    try:
        amount = float(data["flat_amount"])
    except (KeyError, TypeError, ValueError):
        return err("flat_amount requis.", 400)
    r = CommissionRule(deal_type=data["deal_type"], flat_amount=amount, currency=data.get("currency", "MAD"))
    db.add(r)
    db.commit()
    return {"rule": _rule_dict(r)}


def _counter(db: Session, account_id: int) -> DealCounter:
    c = db.get(DealCounter, account_id)
    if c is None:
        c = DealCounter(account_id=account_id, concluded_count=0, first_deal_free_used=False)
        db.add(c)
        db.flush()
    return c


def decide_gate(db: Session, account_id: int, deal_type: str, source_ref: int) -> Conclusion:
    concl = (db.query(Conclusion)
             .filter(Conclusion.deal_type == deal_type, Conclusion.source_ref == source_ref).first())
    if concl is not None:
        return concl
    counter = _counter(db, account_id)
    if not counter.first_deal_free_used:
        # réserve la 1re affaire offerte pour cette conclusion
        concl = Conclusion(account_id=account_id, deal_type=deal_type, source_ref=source_ref,
                           billable=False, commission_amount=0, paid=True, status="pending")
        db.add(concl)
        db.flush()
        counter.first_deal_free_used = True
        counter.free_conclusion_id = concl.id
    else:
        rule = active_rule(db, deal_type)
        concl = Conclusion(account_id=account_id, deal_type=deal_type, source_ref=source_ref,
                           billable=True, commission_amount=rule.flat_amount, paid=False, status="pending")
        db.add(concl)
        db.flush()
        ref, pay_url = payment_client.create_commission_intent(
            account_id=account_id, amount=float(rule.flat_amount),
            deal_type=deal_type, source_ref=source_ref)
        concl.invoice_ref = ref
        concl.pay_url = pay_url
        enqueue(db, "conclusion", concl.id, events.COMMISSION_DUE, {
            "conclusion_id": concl.id, "account_id": account_id, "deal_type": deal_type,
            "source_ref": source_ref, "amount": float(rule.flat_amount),
            "invoice_ref": ref, "purpose": "commission"})
    return concl


def _gate_response(concl: Conclusion) -> dict:
    if not concl.billable or concl.paid:
        return {"state": "OPEN", "billable": concl.billable,
                "invoice_ref": concl.invoice_ref, "pay_url": None}
    return {"state": "BLOCKED", "billable": True,
            "invoice_ref": concl.invoice_ref, "pay_url": concl.pay_url}


@app.get("/internal/commission/gate")
def gate(account_id: int, deal_type: str, source_ref: int, db: Session = Depends(get_db)):
    if deal_type not in _DEAL_TYPES:
        return err("deal_type invalide.", 400)
    concl = decide_gate(db, account_id, deal_type, source_ref)
    db.commit()
    return _gate_response(concl)
