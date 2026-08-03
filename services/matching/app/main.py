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
from .service import get_scores

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
