"""Service commission — moteur de compteur d'affaires + gate de facturation."""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import desc
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .db import get_db, init_db
from .models import CommissionRule
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
