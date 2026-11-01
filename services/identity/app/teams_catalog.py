"""Catalogue des métiers d'équipe et des rôles qu'on y tient.

StayManager rendait ce catalogue modifiable par l'hôte (`team_types` + `team_role_definitions`,
avec des lignes globales et des lignes clonées par compte). Ici il est **fixe** : les libellés
sont traduits en français et en arabe par le front, et une taxonomie éditable obligerait
chaque agence à inventer son vocabulaire avant de pouvoir affecter une tâche. Les métiers
couvrent ce qu'une agence immobilière marocaine fait réellement ; en ajouter un est une ligne
ici et deux clés de traduction.

Le dernier rôle de chaque métier est le plus courant : il sert de valeur par défaut quand une
agence rattache quelqu'un sans préciser.
"""

KINDS: dict[str, tuple[str, ...]] = {
    "generale": ("responsable", "membre"),
    "commerciale": ("responsable", "negociateur", "assistant"),
    "menage": ("responsable", "agent", "blanchisserie"),
    "maintenance": ("responsable", "technicien"),
    "conciergerie": ("responsable", "agent_accueil"),
}

DEFAULT_KIND = "generale"
# Métiers qui peuvent prendre en charge l'exploitation d'un bien en courte durée.
OPERATIONS_KINDS = ("menage", "maintenance", "conciergerie")


def valid_kind(kind: str | None) -> bool:
    return (kind or DEFAULT_KIND) in KINDS


def jobs_of(kind: str | None) -> tuple[str, ...]:
    return KINDS.get(kind or DEFAULT_KIND, KINDS[DEFAULT_KIND])


def valid_job(kind: str | None, job: str | None) -> bool:
    return (job or "") in jobs_of(kind)


def default_job(kind: str | None) -> str:
    return jobs_of(kind)[-1]


def catalogue() -> list[dict]:
    """Ce que le front affiche dans ses listes déroulantes."""
    return [{"kind": kind, "jobs": list(jobs), "operations": kind in OPERATIONS_KINDS}
            for kind, jobs in KINDS.items()]
