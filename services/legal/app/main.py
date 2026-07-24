"""Service legal — notaires + dossiers juridiques + checklists (cloisonné par agence)."""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import (
    forbidden,
    get_settings,
    install_error_handlers,
    not_found,
    setup_logging,
    setup_tracing,
)

from .checklists import default_tasks
from .db import get_db, init_db
from .models import LegalCase, LegalTask, Notary

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


def _agency(principal: Principal) -> int:
    if principal.agency_id is None:
        raise forbidden("Aucune agence associée au compte.")
    return principal.agency_id


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Notaires ----
class NotaryIn(BaseModel):
    name: str
    office: str | None = None
    city: str | None = None
    phone: str | None = None
    email: str | None = None
    license_number: str | None = None


def _notary_dict(n: Notary) -> dict:
    return {"id": n.id, "name": n.name, "office": n.office, "city": n.city,
            "phone": n.phone, "email": n.email, "license_number": n.license_number}


@app.get("/legal/notaries")
def list_notaries(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    agency_id = _agency(principal)
    rows = db.query(Notary).filter(Notary.agency_id == agency_id).all()
    return {"notaries": [_notary_dict(n) for n in rows]}


@app.post("/legal/notaries", status_code=201)
def create_notary(body: NotaryIn, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    n = Notary(agency_id=_agency(principal), **body.model_dump())
    db.add(n)
    db.commit()
    return _notary_dict(n)


def _owned_notary(db: Session, notary_id: int, principal: Principal) -> Notary:
    n = db.get(Notary, notary_id)
    if n is None or (n.agency_id != principal.agency_id and not principal.is_superadmin):
        raise not_found("Notaire introuvable.")
    return n


@app.put("/legal/notaries/{notary_id}")
def update_notary(notary_id: int, body: NotaryIn, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    n = _owned_notary(db, notary_id, principal)
    for key, value in body.model_dump().items():
        setattr(n, key, value)
    db.commit()
    return _notary_dict(n)


@app.delete("/legal/notaries/{notary_id}", status_code=204)
def delete_notary(notary_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> None:
    n = _owned_notary(db, notary_id, principal)
    db.query(LegalCase).filter(LegalCase.notary_id == n.id).update({LegalCase.notary_id: None})
    db.delete(n)
    db.commit()


# ---- Dossiers ----
class CaseIn(BaseModel):
    title: str | None = None
    case_type: str = "sale"
    notary_id: int | None = None


def _case_dict(c: LegalCase, tasks: list[LegalTask] | None = None) -> dict:
    d = {"id": c.id, "title": c.title, "case_type": c.case_type, "status": c.status,
         "notary_id": c.notary_id}
    if tasks is not None:
        d["tasks"] = [{"id": t.id, "label": t.label, "status": t.status, "position": t.position} for t in tasks]
        d["tasks_total"] = len(tasks)
        d["tasks_done"] = sum(1 for t in tasks if t.status == "done")
    return d


@app.get("/legal/cases")
def list_cases(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    agency_id = _agency(principal)
    rows = db.query(LegalCase).filter(LegalCase.agency_id == agency_id).all()
    return {"cases": [_case_dict(c) for c in rows]}


@app.post("/legal/cases", status_code=201)
def create_case(body: CaseIn, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    agency_id = _agency(principal)
    case_type = body.case_type if body.case_type in ("sale", "rental") else "sale"
    if body.notary_id is not None:
        _owned_notary(db, body.notary_id, principal)  # valide l'appartenance
    c = LegalCase(
        agency_id=agency_id,
        title=body.title or "Dossier juridique",
        case_type=case_type,
        status="open",
        notary_id=body.notary_id,
        created_by=int(principal.sub) if principal.sub.isdigit() else None,
    )
    db.add(c)
    db.flush()
    tasks = [LegalTask(legal_case_id=c.id, label=label, status="todo", position=i)
             for i, label in enumerate(default_tasks(case_type))]
    db.add_all(tasks)
    db.commit()
    return _case_dict(c, tasks)


def _owned_case(db: Session, case_id: int, principal: Principal) -> LegalCase:
    c = db.get(LegalCase, case_id)
    if c is None or (c.agency_id != principal.agency_id and not principal.is_superadmin):
        raise not_found("Dossier introuvable.")
    return c


@app.get("/legal/cases/{case_id}")
def get_case(case_id: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    c = _owned_case(db, case_id, principal)
    tasks = db.query(LegalTask).filter(LegalTask.legal_case_id == c.id).order_by(LegalTask.position).all()
    return _case_dict(c, tasks)


class TaskUpdate(BaseModel):
    status: str


@app.put("/legal/tasks/{task_id}")
def update_task(task_id: int, body: TaskUpdate, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict:
    task = db.get(LegalTask, task_id)
    if task is None:
        raise not_found("Étape introuvable.")
    _owned_case(db, task.legal_case_id, principal)  # cloisonnement agence via le dossier
    if body.status in ("todo", "in_progress", "done"):
        task.status = body.status
        db.commit()
    return {"id": task.id, "status": task.status}
