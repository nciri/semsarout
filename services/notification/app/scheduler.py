"""Ordonnanceur léger du service notification (Vague 2) — envois d'emails temporels.

    python -m app.scheduler

Boucle de polling (DB-backed, idempotente) plutôt qu'une pile Celery/Redis : chaque « job »
interroge la source (endpoint interne du service propriétaire) pour les éléments dus, envoie
l'email et marque l'élément traité côté source. Intervalle réglable (SCHEDULER_INTERVAL_SECONDS).

Jobs actuels : rappel de visite J-1. Les futurs (avis post-visite, comptes-rendus périodiques,
relances, anniversaires) s'ajoutent comme des fonctions `_job_*` appelées dans `run_once`.
"""
import logging
import os
import time

import httpx

from semsar_common import setup_logging

from .db import SessionLocal
from .handlers import _contact, _fmt_fr, _try_send, _valid_email, load_dotenv

logger = logging.getLogger("notification.scheduler")


def _crm() -> str:
    return os.environ.get("CRM_URL", "http://localhost:8013")


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


def run_once() -> None:
    db = SessionLocal()
    try:
        n = _job_visit_reminders(db)
        if n:
            logger.info("rappels de visite envoyés", extra={"count": n})
        f = _job_visit_follow_ups(db)
        if f:
            logger.info("avis post-visite envoyés", extra={"count": f})
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
