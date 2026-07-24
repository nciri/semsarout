"""Service contract — rédaction des contrats + **archivage WORM** à la finalisation.

À la finalisation, le document est écrit dans le bucket WORM (immuable, valeur probante),
`worm_key` est enregistré, et l'événement `contract.finalized` est émis via l'outbox.
Toutes les routes sont cloisonnées par agence (issue du JWT — anti-IDOR).
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import (
    Problem,
    conflict,
    forbidden,
    get_settings,
    install_error_handlers,
    not_found,
    setup_logging,
    setup_tracing,
)
from semsar_events import enqueue

from . import events
from .db import get_db, init_db
from .models import Contract
from .storage import worm_archive

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


def _owned(db: Session, contract_id: int, principal: Principal) -> Contract:
    record = db.get(Contract, contract_id)
    if record is None:
        raise not_found("Contrat introuvable.")
    if record.agency_id != principal.agency_id and not principal.is_superadmin:
        raise forbidden("Contrat d'une autre agence.")
    return record


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


class ContractCreate(BaseModel):
    title: str
    document_type: str = "other"
    body_html: str | None = None


@app.post("/contract/contracts", status_code=201)
def create_contract(
    body: ContractCreate,
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
) -> dict:
    if principal.agency_id is None:
        raise forbidden("Aucune agence associée au compte.")
    record = Contract(
        agency_id=principal.agency_id,
        title=body.title,
        document_type=body.document_type,
        body_html=body.body_html,
        status="draft",
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
    )
    db.add(record)
    db.commit()
    return {"id": record.id, "status": record.status}


@app.get("/contract/contracts/{contract_id}")
def get_contract(
    contract_id: int,
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
) -> dict:
    c = _owned(db, contract_id, principal)
    return {"id": c.id, "title": c.title, "status": c.status, "worm_key": c.worm_key}


@app.post("/contract/contracts/{contract_id}/finalize")
def finalize_contract(
    contract_id: int,
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
) -> dict:
    c = _owned(db, contract_id, principal)
    if c.status != "draft":
        raise conflict("Le contrat n'est pas au statut brouillon.")

    # Archivage WORM (immuable) — en cible, le HTML est rendu en PDF avant archivage.
    key = f"contracts/{c.agency_id}/{c.id}.html"
    try:
        archive = worm_archive()
        archive.setup()
        archive.archive(key, (c.body_html or "").encode("utf-8"), content_type="text/html")
    except Exception as exc:  # noqa: BLE001
        raise Problem(502, "Storage Error", "Échec de l'archivage WORM.") from exc

    c.status = "finalized"
    c.worm_key = key
    enqueue(
        db,
        aggregate_type="contract",
        aggregate_id=c.id,
        event_type=events.CONTRACT_FINALIZED,
        payload={"contract_id": c.id, "agency_id": c.agency_id, "worm_key": key},
    )
    db.commit()
    return {"id": c.id, "status": c.status, "worm_key": key}
