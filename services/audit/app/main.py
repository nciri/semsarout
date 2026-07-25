"""Service audit — journal d'audit transverse (lecture). Reroute `GET /admin/activity`
du monolithe (super-admin). Erreurs legacy `{'error'}`. `user_name` via projection `user_ro`.
"""
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import forbidden, get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .db import get_db, init_db
from .models import ActivityLog, UserRO

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


def _err(msg, code):
    return JSONResponse({"error": msg}, status_code=code)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/admin/activity")
def list_activity(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if not principal.is_superadmin:
        raise forbidden("Super-admin access required")
    qp = request.query_params
    page = int(qp.get("page") or 1)
    per_page = int(qp.get("per_page") or 30)
    q = db.query(ActivityLog)
    if qp.get("entity_type"):
        q = q.filter(ActivityLog.entity_type == qp.get("entity_type"))
    if qp.get("actor_id"):
        q = q.filter(ActivityLog.user_id == int(qp.get("actor_id")))
    q = q.order_by(ActivityLog.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    names = {u.id: u.full_name for u in db.query(UserRO).filter(
        UserRO.id.in_([i.user_id for i in items if i.user_id])).all()}
    return {"items": [i.to_dict(user_name=names.get(i.user_id)) for i in items],
            "total": total, "page": page, "pages": pages}
