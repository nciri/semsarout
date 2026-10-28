"""Service notification — API de supervision (health/metrics) et suivi plateforme.

Le travail réel (consommation d'événements) est effectué par le worker
(`python -m app.worker`), pas par cette API, et les envois temporels par l'ordonnanceur
(`python -m app.scheduler`). Deux routes super-admin s'y greffent :

- `POST /admin/scheduler/run` : rejoue les jobs **maintenant**. Sans elle, un rappel manqué
  attendait le prochain réveil de l'ordonnanceur, sans moyen de forcer la main.
- `GET /admin/notifications` : journal des envois, pour répondre à « l'agence dit n'avoir
  rien reçu ».
"""
from fastapi import Depends, FastAPI, Query
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, require_superadmin
from semsar_common import get_settings, install_error_handlers, setup_logging, setup_tracing

from .db import SessionLocal
from .models import NotificationLog

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

app = FastAPI(title=f"SemsarOut — {settings.service_name}")
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.post("/admin/scheduler/run")
def run_scheduler(principal: Principal = Depends(require_superadmin)) -> dict:
    """Rejoue les jobs de l'ordonnanceur à la demande. Chaque job est idempotent : relancer
    n'envoie pas deux fois le même courriel (marquage côté service propriétaire)."""
    from . import scheduler

    scheduler.load_dotenv()
    scheduler.run_once()
    return {"ok": True}


@app.get("/admin/notifications")
def admin_notifications(limit: int = Query(100, ge=1, le=500),
                        principal: Principal = Depends(require_superadmin),
                        db: Session = Depends(get_db)) -> dict:
    """Derniers envois : canal, destinataire, gabarit, verdict."""
    rows = (db.query(NotificationLog).order_by(NotificationLog.id.desc()).limit(limit).all())
    return {"notifications": [{"id": n.id, "channel": n.channel, "recipient": n.recipient,
                               "template": n.template, "status": n.status,
                               "created_at": n.created_at.isoformat() if n.created_at else None}
                              for n in rows],
            "failed": sum(1 for n in rows if n.status == "failed")}
