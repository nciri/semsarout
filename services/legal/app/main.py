"""Service legal — notaires + dossiers juridiques + checklists (cloisonné par agence).

Reproduit à l'identique les routes legacy `/backoffice/notaries*`, `/backoffice/legal-cases*`
(+ `/tasks`), `/backoffice/legal-tasks*` — cf. `backend/app/api/v1/backoffice/legal.py`.
Gating premium via `Principal.features` (le BFF projette `plan.has_legal` → feature `legal`) :
403 `{'error': "Fonction réservée aux plans Pro et Entreprise."}` sans le feature. Erreurs legacy
`{'error'}`. La validation d'appartenance transaction/bien à la création lit les projections
locales (TransactionRO/PropertyRO), maintenues par `transaction.*` / `listing.*`.
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing

from .checklists import default_tasks
from .db import get_db, init_db
from .models import LegalCase, LegalTask, Notary, PropertyRO, TransactionRO
from .util import err, iso, json_body

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

_NOTARY_FIELDS = ["name", "office", "city", "phone", "email", "license_number", "notes"]


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


def _gate(principal: Principal) -> JSONResponse | None:
    """Miroir de `require_legal` : agence + plan `has_legal` (projeté en feature `legal`)."""
    if principal.agency_id is None or "legal" not in principal.features:
        return err("Fonction réservée aux plans Pro et Entreprise.", 403)
    return None


def _parse_due(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _notary_dict(n: Notary) -> dict:
    return {"id": n.id, "agency_id": n.agency_id, "name": n.name, "office": n.office,
            "city": n.city, "phone": n.phone, "email": n.email,
            "license_number": n.license_number, "notes": n.notes,
            "created_at": iso(n.created_at)}


def _task_dict(t: LegalTask) -> dict:
    return {"id": t.id, "legal_case_id": t.legal_case_id, "label": t.label, "status": t.status,
            "due_date": iso(t.due_date), "assignee_id": t.assignee_id, "position": t.position,
            "notes": t.notes, "completed_at": iso(t.completed_at), "created_at": iso(t.created_at)}


def _case_dict(db: Session, c: LegalCase, include_tasks: bool = False) -> dict:
    tasks = db.query(LegalTask).filter(LegalTask.legal_case_id == c.id).all()
    notary = db.get(Notary, c.notary_id) if c.notary_id else None
    d = {
        "id": c.id, "agency_id": c.agency_id, "transaction_id": c.transaction_id,
        "property_id": c.property_id, "notary_id": c.notary_id,
        "notary": _notary_dict(notary) if notary else None,
        "title": c.title, "case_type": c.case_type, "status": c.status, "notes": c.notes,
        "tasks_total": len(tasks),
        "tasks_done": sum(1 for t in tasks if t.status == "done"),
        "created_at": iso(c.created_at),
    }
    if include_tasks:
        d["tasks"] = [_task_dict(t) for t in sorted(tasks, key=lambda x: x.position)]
    return d


def _notary_owned(db: Session, nid: int, agency_id: int) -> Notary | None:
    return db.query(Notary).filter(Notary.id == nid, Notary.agency_id == agency_id).first()


def _case_owned(db: Session, cid: int, agency_id: int) -> LegalCase | None:
    return db.query(LegalCase).filter(LegalCase.id == cid, LegalCase.agency_id == agency_id).first()


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


# ---- Notaires ----
@app.get("/backoffice/notaries")
def list_notaries(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    rows = db.query(Notary).filter(Notary.agency_id == principal.agency_id).order_by(Notary.name).all()
    return {"notaries": [_notary_dict(n) for n in rows]}


@app.post("/backoffice/notaries", status_code=201)
async def create_notary(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    data = await json_body(request)
    if not data.get("name"):
        return err("Le nom est requis", 400)
    n = Notary(agency_id=principal.agency_id, **{k: data.get(k) for k in _NOTARY_FIELDS})
    db.add(n)
    db.commit()
    return JSONResponse({"notary": _notary_dict(n)}, status_code=201)


@app.put("/backoffice/notaries/{nid}")
async def update_notary(nid: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    n = _notary_owned(db, nid, principal.agency_id)
    if not n:
        return err("Notaire introuvable", 404)
    data = await json_body(request)
    for k in _NOTARY_FIELDS:
        if k in data:
            setattr(n, k, data[k])
    db.commit()
    return {"notary": _notary_dict(n)}


@app.delete("/backoffice/notaries/{nid}")
def delete_notary(nid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    n = _notary_owned(db, nid, principal.agency_id)
    if not n:
        return err("Notaire introuvable", 404)
    (db.query(LegalCase)
     .filter(LegalCase.agency_id == principal.agency_id, LegalCase.notary_id == nid)
     .update({LegalCase.notary_id: None}))
    db.delete(n)
    db.commit()
    return {"message": "Notaire supprimé"}


# ---- Dossiers ----
@app.get("/backoffice/legal-cases")
def list_legal_cases(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    q = db.query(LegalCase).filter(LegalCase.agency_id == principal.agency_id)
    qp = request.query_params
    if qp.get("status"):
        q = q.filter(LegalCase.status == qp.get("status"))
    if qp.get("transaction_id"):
        q = q.filter(LegalCase.transaction_id == int(qp.get("transaction_id")))
    rows = q.order_by(LegalCase.created_at.desc()).all()
    return {"cases": [_case_dict(db, c) for c in rows]}


@app.post("/backoffice/legal-cases", status_code=201)
async def create_legal_case(request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    data = await json_body(request)
    aid = principal.agency_id
    txn = prop = None
    if data.get("transaction_id"):
        txn = db.query(TransactionRO).filter(
            TransactionRO.id == data["transaction_id"], TransactionRO.agency_id == aid).first()
    if data.get("property_id"):
        prop = db.query(PropertyRO).filter(
            PropertyRO.id == data["property_id"], PropertyRO.agency_id == aid).first()
    case_type = data.get("case_type")
    if txn is not None:
        case_type = "sale" if txn.transaction_type == "sale" else "rental"
    if case_type not in ("sale", "rental"):
        case_type = "sale"
    notary_id = None
    if data.get("notary_id"):
        if not _notary_owned(db, data["notary_id"], aid):
            return err("Notaire invalide", 400)
        notary_id = data["notary_id"]
    title = data.get("title") or (f"Dossier {txn.reference}" if txn else "Dossier juridique")
    uid = int(principal.sub) if principal.sub.isdigit() else None
    case = LegalCase(agency_id=aid, transaction_id=(txn.id if txn else None),
                     property_id=(prop.id if prop else None), notary_id=notary_id,
                     title=title, case_type=case_type, status="open", created_by=uid)
    db.add(case)
    db.flush()
    for i, label in enumerate(default_tasks(case_type)):
        db.add(LegalTask(legal_case_id=case.id, label=label, status="todo", position=i))
    db.commit()
    return JSONResponse({"case": _case_dict(db, case, include_tasks=True)}, status_code=201)


@app.get("/backoffice/legal-cases/{cid}")
def get_legal_case(cid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    case = _case_owned(db, cid, principal.agency_id)
    if not case:
        return err("Dossier introuvable", 404)
    return {"case": _case_dict(db, case, include_tasks=True)}


@app.put("/backoffice/legal-cases/{cid}")
async def update_legal_case(cid: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    case = _case_owned(db, cid, principal.agency_id)
    if not case:
        return err("Dossier introuvable", 404)
    data = await json_body(request)
    if "title" in data:
        case.title = data["title"]
    if "status" in data:
        case.status = data["status"]
    if "notes" in data:
        case.notes = data["notes"]
    if "notary_id" in data:
        nid = data["notary_id"]
        if nid and not _notary_owned(db, nid, principal.agency_id):
            return err("Notaire invalide", 400)
        case.notary_id = nid
    db.commit()
    return {"case": _case_dict(db, case, include_tasks=True)}


@app.delete("/backoffice/legal-cases/{cid}")
def delete_legal_case(cid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    case = _case_owned(db, cid, principal.agency_id)
    if not case:
        return err("Dossier introuvable", 404)
    db.query(LegalTask).filter(LegalTask.legal_case_id == case.id).delete()
    db.delete(case)
    db.commit()
    return {"message": "Dossier supprimé"}


# ---- Tâches ----
@app.post("/backoffice/legal-cases/{cid}/tasks", status_code=201)
async def add_task(cid: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    case = _case_owned(db, cid, principal.agency_id)
    if not case:
        return err("Dossier introuvable", 404)
    data = await json_body(request)
    if not data.get("label"):
        return err("Le libellé est requis", 400)
    maxpos = db.query(func.max(LegalTask.position)).filter(LegalTask.legal_case_id == cid).scalar()
    t = LegalTask(legal_case_id=cid, label=data["label"], status="todo",
                  due_date=_parse_due(data.get("due_date")), assignee_id=data.get("assignee_id"),
                  position=(maxpos or 0) + 1)
    db.add(t)
    db.commit()
    return JSONResponse({"task": _task_dict(t)}, status_code=201)


def _task_scoped(db: Session, tid: int, agency_id: int) -> LegalTask | None:
    """Tâche dont le dossier parent appartient à l'agence, sinon None."""
    task = db.get(LegalTask, tid)
    if not task:
        return None
    case = _case_owned(db, task.legal_case_id, agency_id)
    return task if case else None


@app.put("/backoffice/legal-tasks/{tid}")
async def update_task(tid: int, request: Request, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    t = _task_scoped(db, tid, principal.agency_id)
    if not t:
        return err("Tâche introuvable", 404)
    data = await json_body(request)
    if "label" in data:
        t.label = data["label"]
    if "assignee_id" in data:
        t.assignee_id = data["assignee_id"]
    if "position" in data:
        t.position = data["position"]
    if "notes" in data:
        t.notes = data["notes"]
    if "due_date" in data:
        t.due_date = _parse_due(data["due_date"])
    if "status" in data:
        t.status = data["status"]
        t.completed_at = datetime.utcnow() if data["status"] == "done" else None
    db.commit()
    return {"task": _task_dict(t)}


@app.delete("/backoffice/legal-tasks/{tid}")
def delete_task(tid: int, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if (g := _gate(principal)):
        return g
    t = _task_scoped(db, tid, principal.agency_id)
    if not t:
        return err("Tâche introuvable", 404)
    db.delete(t)
    db.commit()
    return {"message": "Tâche supprimée"}
