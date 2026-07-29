"""Ordonnanceur léger du service notification (Vague 2) — envois d'emails temporels.

    python -m app.scheduler

Boucle de polling (DB-backed, idempotente) plutôt qu'une pile Celery/Redis : chaque « job »
interroge la source (endpoint interne du service propriétaire) pour les éléments dus, envoie
l'email et marque l'élément traité côté source. Intervalle réglable (SCHEDULER_INTERVAL_SECONDS).

Jobs actuels : rappel de visite J-1, avis post-visite J+1, relance impayé d'abonnement (dunning).
Les futurs (comptes-rendus périodiques, anniversaires — en attente des domaines gestion locative /
mandat) s'ajoutent comme des fonctions `_job_*` appelées dans `run_once`.
"""
import logging
import os
import time

import httpx

from semsar_common import setup_logging

from . import recipients
from .db import SessionLocal
from .handlers import _contact, _fmt_fr, _try_send, _valid_email, load_dotenv

logger = logging.getLogger("notification.scheduler")


def _crm() -> str:
    return os.environ.get("CRM_URL", "http://localhost:8013")


def _billing() -> str:
    return os.environ.get("BILLING_URL", "http://localhost:8508")


def _rental() -> str:
    return os.environ.get("RENTAL_URL", "http://localhost:8518")


def _headers() -> dict:
    return {"x-internal-token": os.environ.get("INTERNAL_TOKEN", "")}


def _job_visit_reminders(db) -> int:
    """Rappel J-1 : visites à venir dans 24 h, non encore rappelées."""
    try:
        r = httpx.get(f"{_crm()}/internal/visits/due-reminders", headers=_headers(), timeout=10.0)
        visits = r.json().get("visits", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for v in visits:
        to = (v.get("visitor_email") or "").strip()
        if _valid_email(to):
            date, tm = _fmt_fr(v.get("scheduled_at"))
            _try_send(db, to, "visit_reminder.html", "visit_reminder", from_email=_contact(),
                      name=v.get("contact_name"), property_title=v.get("property_title"),
                      date=date, time=tm, address=v.get("property_address"),
                      agent_name=v.get("agent_name"))
            db.commit()  # persister la ligne notification_log (le worker commit ailleurs)
            sent += 1
        # Marque traité même si email absent/invalide → pas de re-traitement en boucle.
        try:
            httpx.post(f"{_crm()}/internal/visits/{v['id']}/reminder-sent", headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent


def _job_visit_follow_ups(db) -> int:
    """Avis post-visite J+1 : visites ayant eu lieu il y a ~1 jour, sans avis encore demandé."""
    try:
        r = httpx.get(f"{_crm()}/internal/visits/due-follow-ups", headers=_headers(), timeout=10.0)
        visits = r.json().get("visits", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    base = os.environ.get("PUBLIC_BASE_URL", "http://localhost:5600")
    sent = 0
    for v in visits:
        to = (v.get("visitor_email") or "").strip()
        if _valid_email(to):
            pid = v.get("property_id")
            _try_send(db, to, "visit_follow_up.html", "visit_follow_up", from_email=_contact(),
                      name=v.get("contact_name"), property_title=v.get("property_title"),
                      property_url=(f"{base}/annonce/{pid}" if pid else None))
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_crm()}/internal/visits/{v['id']}/follow-up-sent", headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent


def _job_unpaid_invoice_reminders(db) -> int:
    """Relance impayé : factures d'abonnement non réglées, cadence J+3 puis toutes les 7 j (max 3)."""
    try:
        r = httpx.get(f"{_billing()}/internal/invoices/due-reminders", headers=_headers(), timeout=10.0)
        invoices = r.json().get("invoices", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for inv in invoices:
        agency = recipients.agency(inv.get("agency_id"))
        to = (agency.get("email") or "").strip()
        if _valid_email(to):
            _try_send(db, to, "invoice_reminder.html", "invoice_reminder", from_email=_contact(),
                      agency_name=agency.get("name"), reference=inv.get("reference"),
                      amount=inv.get("amount"), period_label=inv.get("period_label"),
                      reminder_count=inv.get("reminder_count", 0))
            db.commit()
            sent += 1
        # Marque relancé même si email absent/invalide → pas de re-traitement en boucle.
        try:
            httpx.post(f"{_billing()}/internal/invoices/{inv['id']}/reminder-sent",
                       headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent


def _job_rent_overdue_reminders(db) -> int:
    """Relance loyer impayé : échéances non réglées, cadence J+3 puis toutes les 7 j (max 3)."""
    try:
        r = httpx.get(f"{_rental()}/internal/rent-periods/due-reminders", headers=_headers(), timeout=10.0)
        periods = r.json().get("rent_periods", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for rp in periods:
        tenant = recipients.client(rp.get("tenant_client_id"))
        to = (tenant.get("email") or "").strip()
        if _valid_email(to):
            _try_send(db, to, "rent_overdue.html", "rent_overdue", from_email=_contact(),
                      name=tenant.get("name"), period_label=rp.get("period_label"),
                      total_amount=rp.get("total_amount"), reminder_count=rp.get("reminder_count", 0))
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_rental()}/internal/rent-periods/{rp['id']}/reminder-sent",
                       headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent


def _job_landlord_payouts(db) -> int:
    """Avis de virement : loyers encaissés à reverser au propriétaire (net des honoraires)."""
    try:
        r = httpx.get(f"{_rental()}/internal/rent-periods/due-payouts", headers=_headers(), timeout=10.0)
        periods = r.json().get("rent_periods", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for rp in periods:
        landlord = recipients.client(rp.get("landlord_client_id"))
        to = (landlord.get("email") or "").strip()
        if _valid_email(to):
            _try_send(db, to, "landlord_payout.html", "landlord_payout", from_email=_contact(),
                      name=landlord.get("name"), period_label=rp.get("period_label"),
                      gross_amount=rp.get("gross_amount"), fee_percent=rp.get("fee_percent"),
                      net_amount=rp.get("net_amount"))
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_rental()}/internal/rent-periods/{rp['id']}/payout-sent",
                       headers=_headers(), timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent


def _job_generate_rent_periods(db) -> int:
    """Génère l'échéance du mois courant pour chaque bail actif (idempotent côté rental)."""
    try:
        r = httpx.post(f"{_rental()}/internal/rent-periods/generate", headers=_headers(), timeout=15.0)
        return r.json().get("created", 0) if r.status_code == 200 else 0
    except (httpx.HTTPError, ValueError):
        return 0


def _job_crg_reports(db) -> int:
    """CRG mensuel : récapitulatif des loyers encaissés le mois dernier, au propriétaire."""
    try:
        r = httpx.get(f"{_rental()}/internal/mandates/due-crg", headers=_headers(), timeout=10.0)
        reports = r.json().get("reports", []) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return 0
    sent = 0
    for rep in reports:
        landlord = recipients.client(rep.get("landlord_client_id"))
        to = (landlord.get("email") or "").strip()
        if _valid_email(to):
            _try_send(db, to, "crg_report.html", "crg_report", from_email=_contact(),
                      name=landlord.get("name"), period_label=rep.get("period_label"),
                      rent_collected=rep.get("rent_collected"), fees=rep.get("fees"),
                      net=rep.get("net"))
            db.commit()
            sent += 1
        try:
            httpx.post(f"{_rental()}/internal/mandates/{rep['mandate_id']}/crg-sent",
                       headers=_headers(), json={k: rep[k] for k in ("rent_collected", "fees", "net")},
                       timeout=10.0)
        except httpx.HTTPError:
            pass
    return sent


def run_once() -> None:
    db = SessionLocal()
    try:
        n = _job_visit_reminders(db)
        if n:
            logger.info("rappels de visite envoyés", extra={"count": n})
        f = _job_visit_follow_ups(db)
        if f:
            logger.info("avis post-visite envoyés", extra={"count": f})
        i = _job_unpaid_invoice_reminders(db)
        if i:
            logger.info("relances impayé envoyées", extra={"count": i})
        ro = _job_rent_overdue_reminders(db)
        if ro:
            logger.info("relances loyer envoyées", extra={"count": ro})
        g = _job_generate_rent_periods(db)
        if g:
            logger.info("échéances de loyer générées", extra={"count": g})
        po = _job_landlord_payouts(db)
        if po:
            logger.info("avis de virement envoyés", extra={"count": po})
        cr = _job_crg_reports(db)
        if cr:
            logger.info("CRG envoyés", extra={"count": cr})
    except Exception:  # noqa: BLE001 — un job qui échoue ne doit pas tuer la boucle
        logger.exception("échec d'un job d'ordonnanceur")
    finally:
        db.close()


def main() -> None:
    load_dotenv()
    setup_logging("notification-scheduler", os.environ.get("LOG_LEVEL", "INFO"))
    interval = int(os.environ.get("SCHEDULER_INTERVAL_SECONDS", "900"))  # 15 min par défaut
    logger.info("ordonnanceur démarré", extra={"interval_s": interval})
    while True:
        run_once()
        time.sleep(interval)


if __name__ == "__main__":
    main()
