"""Service matching — API interne de scores (appelée par le BFF uniquement).

Aucune route publique : le BFF compose GET /listings avec ces scores. Garde
x-internal-token (patron geo). Projections alimentées par app/worker.py.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .db import get_db, init_db
from .service import active_weights, get_scores, set_active_weights

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


def _err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


class ScoresIn(BaseModel):
    user_id: int
    listing_ids: list[str] = Field(max_length=200)


@app.post("/internal/scores", include_in_schema=False)
def internal_scores(body: ScoresIn, x_internal_token: str = Header(default=""),
                    db: Session = Depends(get_db)):
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    return {"scores": get_scores(db, body.user_id, body.listing_ids)}


class WeightsIn(BaseModel):
    budget: float = Field(ge=0, le=1)
    lifestyle: float = Field(ge=0, le=1)


def _weights_out(w) -> dict:
    return {"version": w.version, "budget": w.budget, "lifestyle": w.lifestyle}


@app.get("/internal/weights", include_in_schema=False)
def internal_get_weights(x_internal_token: str = Header(default=""), db: Session = Depends(get_db)):
    """Pondération active du scoring (back-office super-admin, lecture)."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    return _weights_out(active_weights(db))


@app.put("/internal/weights", include_in_schema=False)
def internal_put_weights(body: WeightsIn, x_internal_token: str = Header(default=""),
                         db: Session = Depends(get_db)):
    """Édite la pondération active (back-office super-admin) : crée une nouvelle version
    horodatée et l'active (jamais d'update en place, cf. `set_active_weights`)."""
    if x_internal_token != settings.internal_token:
        return _err("Forbidden", 403)
    if abs((body.budget + body.lifestyle) - 1.0) > 0.01:
        return _err("budget + lifestyle doit être égal à 1.0", 422)
    row = set_active_weights(db, body.budget, body.lifestyle)
    return _weights_out(row)
