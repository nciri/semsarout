"""Affectation automatique d'un lead à un agent — réglage « Règles » de l'agence.

Sans elle, un lead arrive dans un pot commun que personne ne s'approprie. La règle est la
plus simple qui tienne devant une équipe : l'agent de l'agence qui suit le moins de leads
encore ouverts ; à égalité, le premier de la liste, pour rester déterministe.
"""
from sqlalchemy import func

from . import agency_client, users_client
from .models import Lead

OPEN_STATUSES = ("new", "contacted", "qualified")


def auto_assign(db, lead: Lead) -> int | None:
    """Pose `lead.assigned_to_id` si l'agence l'a demandé. Renvoie l'agent retenu."""
    if lead.agency_id is None or lead.assigned_to_id is not None:
        return None
    if not agency_client.settings_of(lead.agency_id).get("lead_auto_assign"):
        return None
    agents = [a["id"] for a in users_client.agents(lead.agency_id) if a.get("id")]
    if not agents:
        return None

    counts = dict(db.query(Lead.assigned_to_id, func.count(Lead.id))
                  .filter(Lead.agency_id == lead.agency_id,
                          Lead.status.in_(OPEN_STATUSES),
                          Lead.assigned_to_id.in_(agents))
                  .group_by(Lead.assigned_to_id).all())
    lead.assigned_to_id = min(agents, key=lambda uid: (counts.get(uid, 0), agents.index(uid)))
    return lead.assigned_to_id
