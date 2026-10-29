"""Équipes d'exploitation : quel bien est tenu par quelle équipe, et ce qu'elles abattent.

StayManager laissait l'hôte créer des équipes typées, y placer des membres avec un rôle, et
leur rattacher des biens (`routes/teams.py`, `routes/team.py`). Ici la moitié existait déjà :
les équipes, leurs membres et leurs rôles appartiennent à `identity`. Ce module n'ajoute que
ce qui manquait côté exploitation — le rattachement d'un bien à une équipe, et la lecture de
ce que l'équipe a réellement fait.

La performance est volontairement mesurée sur des faits déjà enregistrés (tâches faites, en
retard, rapports urgents non lus) : aucune note, aucun score inventé.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from semsar_auth import Principal, get_principal

from . import identity_client
from .db import get_db
from .gate import gate
from .models import CleaningReport, CleaningTask, PropertyRO, PropertyTeam
from .util import err, iso, json_body

router = APIRouter()

# Fenêtre de lecture de la performance : un mois, assez pour lisser une semaine creuse.
PERFORMANCE_DAYS = 30
EMPTY_PERFORMANCE = {"planned": 0, "done": 0, "late": 0, "urgent_reports": 0, "avg_minutes": None}


def team_of_property(db: Session, agency_id: int, property_id: int) -> int | None:
    row = (db.query(PropertyTeam)
           .filter(PropertyTeam.agency_id == agency_id,
                   PropertyTeam.property_id == property_id).first())
    return row.team_id if row else None


def _performance(db: Session, agency_id: int) -> dict[int, dict]:
    """Ce que chaque équipe a abattu sur la période, à partir des tâches elles-mêmes."""
    today = datetime.utcnow().date()
    since = today - timedelta(days=PERFORMANCE_DAYS)
    tasks = (db.query(CleaningTask)
             .filter(CleaningTask.agency_id == agency_id,
                     CleaningTask.team_id.isnot(None),
                     CleaningTask.scheduled_date >= since).all())
    by_team: dict[int, dict] = {}
    durations: dict[int, list[float]] = {}
    for t in tasks:
        stat = by_team.setdefault(t.team_id, dict(EMPTY_PERFORMANCE))
        stat["planned"] += 1
        if t.status == "done":
            stat["done"] += 1
            if t.started_at and t.completed_at and t.completed_at > t.started_at:
                durations.setdefault(t.team_id, []).append(
                    (t.completed_at - t.started_at).total_seconds() / 60)
        elif t.status in ("pending", "in_progress") and t.scheduled_date < today:
            stat["late"] += 1

    ids = [t.id for t in tasks]
    if ids:
        urgent = (db.query(CleaningReport)
                  .filter(CleaningReport.task_id.in_(ids), CleaningReport.is_urgent.is_(True),
                          CleaningReport.seen_at.is_(None)).all())
        task_team = {t.id: t.team_id for t in tasks}
        for r in urgent:
            team = task_team.get(r.task_id)
            if team in by_team:
                by_team[team]["urgent_reports"] += 1
    for team_id, values in durations.items():
        by_team[team_id]["avg_minutes"] = round(sum(values) / len(values))
    return by_team


@router.get("/backoffice/sejours/equipes")
def list_teams(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """Équipes de l'agence, biens qu'elles tiennent, et leur activité du dernier mois."""
    if (g := gate(principal)) is not None:
        return g
    teams = identity_client.teams(principal.agency_id)
    stats = _performance(db, principal.agency_id)
    rows = db.query(PropertyTeam).filter(PropertyTeam.agency_id == principal.agency_id).all()
    assigned = {r.property_id: r.team_id for r in rows}
    properties = (db.query(PropertyRO)
                  .filter(PropertyRO.agency_id == principal.agency_id)
                  .order_by(PropertyRO.title).all())
    return {
        "teams": [{**t, "performance": stats.get(t["id"], dict(EMPTY_PERFORMANCE))}
                  for t in teams],
        "properties": [{"property_id": p.id, "property_title": p.title,
                        "team_id": assigned.get(p.id)} for p in properties],
        "performance_days": PERFORMANCE_DAYS,
    }


@router.put("/backoffice/sejours/equipes/{property_id}")
async def assign_team(property_id: int, request: Request,
                      principal: Principal = Depends(get_principal),
                      db: Session = Depends(get_db)):
    """Confie un bien à une équipe. `team_id` nul retire l'affectation."""
    if (g := gate(principal)) is not None:
        return g
    ro = db.get(PropertyRO, property_id)
    if ro is None or ro.agency_id != principal.agency_id:
        return err("Bien introuvable dans votre portefeuille", 404)
    data = await json_body(request)
    raw = data.get("team_id")
    team_id = None
    if raw not in (None, "", 0):
        try:
            team_id = int(raw)
        except (TypeError, ValueError):
            return err("Équipe invalide", 400)
        # L'équipe vient d'identity : vérifier qu'elle existe ET qu'elle est bien de
        # l'agence, sinon un identifiant deviné rattacherait un bien à une équipe étrangère.
        if team_id not in identity_client.team_ids(principal.agency_id):
            return err("Équipe introuvable", 400)

    row = (db.query(PropertyTeam)
           .filter(PropertyTeam.agency_id == principal.agency_id,
                   PropertyTeam.property_id == property_id).first())
    if team_id is None:
        if row is not None:
            db.delete(row)
        db.commit()
        return {"property_id": property_id, "team_id": None}
    if row is None:
        row = PropertyTeam(agency_id=principal.agency_id, property_id=property_id,
                           team_id=team_id)
        db.add(row)
    else:
        row.team_id = team_id
        row.updated_at = datetime.utcnow()
    # Les tâches à venir suivent la nouvelle équipe ; celles déjà faites gardent la trace
    # de qui les a faites.
    (db.query(CleaningTask)
     .filter(CleaningTask.agency_id == principal.agency_id,
             CleaningTask.property_id == property_id,
             CleaningTask.status.in_(("pending", "in_progress")))
     .update({"team_id": team_id}, synchronize_session=False))
    db.commit()
    return {"property_id": property_id, "team_id": team_id, "updated_at": iso(row.updated_at)}
