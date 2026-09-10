"""Service design3d — conception intérieure : plans 2D (brique 1), scènes 3D et rendus (briques 2-3).

Routes `/design3d/*` gatées par l'entitlement `design3d` (patron directory/`require_feature`).
Cloisonnement : agence → même agency_id ; sans agence → owner_id (patron listing/_bo_access).
"""
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Query, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from fastapi.responses import Response as RawResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel
from sqlalchemy.orm import Session

from semsar_auth import Principal, require_feature
from semsar_common import get_settings, install_legacy_error_handlers, setup_logging, setup_tracing
from semsar_events import enqueue

from . import events, storage, targets
from .db import get_db, init_db
from .geometry import calibration_scale, rescale
from .models import EMPTY_GEOMETRY, DesignLevel, DesignLevelShelf, DesignProject, _now, _uuid
from .schemas import CalibrationIn, LevelCreateIn, LevelUpdateIn, ProjectCreateIn, ProjectUpdateIn, validate_geometry

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)
_design3d = require_feature("design3d")


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


def _err(msg: str, code: int, **extra) -> JSONResponse:
    return JSONResponse({"error": msg, **extra}, status_code=code)


def _uid(principal: Principal) -> int | None:
    return int(principal.sub) if principal.sub and str(principal.sub).isdigit() else None


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


def _access(p: DesignProject, principal: Principal):
    if principal.agency_id:
        if p.agency_id != principal.agency_id:
            return _err("Access denied", 403)
    elif p.owner_id != _uid(principal):
        return _err("Access denied", 403)
    return None


def _levels(db: Session, project_id: str) -> list[DesignLevel]:
    return db.query(DesignLevel).filter(DesignLevel.project_id == project_id).order_by(DesignLevel.position, DesignLevel.created_at).all()


def _load(db: Session, project_id: str, principal: Principal):
    p = db.get(DesignProject, project_id)
    if p is None:
        return None, _err("Not found", 404)
    denied = _access(p, principal)
    return (None, denied) if denied else (p, None)


def _target_denied(target_type: str, target_id: int, principal: Principal, uid: int):
    """La cible visée doit relever du périmètre de l'appelant.

    Sans ce contrôle, le cloisonnement agence ne s'applique qu'aux projets, jamais
    à la désignation de leur cible : n'importe quel abonné pouvait créer un projet
    visant le bien d'une AUTRE agence, le publier, et faire apparaître son plan sur
    la fiche publique de cette agence — sans que la victime puisse le retirer,
    `_access` la tenant à l'écart du projet de l'attaquant.

    Mode dégradé : si le service qui fait autorité sur la cible ne répond pas, la
    création est REFUSÉE. Sur ce dépôt, l'incertitude d'autorisation se tranche en
    fermant (précédent : le webhook KYC d'identity rejette quand aucun secret n'est
    configuré). Le 503 est explicitement rejouable, contrairement à un 403.

    `error_code="target_denied"` marque les deux refus DÉFINITIFS ci-dessous (403
    et 404). Il existe parce que `POST /design3d/projects` a une autre garde,
    `require_feature("design3d")` (Depends, donc exécutée avant même ce contrôle),
    qui répond aussi 403 — pour une tout autre raison, l'absence d'entitlement de
    plan, qui elle EST rejouable (l'agence peut réactiver son abonnement). Le
    client (`design3dSync.js`) ne doit marquer un projet comme définitivement
    perdu que sur la foi de ce code explicite, jamais en déduisant l'intention du
    seul statut HTTP 403 partagé par les deux gardes.
    """
    try:
        owner = targets.fetch_owner(target_type, target_id)
    except targets.TargetUnavailable:
        return _err("Vérification de la cible indisponible, réessayez", 503)
    if owner.get("owner_id") is None and owner.get("agency_id") is None:
        return _err("Cible introuvable", 404, error_code="target_denied")
    if principal.agency_id:
        if owner.get("agency_id") != principal.agency_id:
            return _err("Cible hors du périmètre de votre agence", 403, error_code="target_denied")
    elif owner.get("owner_id") != uid:
        return _err("Cible hors de votre périmètre", 403, error_code="target_denied")
    return None


@app.post("/design3d/projects", status_code=201)
def create_project(body: ProjectCreateIn, request: Request, principal: Principal = Depends(_design3d),
                   db: Session = Depends(get_db)):
    uid = _uid(principal)
    if uid is None:
        return _err("Authentification requise", 401)
    denied = _target_denied(body.target_type, body.target_id, principal, uid)
    if denied is not None:
        return denied
    existing = db.get(DesignProject, body.id) if body.id else None
    if existing is not None:
        if existing.owner_id != uid:
            return _err("Identifiant déjà utilisé", 409)
        return JSONResponse(existing.to_dict(_levels(db, existing.id)), status_code=201)  # idempotent (rejeu outbox)
    p = DesignProject(id=body.id or _uuid(), tenant=request.headers.get("x-semsar-tenant") or "semsar",
                      agency_id=principal.agency_id, owner_id=uid, target_type=body.target_type,
                      target_id=body.target_id, title=body.title)
    db.add(p)
    db.flush()
    db.add(DesignLevel(project_id=p.id, name="RDC", position=0, geometry=dict(EMPTY_GEOMETRY), revision_author_id=uid))
    enqueue(db, "design_project", p.id, events.PROJECT_CREATED, {"id": p.id, "target_type": p.target_type, "target_id": p.target_id})
    db.commit()
    return JSONResponse(p.to_dict(_levels(db, p.id)), status_code=201)


@app.get("/design3d/projects")
def list_projects(target_type: str | None = None, target_id: int | None = None,
                  # Borné DES DEUX CÔTÉS : sans borne basse, `?limit=-1` passait la
                  # validation, était ignoré par SQLite (d'où des suites vertes
                  # trompeuses) et REFUSÉ par PostgreSQL — un 500 en production sur une
                  # requête malformée, au lieu du 422 qui la décrit. La borne haute, elle,
                  # protège la réponse, qui porte désormais les résumés de niveaux.
                  limit: int = Query(50, ge=1, le=100),
                  principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    q = db.query(DesignProject)
    q = q.filter(DesignProject.agency_id == principal.agency_id) if principal.agency_id else q.filter(DesignProject.owner_id == _uid(principal))
    if target_type:
        q = q.filter(DesignProject.target_type == target_type)
    if target_id is not None:
        q = q.filter(DesignProject.target_id == target_id)
    q = q.order_by(DesignProject.updated_at.desc())
    no_target = not target_type and target_id is None
    if no_target:
        q = q.limit(limit)
    projects = q.all()
    out = [p.to_dict() for p in projects]

    # Sans cible, c'est la liste du dialogue de reprise d'un plan : elle porte le
    # RÉSUMÉ des niveaux — identifiant, nom, position, hauteur sous plafond — et
    # JAMAIS leur géométrie, que l'appelant ne charge que pour le niveau
    # effectivement choisi. Le client faisait sinon un `GET` par projet, jusqu'à
    # 51, tous dans un cache hors-ligne plafonné à 60 entrées : la reprise vidait
    # le cache de l'agent par la porte de derrière. Renvoyer les niveaux
    # COMPLETS serait pire : la géométrie peut atteindre 512 Ko par niveau.
    #
    # Les niveaux sont lus en une seule requête (jamais un `SELECT` par projet),
    # et la forme de la réponse est inchangée pour les appelants qui fournissent
    # une cible : eux n'ont pas de clé `levels`, comme avant.
    if no_target and projects:
        rows = (db.query(DesignLevel)
                  .filter(DesignLevel.project_id.in_([p.id for p in projects]))
                  .order_by(DesignLevel.position)
                  .all())
        by_project: dict[str, list[dict]] = {}
        for lv in rows:
            by_project.setdefault(lv.project_id, []).append(
                {"id": lv.id, "name": lv.name, "position": lv.position, "wall_height_m": float(lv.wall_height_m)})
        for d in out:
            d["levels"] = by_project.get(d["id"], [])

    return {"projects": out}


@app.get("/design3d/projects/{project_id}")
def get_project(project_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    return err or p.to_dict(_levels(db, p.id))


@app.put("/design3d/projects/{project_id}")
def update_project(project_id: str, body: ProjectUpdateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    if body.title is not None:
        p.title = body.title
    if body.status is not None and body.status != p.status:
        p.status = body.status
        if body.status == "ready":
            enqueue(db, "design_project", p.id, events.PROJECT_READY, {"id": p.id, "target_type": p.target_type, "target_id": p.target_id})
    db.commit()
    return p.to_dict(_levels(db, p.id))


@app.delete("/design3d/projects/{project_id}", status_code=204)
def delete_project(project_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    enqueue(db, "design_project", p.id, events.PROJECT_DELETED, {"id": p.id})
    db.delete(p)
    db.commit()
    return Response(status_code=204)


@app.post("/design3d/projects/{project_id}/levels", status_code=201)
def create_level(project_id: str, body: LevelCreateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    p, err = _load(db, project_id, principal)
    if err:
        return err
    existing = db.get(DesignLevel, body.id) if body.id else None
    if existing is not None:
        if existing.project_id != p.id:
            return _err("Identifiant déjà utilisé", 409)
        return JSONResponse(existing.to_dict(), status_code=201)  # idempotent (rejeu outbox)
    position = body.position or len(_levels(db, p.id))
    lv = DesignLevel(id=body.id or _uuid(), project_id=p.id, name=body.name, position=position,
                     geometry=dict(EMPTY_GEOMETRY), revision_author_id=_uid(principal))
    db.add(lv)
    db.commit()
    return JSONResponse(lv.to_dict(), status_code=201)


def _load_level(db: Session, level_id: str, principal: Principal, *, for_update: bool = False):
    """`for_update` : à réserver aux chemins qui ÉCRIVENT le niveau (voir `_claim_level`).

    Un verrou de ligne pris sur les lectures — publiques comprises — sérialiserait
    l'affichage d'une annonce derrière la moindre édition en cours.
    """
    lv = db.get(DesignLevel, level_id, with_for_update=for_update or None)
    if lv is None:
        return None, None, _err("Not found", 404)
    p, err = _load(db, lv.project_id, principal)
    return (None, None, err) if err else (lv, p, None)


def _claim_level(db: Session, lv: DesignLevel) -> bool:
    """Réserve la révision suivante du niveau, ou renonce si un autre l'a déjà prise.

    Le contrôle `base_revision` ne compare qu'à la révision LUE au début de la
    requête : deux écritures concurrentes du même auteur, parties de la même
    `base_revision`, le passaient toutes les deux, la seconde écrasant la
    première sans conflit ni mise sur l'étagère — et la révision n'avançait que
    d'un cran pour deux écritures. La politique « le propriétaire gagne +
    étagère » est inchangée : elle s'applique toujours en amont, sur la révision
    lue sous verrou.

    Deux protections superposées, parce qu'aucune ne suffit seule :
    `_load_level(for_update=True)` sérialise les transactions sur PostgreSQL (la
    seconde attend, puis relit la révision publiée par la première) ; ce
    `UPDATE … WHERE revision = :lue` garantit l'absence de mise à jour perdue
    même là où le verrou n'est pas honoré — SQLite, sur lequel tourne la suite.
    """
    claimed = (db.query(DesignLevel)
                 .filter(DesignLevel.id == lv.id, DesignLevel.revision == lv.revision)
                 .update({DesignLevel.revision: DesignLevel.revision + 1}, synchronize_session=False))
    return claimed == 1


def _concurrent_write() -> JSONResponse:
    return _err("Ce niveau vient d'être modifié, réessayez", 409)


@app.delete("/design3d/levels/{level_id}", status_code=204)
def delete_level(level_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    if len(_levels(db, p.id)) <= 1:
        return _err("Un projet doit garder au moins un niveau", 400)
    db.delete(lv)
    db.commit()
    return Response(status_code=204)


def _shelve(db: Session, lv: DesignLevel, author_id: int, geometry, calibration, wall_height_m, base_revision: int) -> None:
    """Une seule entrée non revue par (niveau, auteur) : la précédente est remplacée."""
    prev = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.author_id == author_id,
                                              DesignLevelShelf.reviewed_at.is_(None)).first()
    if prev is not None:
        db.delete(prev)
    db.add(DesignLevelShelf(level_id=lv.id, author_id=author_id, geometry=geometry, calibration=calibration,
                            wall_height_m=wall_height_m, base_revision=base_revision))


@app.put("/design3d/levels/{level_id}")
def update_level(level_id: str, body: LevelUpdateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal, for_update=True)
    if err:
        return err
    uid = _uid(principal)
    is_owner = uid == p.owner_id
    height = body.wall_height_m if body.wall_height_m is not None else float(lv.wall_height_m)
    # Une hauteur de mur envoyée seule — ce que fait le panneau de propriétés
    # quand seule la hauteur change — doit être confrontée à la géométrie DÉJÀ
    # stockée : la baisser laissait sinon passer des ouvertures dont l'allège
    # plus la hauteur dépassent le mur, l'invariant même que la 3D consommera.
    if body.geometry is not None or body.wall_height_m is not None:
        problems = validate_geometry(body.geometry if body.geometry is not None else lv.geometry, height)
        if problems:
            return JSONResponse({"error": "Géométrie invalide", "details": problems}, status_code=422)
    shelved = False
    if body.base_revision < lv.revision:
        if not is_owner:
            _shelve(db, lv, uid, body.geometry if body.geometry is not None else lv.geometry,
                    body.calibration.model_dump() if body.calibration else lv.calibration, height, body.base_revision)
            db.commit()
            return JSONResponse({"error": "Version obsolète : le propriétaire a modifié ce niveau",
                                 "level": lv.to_dict()}, status_code=409)
        if lv.revision_author_id not in (None, p.owner_id):
            _shelve(db, lv, lv.revision_author_id, lv.geometry, lv.calibration, float(lv.wall_height_m), lv.revision)
            shelved = True
    if not _claim_level(db, lv):
        db.rollback()
        return _concurrent_write()
    for field in ("name", "position", "show_background_public"):
        v = getattr(body, field)
        if v is not None:
            setattr(lv, field, v)
    if body.wall_height_m is not None:
        lv.wall_height_m = body.wall_height_m
    if body.calibration is not None:
        lv.calibration = body.calibration.model_dump()
    if body.geometry is not None:
        lv.geometry = body.geometry
    lv.revision += 1
    lv.revision_author_id = uid
    enqueue(db, "design_level", lv.id, events.LEVEL_UPDATED, {"id": lv.id, "project_id": p.id, "revision": lv.revision})
    db.commit()
    return {**lv.to_dict(), "shelved": shelved}


def _owner_only(p: DesignProject, principal: Principal):
    return None if _uid(principal) == p.owner_id else _err("Réservé au propriétaire du projet", 403)


@app.get("/design3d/levels/{level_id}/shelf")
def list_shelf(level_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    """Le propriétaire voit toutes les versions mises de côté ; tout autre auteur, les siennes.

    L'étagère entièrement réservée au propriétaire laissait le collègue qui perd
    la course sans aucun moyen de consulter sa propre version : elle était bien
    archivée, mais invisible pour lui — de son point de vue, son travail avait
    disparu. Voir la sienne ne lui donne rien de plus que ce qu'il a écrit.
    """
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    q = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.reviewed_at.is_(None))
    if _owner_only(p, principal) is not None:
        q = q.filter(DesignLevelShelf.author_id == _uid(principal))
    return {"items": [s.to_dict() for s in q.all()]}


@app.post("/design3d/levels/{level_id}/shelf/{shelf_id}/dismiss")
def dismiss_shelf(level_id: str, shelf_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    if err:
        return err
    s = db.get(DesignLevelShelf, shelf_id)
    if s is None or s.level_id != lv.id:
        return _err("Not found", 404)
    # Le propriétaire revoit toute l'étagère du niveau ; un autre auteur ne
    # peut écarter que sa propre version.
    if _owner_only(p, principal) is not None and s.author_id != _uid(principal):
        return _err("Réservé au propriétaire du projet", 403)
    s.reviewed_at = _now()
    db.commit()
    return s.to_dict()


@app.get("/design3d/sync")
def sync_summary(principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    q = db.query(DesignProject)
    q = q.filter(DesignProject.agency_id == principal.agency_id) if principal.agency_id else q.filter(DesignProject.owner_id == _uid(principal))
    out = []
    for p in q.all():
        levels = []
        for lv in _levels(db, p.id):
            shelved = db.query(DesignLevelShelf).filter(DesignLevelShelf.level_id == lv.id, DesignLevelShelf.reviewed_at.is_(None)).count()
            levels.append({"id": lv.id, "revision": lv.revision, "updated_at": lv.to_dict()["updated_at"], "shelved_count": shelved})
        out.append({"id": p.id, "status": p.status, "updated_at": p.to_dict()["updated_at"], "levels": levels})
    return {"projects": out}


_IMAGE_TYPES = {"image/png": "png", "image/jpeg": "jpg"}
_MAX_BG = 10 * 1024 * 1024
_BG_CHUNK = 1024 * 1024


class RecalibrateIn(BaseModel):
    base_revision: int
    calibration: CalibrationIn


@app.post("/design3d/levels/{level_id}/recalibrate")
def recalibrate(level_id: str, body: RecalibrateIn, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal, for_update=True)
    if err:
        return err
    if body.base_revision != lv.revision:
        return JSONResponse({"error": "Version obsolète", "level": lv.to_dict()}, status_code=409)
    new = body.calibration.model_dump()
    geometry = rescale(lv.geometry or dict(EMPTY_GEOMETRY), calibration_scale(lv.calibration, new))
    # `rescale` ne met délibérément pas à l'échelle les dimensions réelles saisies
    # (largeurs d'ouverture, hauteurs, allèges) : une recalibration à la baisse
    # raccourcit le mur sans réduire l'ouverture qu'il porte, et rompt l'invariant
    # que la 3D consommera. Seule la revalidation le rattrape.
    problems = validate_geometry(geometry, float(lv.wall_height_m))
    if problems:
        return JSONResponse({"error": "Géométrie invalide", "details": problems}, status_code=422)
    if not _claim_level(db, lv):
        db.rollback()
        return _concurrent_write()
    lv.geometry = geometry
    lv.calibration = new
    lv.revision += 1
    lv.revision_author_id = _uid(principal)
    enqueue(db, "design_level", lv.id, events.LEVEL_UPDATED, {"id": lv.id, "project_id": p.id, "revision": lv.revision})
    db.commit()
    return lv.to_dict()


@app.post("/design3d/levels/{level_id}/background")
async def upload_background(level_id: str, file: UploadFile = File(...), principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    # Verrou de ligne comme les autres écritures ; pas de réservation de révision,
    # le fond de plan n'incrémente pas `revision` (contrat du client hors-ligne).
    lv, p, err = _load_level(db, level_id, principal, for_update=True)
    if err:
        return err
    ext = _IMAGE_TYPES.get(file.content_type or "")
    if ext is None:
        return _err("Image PNG ou JPEG requise", 400)
    # Lecture par morceaux, abandonnée dès le dépassement : le plafond appliqué
    # après un `read()` intégral tamponnait d'abord l'envoi tout entier, donc ne
    # protégeait rien. La mémoire du gestionnaire reste bornée par `_MAX_BG`.
    chunks: list[bytes] = []
    read = 0
    while True:
        chunk = await file.read(_BG_CHUNK)
        if not chunk:
            break
        read += len(chunk)
        if read > _MAX_BG:
            return _err("Image trop volumineuse (10 Mo max)", 413)
        chunks.append(chunk)
    data = b"".join(chunks)
    key = f"design3d/{p.id}/{lv.id}/background.{ext}"
    storage.plans().put(key, data, file.content_type)
    lv.background_image_key = key
    db.commit()
    return lv.to_dict()


def _stream_background(lv: DesignLevel):
    if not lv.background_image_key:
        return _err("Not found", 404)
    data = storage.plans().get(lv.background_image_key)
    ctype = "image/png" if lv.background_image_key.endswith(".png") else "image/jpeg"
    return RawResponse(content=data, media_type=ctype, headers={"Cache-Control": "private, max-age=3600"})


@app.get("/design3d/levels/{level_id}/background")
def get_background(level_id: str, principal: Principal = Depends(_design3d), db: Session = Depends(get_db)):
    lv, p, err = _load_level(db, level_id, principal)
    return err or _stream_background(lv)


@app.get("/public/design3d/projects/{project_id}")
def public_project(project_id: str, db: Session = Depends(get_db)):
    p = db.get(DesignProject, project_id)
    if p is None or p.status != "ready":
        return _err("Not found", 404)
    return {**p.to_dict(public=True), "levels": [lv.to_dict(public=True) for lv in _levels(db, p.id)]}


@app.get("/public/design3d/by-target")
def public_by_target(target_type: str, target_id: int,
                     # Route ANONYME, et la seule qui renvoie la géométrie COMPLÈTE de
                     # chaque niveau (jusqu'à 512 Ko l'un) : sans borne, tout projet prêt
                     # de la cible partait dans la réponse. Bornée des deux côtés comme
                     # `list_projects`, pour la même raison (un `limit` négatif, ignoré par
                     # SQLite, est REFUSÉ par PostgreSQL — un 500 au lieu d'un 422).
                     limit: int = Query(10, ge=1, le=50),
                     db: Session = Depends(get_db)):
    projects = (db.query(DesignProject)
                  .filter(DesignProject.target_type == target_type, DesignProject.target_id == target_id,
                          DesignProject.status == "ready")
                  .order_by(DesignProject.updated_at.desc()).limit(limit).all())
    if not projects:
        return {"projects": []}
    # Les niveaux en UNE requête, jamais un `SELECT` par projet : la fiche publique
    # d'un bien ne doit pas coûter un aller-retour de plus par plan publié.
    rows = (db.query(DesignLevel)
              .filter(DesignLevel.project_id.in_([p.id for p in projects]))
              .order_by(DesignLevel.position, DesignLevel.created_at).all())
    by_project: dict[str, list[dict]] = {}
    for lv in rows:
        by_project.setdefault(lv.project_id, []).append(lv.to_dict(public=True))
    return {"projects": [{**p.to_dict(public=True), "levels": by_project.get(p.id, [])} for p in projects]}


@app.get("/public/design3d/levels/{level_id}/background")
def public_background(level_id: str, db: Session = Depends(get_db)):
    lv = db.get(DesignLevel, level_id)
    p = db.get(DesignProject, lv.project_id) if lv else None
    if lv is None or p is None or p.status != "ready" or not lv.show_background_public:
        return _err("Not found", 404)
    return _stream_background(lv)
