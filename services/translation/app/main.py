"""Service translation — traduction FR↔AR à la volée du contenu dynamique (Azure Translator).

`POST /v1/translate` : cache Postgres devant Azure Translator Text API v3.0 (voir
`app/cache.py` + `app/azure_client.py`). Endpoint interne mesh (pas de contrat legacy
à reproduire) → erreurs au format RFC 9457.
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from semsar_common import Problem, install_error_handlers, setup_logging, setup_tracing
from sqlalchemy.orm import Session

from .azure_client import AzureTranslatorClient, AzureTranslatorError
from .cache import translate_batch
from .config import get_settings
from .db import get_db, init_db
from .schemas import MAX_TOTAL_CHARS, TranslateRequest, TranslateResponse

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)


def get_azure_client() -> AzureTranslatorClient:
    return AzureTranslatorClient(
        key=settings.azure_translator_key,
        endpoint=settings.azure_translator_endpoint,
        region=settings.azure_translator_region,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        init_db()
    yield


app = FastAPI(title=f"SemsarOut — {settings.service_name}", lifespan=lifespan)
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001 — tracing best-effort, ne bloque jamais le démarrage
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.post("/v1/translate", response_model=TranslateResponse)
def translate(
    payload: TranslateRequest,
    db: Session = Depends(get_db),
    azure: AzureTranslatorClient = Depends(get_azure_client),
) -> TranslateResponse:
    total_chars = sum(len(t) for t in payload.texts)
    if total_chars > MAX_TOTAL_CHARS:
        raise Problem(
            422, "Unprocessable Entity",
            f"volume total de texte ({total_chars}) au-delà de {MAX_TOTAL_CHARS} caractères",
        )
    try:
        items = translate_batch(
            db, azure, texts=payload.texts, target=payload.target, source=payload.source
        )
    except AzureTranslatorError as exc:
        raise Problem(exc.status_code or 502, "Erreur Azure Translator", exc.message) from exc
    return TranslateResponse(translations=items)
