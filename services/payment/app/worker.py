"""Worker payment — projections tarifaires alimentées par billing.

    python -m app.worker

- `billing.service_price.changed` → `service_price_ro` (prix des prestations ponctuelles) ;
- `billing.plan.changed` → `plan_ro` (prix des abonnements).

Pourquoi ce worker existe : le montant prélevé venait d'une grille en dur dans ce service, et
pouvait donc différer de ce que le site affichait. `plan_ro`, de son côté, n'était alimentée par
RIEN — tout paiement d'abonnement échouait faute de prix. Les deux trous se ferment ici.

**Idempotent** (dédup par message_id), et les deux projections sont amorcées au démarrage depuis
l'endpoint interne de billing : sans cela, un payment neuf refuserait tout paiement jusqu'au
premier changement de prix.
"""
import logging
import os

import httpx

from semsar_common import get_settings, setup_logging
from semsar_events import EventConsumer

from .db import SessionLocal, init_db
from .models import PlanRO, ProcessedMessage, ServicePriceRO

logger = logging.getLogger("payment.worker")


def _billing() -> str:
    return os.environ.get("BILLING_URL", "http://localhost:8508")


def _upsert_service_price(db, payload: dict) -> None:
    code = payload.get("code")
    if not code or payload.get("amount") is None:
        return
    sp = db.get(ServicePriceRO, code)
    if sp is None:
        sp = ServicePriceRO(code=code)
        db.add(sp)
    sp.amount = payload["amount"]
    sp.kind = payload.get("kind")
    # Absent d'un événement de changement de montant : une prestation dont on apprend le prix
    # est active, sauf mention contraire explicite.
    sp.is_active = bool(payload.get("is_active", True))


def _upsert_plan(db, payload: dict) -> None:
    pid = payload.get("id")
    if pid is None:
        return
    plan = db.get(PlanRO, pid)
    if plan is None:
        plan = PlanRO(id=pid)
        db.add(plan)
    plan.slug = payload.get("slug")
    plan.price_monthly = payload.get("price_monthly")
    plan.price_yearly = payload.get("price_yearly")


def _handle(routing_key: str, payload: dict, message_id: str) -> None:
    db = SessionLocal()
    try:
        if message_id and db.get(ProcessedMessage, message_id) is not None:
            return  # idempotence
        if routing_key == "billing.service_price.changed":
            _upsert_service_price(db, payload)
        elif routing_key == "billing.plan.changed":
            _upsert_plan(db, payload)
        if message_id:
            db.add(ProcessedMessage(message_id=message_id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def backfill() -> None:
    """Amorçage des projections vides. Best-effort : billing indisponible au démarrage ne doit
    pas empêcher le worker de tourner, les événements suivants rattraperont. Une projection déjà
    peuplée n'est pas réécrite — un prix reçu par événement est plus récent."""
    db = SessionLocal()
    try:
        if db.query(ServicePriceRO).count() or db.query(PlanRO).count():
            return
        try:
            r = httpx.get(f"{_billing()}/internal/service-prices",
                          headers={"x-internal-token": get_settings().internal_token},
                          timeout=10.0)
            if r.status_code != 200:
                logger.warning("amorçage tarifaire refusé", extra={"status": r.status_code})
                return
            body = r.json()
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("amorçage tarifaire impossible", extra={"error": str(e)})
            return
        for s in body.get("services", []):
            _upsert_service_price(db, s)
        for p in body.get("plans", []):
            _upsert_plan(db, p)
        db.commit()
        logger.info("projections tarifaires amorcées",
                    extra={"services": len(body.get("services", [])),
                           "plans": len(body.get("plans", []))})
    finally:
        db.close()


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    if settings.database_url:
        init_db()
    backfill()
    consumer = EventConsumer(settings.rabbitmq_url, service_name=settings.service_name,
                             bindings=["billing.service_price.changed", "billing.plan.changed"],
                             exchange=settings.events_exchange)
    consumer.run(handler=_handle)


if __name__ == "__main__":
    main()
