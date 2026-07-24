"""Service identity — 1ᵉʳ service extrait (validation du flux bout-en-bout).

Démonstration : une mutation métier (demande de vérification CIN) écrit son
événement dans l'**outbox** DANS LA MÊME TRANSACTION, puis un relais le publie sur
RabbitMQ (`identity.kyc.requested`). Le BFF route `/api/v1/identity/*` vers ce service.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel
from sqlalchemy.orm import Session

from semsar_common import get_settings, install_error_handlers, not_found, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import KycVerification

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


class KycRequest(BaseModel):
    user_id: int
    cin: str


@app.post("/identity/kyc", status_code=201)
def request_kyc(body: KycRequest, db: Session = Depends(get_db)) -> dict:
    record = KycVerification(user_id=body.user_id, cin=body.cin, status="pending")
    db.add(record)
    db.flush()  # obtient l'id sans commit
    # Événement écrit dans la MÊME transaction que la donnée (outbox) :
    enqueue(
        db,
        aggregate_type="kyc_verification",
        aggregate_id=record.id,
        event_type=events.KYC_REQUESTED,
        payload={"user_id": body.user_id, "cin_last4": body.cin[-4:]},
    )
    db.commit()
    return {"id": record.id, "status": record.status}


@app.get("/identity/kyc/{kyc_id}")
def get_kyc(kyc_id: int, db: Session = Depends(get_db)) -> dict:
    record = db.get(KycVerification, kyc_id)
    if record is None:
        raise not_found("Vérification introuvable.")
    return {"id": record.id, "user_id": record.user_id, "status": record.status}
